import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

type Level = "error" | "warning";
type Status = "proposed" | "accepted" | "rejected" | "superseded";
type Diagnostic = { file: string; line: number; level: Level; code: string; message: string };
type Field = { value: string; line: number };
type Section = { name: string; line: number; body: string };
type Note = { file: string; path: string; lines: string[]; title?: string; header: Map<string, Field>; status?: Status; sections: Section[]; parse: Diagnostic[] };
type Ctx = { root: string; notes: Map<string, Note>; repoFiles: string[] };

const STATUSES: Status[] = ["proposed", "accepted", "rejected", "superseded"];
const HEADERS = new Set(["Status", "Applies-To", "Superseded-By"]);
const SECTIONS = ["Context", "Decision", "Alternatives", "Consequences"];
const FILE_RE = /^\d{4}-\d{2}-\d{2}-(proposed|accepted|rejected|superseded)-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const posix = (p: string) => p.split(sep).join("/");
const diag = (n: Pick<Note, "path">, code: string, level: Level, message: string, line = 1): Diagnostic => ({ file: n.path, line, level, code, message });

function parseNote(path: string, file: string, text: string): Note {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/), header = new Map<string, Field>(), parse: Diagnostic[] = [];
  const title = lines[0]?.match(/^# Decision:\s*(\S.*)$/)?.[1];
  const n: Note = { file, path, lines, title, header, sections: [], parse };
  if (!title) parse.push(diag(n, "D030", "error", "first line must be '# Decision: <title>'"));
  let i = 1;
  while (i < lines.length && !lines[i].trim()) i++;
  while (i < lines.length) {
    const m = lines[i].match(/^([A-Za-z][A-Za-z-]*):\s*(.*)$/);
    if (!m) break;
    const [, key, raw] = m, value = raw.trim();
    if (!HEADERS.has(key) || header.has(key)) parse.push(diag(n, "D031", "error", `${header.has(key) ? "duplicate" : "unknown"} header key "${key}"`, i + 1));
    else header.set(key, { value, line: i + 1 });
    i++;
  }
  n.status = STATUSES.includes(header.get("Status")?.value as Status) ? header.get("Status")!.value as Status : undefined;
  let fence = false, start = -1, name = "";
  const finish = (end: number) => { if (start >= 0) n.sections.push({ name, line: start + 1, body: lines.slice(start + 1, end).join("\n").replace(/<!--[\s\S]*?-->/g, "").trim() }); };
  lines.forEach((line, ix) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return; }
    if (!fence) { const m = line.match(/^## (.+?)\s*$/); if (m) { finish(ix); start = ix; name = m[1]; } }
  });
  finish(lines.length);
  return n;
}

function enumerate(root: string): { notes: Note[]; diagnostics: Diagnostic[] } {
  const dir = join(root, ".agents", "decisions"), diagnostics: Diagnostic[] = [], notes: Note[] = [];
  if (!existsSync(dir)) return { notes, diagnostics: [{ file: ".agents/decisions", line: 1, level: "error", code: "D000", message: "decision directory does not exist" }] };
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = `.agents/decisions/${e.name}`;
    if (e.isDirectory() || (!e.name.endsWith(".md") && e.name !== ".gitkeep")) { diagnostics.push({ file: rel, line: 1, level: "error", code: "D010", message: "decision directory must be flat and contain only .md files" }); continue; }
    if (e.name.endsWith(".md")) try { notes.push(parseNote(rel, e.name, readFileSync(join(dir, e.name), "utf8"))); }
    catch (err) { diagnostics.push({ file: rel, line: 1, level: "error", code: "D010", message: `cannot read file: ${String(err)}` }); }
  }
  return { notes, diagnostics };
}

function verifyFilename(n: Note): Diagnostic[] {
  const m = n.file.match(FILE_RE);
  if (!m) return [diag(n, "D020", "error", "invalid decision filename")];
  const date = n.file.slice(0, 10), d = new Date(`${date}T00:00:00Z`), out: Diagnostic[] = [];
  if (Number.isNaN(+d) || d.toISOString().slice(0, 10) !== date) out.push(diag(n, "D021", "error", `invalid calendar date "${date}"`));
  if (n.status && m[1] !== n.status) out.push(diag(n, "D022", "error", `filename status "${m[1]}" does not match Status: ${n.status}`));
  return out;
}
function verifyHeader(n: Note): Diagnostic[] {
  const out = [...n.parse], raw = n.header.get("Status");
  if (!n.status) out.push(diag(n, "D040", "error", `Status must be one of ${STATUSES.join("|")}${raw ? ` (got "${raw.value}")` : ""}`, raw?.line));
  const applies = n.header.get("Applies-To");
  if (n.status !== "superseded" && !applies?.value.trim()) out.push(diag(n, "D050", "error", "Applies-To is required unless superseded", applies?.line));
  return out;
}
function links(n: Note): { href: string; line: number }[] {
  const out: { href: string; line: number }[] = []; let fence = false, comment = false;
  n.lines.forEach((raw, ix) => {
    if (/^\s*(```|~~~)/.test(raw)) { fence = !fence; return; }
    if (fence) return;
    let line = raw;
    for (;;) { if (comment) { const end = line.indexOf("-->"); if (end < 0) { line = ""; break; } comment = false; line = line.slice(end + 3); } const start = line.indexOf("<!--"); if (start < 0) break; const end = line.indexOf("-->", start + 4); if (end < 0) { comment = true; line = line.slice(0, start); break; } line = line.slice(0, start) + line.slice(end + 3); }
    const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g; let m;
    while ((m = re.exec(line.replace(/(`+)[^`]*?\1/g, "")))) out.push({ href: m[1], line: ix + 1 });
  }); return out;
}
function verifySections(n: Note, ctx: Ctx): Diagnostic[] {
  const out: Diagnostic[] = [], names = n.sections.map(s => s.name);
  if (names.length !== 4 || names.some((x, i) => x !== SECTIONS[i])) out.push(diag(n, "D060", "error", `sections must be exactly: ${SECTIONS.join(", ")}`, n.sections[0]?.line));
  for (const s of n.sections) if (!s.body) out.push(diag(n, "D060", "error", `section ${s.name} is empty`, s.line));
  const alt = n.sections.find(s => s.name === "Alternatives");
  if (alt?.body) { const first = alt.body.split(/\r?\n/).find(x => x.trim())!;
    if (/^None\b/.test(first.trim())) { const valid = links(n).some(x => { if (x.line <= alt.line || x.line >= (n.sections[n.sections.indexOf(alt) + 1]?.line ?? Infinity)) return false; const t = normalizeLink(n, x.href); return t && t.file !== n.file && t.inside && ctx.notes.has(t.file); }); if (!valid) out.push(diag(n, "D071", "error", "None alternative must link to another decision note", alt.line)); }
    else if (!/^\s*[-*]\s+\S/m.test(alt.body)) out.push(diag(n, "D070", "error", "Alternatives must contain a list item or a valid None form", alt.line));
  }
  const con = n.sections.find(s => s.name === "Consequences");
  if (con?.body) for (const label of ["Positive", "Negative"]) if (!new RegExp(`^\\s*[-*]\\s+${label}:\\s*\\S`, "m").test(con.body)) out.push(diag(n, "D080", "error", `Consequences is missing - ${label}: <text>`, con.line));
  return out;
}
function normalizeLink(n: Note, href: string): { path: string; file: string; inside: boolean } | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return;
  try { const clean = decodeURI(href.split(/[?#]/)[0]), path = posix(join(dirname(n.path), clean)); return { path, file: path.split("/").at(-1)!, inside: posix(dirname(path)) === posix(dirname(n.path)) }; } catch { return { path: "", file: "", inside: false }; }
}
function verifyLinks(n: Note, root: string): Diagnostic[] { return links(n).flatMap(x => { const t = normalizeLink(n, x.href); return t && (!t.path || !existsSync(resolve(root, t.path))) ? [diag(n, "D090", "error", `link target does not exist: ${x.href}`, x.line)] : []; }); }
const target = (n: Note) => n.header.get("Superseded-By")?.value.trim().replace(/^\.\//, "");
function verifySuperseded(n: Note, ctx: Ctx): Diagnostic[] {
  const out: Diagnostic[] = [], f = n.header.get("Superseded-By"), t = target(n);
  if (n.status === "superseded" && !f?.value.trim()) out.push(diag(n, "D100", "error", "superseded note requires Superseded-By", f?.line));
  if (n.status !== "superseded" && f) out.push(diag(n, "D100", "error", "Superseded-By is only allowed on superseded notes", f.line));
  if (f && (!t || !FILE_RE.test(t) || t.includes("/") || t === n.file || !ctx.notes.has(t))) out.push(diag(n, "D101", "error", `invalid Superseded-By target "${f.value}"`, f.line));
  return out;
}
function checkChains(ctx: Ctx): Diagnostic[] { const out: Diagnostic[] = [];
  for (const n of ctx.notes.values()) { if (n.status !== "superseded") continue; const seen = new Set([n.file]); let cur = n, cycle = false;
    while (cur.status === "superseded") { const t = target(cur); if (!t || t === cur.file || !FILE_RE.test(t) || t.includes("/")) break; const next = ctx.notes.get(t); if (!next) break; if (seen.has(next.file)) { out.push(diag(n, "D102", "error", `supersede cycle: ${[...seen, next.file].join(" -> ")}`)); cycle = true; break; } seen.add(next.file); cur = next; }
    if (!cycle && cur.status !== "superseded" && cur.status !== "accepted") out.push(diag(n, "D103", "error", `chain ends at ${cur.file} which is ${cur.status}, expected accepted`));
  } return out;
}
function globToRegExp(glob: string): RegExp { const g = glob.replace(/^\.\//, "").replace(/\/+$/, ""); let re = "";
  for (let i = 0; i < g.length; i++) { const c = g[i]; if (c === "*" && g[i + 1] === "*") { re += ".*"; i++; if (g[i + 1] === "/") i++; } else if (c === "*") re += "[^/]*"; else if (c === "?") re += "[^/]"; else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&"); }
  return new RegExp(`^${re}(/.*)?$`);
}
function unsupportedGlob(p: string): boolean { return /[{}\[\]!]/.test(p); }
function verifyApplyTo(n: Note, ctx: Ctx): Diagnostic[] { if (n.status !== "accepted") return []; const f = n.header.get("Applies-To"), pats = f?.value.split(",").map(x => x.trim()).filter(x => x && x !== "project-wide") ?? [], bad = pats.filter(unsupportedGlob), usable = pats.filter(p => !unsupportedGlob(p)), out: Diagnostic[] = [];
  if (bad.length) out.push(diag(n, "D052", "error", `Applies-To uses unsupported glob syntax (only *, ** and ? are supported), so these patterns are ignored: ${bad.join(", ")}`, f?.line));
  if (usable.length && !usable.some(p => ctx.repoFiles.some(x => !x.startsWith(".agents/decisions/") && globToRegExp(p).test(x)))) out.push(diag(n, "D051", "warning", "accepted Applies-To does not match any repository file", f?.line));
  return out;
}
function getRepoFiles(root: string): string[] { try { return execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean).map(posix); }
  catch { const out: string[] = [], skip = new Set([".git", "node_modules", "dist", "build", "coverage", ".next"]); const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (skip.has(e.name)) continue; const p = join(dir, e.name); if (e.isDirectory()) walk(p); else out.push(posix(relative(root, p))); } }; walk(root); return out; } }
function verifyCodeRefs(ctx: Ctx): Diagnostic[] { const out: Diagnostic[] = [], re = /Decision:\s*(?:\.{0,2}\/)?(?:\.agents\/decisions\/)?(\d{4}-\d{2}-\d{2}-(?:proposed|accepted|rejected|superseded)-[a-z0-9]+(?:-[a-z0-9]+)*\.md)/g;
  for (const file of ctx.repoFiles) { if (file.startsWith(".agents/") || /\.mdx?$/.test(file)) continue; const abs = join(ctx.root, file); try { if (!lstatSync(abs).isFile() || statSync(abs).size > 1_048_576) continue; const buf = readFileSync(abs); if (buf.subarray(0, 8192).includes(0)) continue; const text = buf.toString("utf8"), lines = text.split(/\r?\n/); lines.forEach((line, ix) => { re.lastIndex = 0; let m; while ((m = re.exec(line))) { const note = ctx.notes.get(m[1]); if (!note) out.push({ file, line: ix + 1, level: "error", code: "D110", message: `Decision reference does not exist: ${m[1]}` }); else if (note.status === "superseded" || note.status === "rejected") out.push({ file, line: ix + 1, level: "warning", code: "D111", message: `Decision reference points to ${note.status} note: ${m[1]}` }); } }); } catch { /* transient/unreadable files are ignored */ } }
  return out;
}
function verifyStale(n: Note): Diagnostic[] { if (n.status !== "proposed" || !FILE_RE.test(n.file)) return []; const days = (Date.now() - +new Date(`${n.file.slice(0, 10)}T00:00:00Z`)) / 86_400_000; return days > 14 ? [diag(n, "D120", "warning", `proposed for ${Math.floor(days)} days; move to accepted/rejected or confirm it is deferred`)] : []; }

function main() { try { let root = process.cwd(), strict = false; const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) { if (args[i] === "--help" || args[i] === "-h") continue; else if (args[i] === "--strict") strict = true; else if (args[i] === "--root" && args[i + 1] && !args[i + 1].startsWith("-")) root = resolve(args[++i]); else throw new Error(`unknown or incomplete argument: ${args[i]}`); }
    if (args.includes("--help") || args.includes("-h")) {
      console.log("Usage: verify-decisions [--root <dir>] [--strict] [--help|-h]\n\nChecks <root>/.agents/decisions/ without modifying files.\n--root <dir>  Project root (default: current working directory).\n--strict      Treat warnings as failures.\n--help, -h    Show help without scanning files.\n\nExit codes: 0 = pass/help, 1 = validation failure, 2 = argument/runtime error.");
      return;
    }
    const found = enumerate(root), map = new Map(found.notes.map(n => [n.file, n])), ctx: Ctx = { root, notes: map, repoFiles: getRepoFiles(root) }; let ds = [...found.diagnostics];
    for (const n of found.notes) ds.push(...verifyFilename(n), ...verifyHeader(n), ...verifySections(n, ctx), ...verifyLinks(n, root), ...verifySuperseded(n, ctx), ...verifyApplyTo(n, ctx), ...verifyStale(n));
    ds.push(...checkChains(ctx), ...verifyCodeRefs(ctx)); ds.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
    ds.forEach(d => console.log(`${d.file}:${d.line}: ${d.level} ${d.code} ${d.message}`)); const errors = ds.filter(d => d.level === "error").length, warnings = ds.length - errors;
    console.log(`verify-decisions: ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"} in ${found.notes.length} notes`); process.exitCode = errors || (strict && warnings) ? 1 : 0;
  } catch (err) { console.error(`verify-decisions: ${err instanceof Error ? err.message : String(err)}`); process.exitCode = 2; } }
main();
