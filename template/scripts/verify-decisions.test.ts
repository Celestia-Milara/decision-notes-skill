import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("./verify-decisions.ts", import.meta.url));
const D = ".agents/decisions/";
const f = (status = "accepted", topic = "x", date = "2026-09-21") => `${D}${date}-${status}-${topic}.md`;
const body = `## Context\n\nc\n\n## Decision\n\nd\n\n## Alternatives\n\n- **A** — useful; rejected.\n\n## Consequences\n\n- Positive: p\n- Negative: n\n`;
const note = (status = "accepted", extra = "Applies-To: project-wide\n", content = body) => `# Decision: Example\n\nStatus: ${status}\n${extra}\n${content}`;

function run(files: Record<string, string>, args: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "vd-"));
  try {
  mkdirSync(join(root, D), { recursive: true });
  for (const [rel, text] of Object.entries(files)) { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
  const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--root", root, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const codesIn = (out: string) => [...new Set(out.match(/\bD\d{3}\b/g) ?? [])].sort();
const expectCode = (files: Record<string, string>, code: string, args: string[] = []) => { const r = run(files, args); assert.equal(r.code, 1, r.out); assert.deepEqual(codesIn(r.out), [code], r.out); };

test("valid note and empty directory pass", () => {
  let r = run({ [f("accepted", "example")]: note() }); assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, / error D/);
  r = run({ [`${D}.gitkeep`]: "" }); assert.equal(r.code, 0, r.out);
});
test("filename and directory rules", () => {
  expectCode({ [`${D}Bad_Name.md`]: note() }, "D020");
  expectCode({ [`${D}2026-09-21-x.md`]: note() }, "D020");
  expectCode({ [`${D}2026-09-21-pending-x.md`]: note() }, "D020");
  expectCode({ [f("accepted", "x", "2026-02-30")]: note() }, "D021");
  expectCode({ [`${D}architecture/x.md`]: note() }, "D010");
});
test("filename status must match the header Status", () => {
  expectCode({ [f("proposed")]: note("accepted") }, "D022");
  expectCode({ [f("accepted")]: note("proposed") }, "D022");
  expectCode({ [f("superseded", "a", "2026-09-20")]: note("accepted") }, "D022");
  const r = run({ [f("accepted")]: note("accepted") }); assert.equal(r.code, 0, r.out);
  const bad = run({ [f("accepted")]: note("done") }); assert.doesNotMatch(bad.out, /D022/);
});
test("title and headers", () => {
  expectCode({ [f()]: note().replace("# Decision:", "# Note:") }, "D030");
  expectCode({ [f()]: note().replace("Status:", "Owner: me\nStatus:") }, "D031");
  expectCode({ [f()]: note("done") }, "D040");
  expectCode({ [f()]: note("accepted", "") }, "D050");
});
test("UTF-8 BOM and CRLF notes parse", () => {
  const r = run({ [f()]: "\uFEFF" + note().replace(/\n/g, "\r\n") });
  assert.equal(r.code, 0, r.out);
});
test("section structure and bodies", () => {
  expectCode({ [f()]: note("accepted", undefined, body.replace("## Alternatives\n\n- **A** — useful; rejected.\n\n", "")) }, "D060");
  expectCode({ [f()]: note("accepted", undefined, body.replace("## Context\n\nc\n\n## Decision\n\nd", "## Decision\n\nd\n\n## Context\n\nc")) }, "D060");
  expectCode({ [f()]: note("accepted", undefined, `${body}\n## Notes\n\nx`) }, "D060");
  expectCode({ [f()]: note("accepted", undefined, body.replace("## Context\n\nc", "## Context\n\n<!-- empty -->")) }, "D060");
});
test("alternatives and consequences", () => {
  expectCode({ [f()]: note("accepted", undefined, body.replace("- **A** — useful; rejected.", "plain text")) }, "D070");
  expectCode({ [f()]: note("accepted", undefined, body.replace("- **A** — useful; rejected.", "None — reason.")) }, "D071");
  const linked = note("accepted", undefined, body.replace("- **A** — useful; rejected.", "None — see [other](./2026-09-20-accepted-other.md)."));
  const r = run({ [f()]: linked, [f("accepted", "other", "2026-09-20")]: note() }); assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /D07[01]/);
  expectCode({ [f()]: note("accepted", undefined, body.replace("- Negative: n", "")) }, "D080");
});
test("links ignore fences and detect missing targets", () => {
  expectCode({ [f()]: note().replace("\n\nc\n\n", "\n\n[bad](./missing.md)\n\n") }, "D090");
  const r = run({ [f()]: note().replace("\n\nc\n\n", "\n\nc\n\n```md\n[bad](./missing.md)\n```\n\n") }); assert.equal(r.code, 0, r.out);
});
test("header values tolerate trailing whitespace", () => {
  const r = run({ [f()]: note().replace("Status: accepted", "Status: accepted   ").replace("Applies-To: project-wide", "Applies-To: project-wide  ") });
  assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /D0[245]/);
});
test("links skip HTML comments and multi-backtick code spans", () => {
  for (const snippet of ["<!-- [bad](./missing.md) -->", "<!--\n[bad](./missing.md)\n-->", "``see [bad](./missing.md)``", "```\n[bad](./missing.md)\n```"]) {
    const r = run({ [f()]: note().replace("\n\nc\n\n", `\n\nc\n\n${snippet}\n\n`) });
    assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /D090/);
  }
});
test("superseded fields, chains, cycles, and endpoints", () => {
  expectCode({ [f("superseded", "a")]: note("superseded", "") }, "D100");
  expectCode({ [f("accepted", "a")]: note("accepted", "Applies-To: project-wide\nSuperseded-By: 2026-09-22-accepted-b.md\n"), [f("accepted", "b", "2026-09-22")]: note() }, "D100");
  expectCode({ [f("superseded", "a")]: note("superseded", "Superseded-By: nope.md\n") }, "D101");
  expectCode({ [f("superseded", "a")]: note("superseded", "Superseded-By: 2026-09-21-superseded-a.md\n") }, "D101");
  let r = run({ [f("superseded", "a", "2026-09-19")]: note("superseded", "Superseded-By: 2026-09-20-superseded-b.md\n"), [f("superseded", "b", "2026-09-20")]: note("superseded", "Superseded-By: 2026-09-21-accepted-c.md\n"), [f("accepted", "c")]: note() }); assert.equal(r.code, 0, r.out);
  expectCode({ [f("superseded", "a", "2026-09-20")]: note("superseded", "Superseded-By: 2026-09-21-superseded-b.md\n"), [f("superseded", "b")]: note("superseded", "Superseded-By: 2026-09-20-superseded-a.md\n") }, "D102");
  expectCode({ [f("superseded", "a", "2026-09-20")]: note("superseded", "Superseded-By: 2026-09-21-rejected-b.md\n"), [f("rejected", "b")]: note("rejected") }, "D103");
});
test("code references and markdown examples", () => {
  let r = run({ [f()]: note(), "src/a.ts": "// Decision" + ": 2026-09-21-accepted-x.md" }); assert.equal(r.code, 0, r.out);
  expectCode({ [f()]: note(), "src/a.ts": "// Decision" + ": 2026-09-22-accepted-missing.md" }, "D110");
  expectCode({ [f()]: note(), "src/a.ts": "// Decision" + ": 2026-09-22-x.md" }, "D112");
  expectCode({ [f()]: note(), "src/a.ts": "// Decision" + ":" }, "D112");
  r = run({ [f()]: note(), "README.md": "// Decision" + ": 2026-09-22-accepted-missing.md" }); assert.equal(r.code, 0, r.out);
  r = run({ [f("superseded", "a", "2026-09-20")]: note("superseded", "Superseded-By: 2026-09-21-accepted-b.md\n"), [f("accepted", "b")]: note(), "src/a.ts": "// Decision" + ": 2026-09-20-superseded-a.md" }); assert.equal(r.code, 0, r.out); assert.match(r.out, /D111/);
});
test("stale Applies-To and strict mode", () => {
  let r = run({ [f()]: note("accepted", "Applies-To: src/missing/**\n") }); assert.equal(r.code, 0, r.out); assert.match(r.out, /D051/);
  r = run({ [f()]: note("accepted", "Applies-To: src/missing/**\n") }, ["--strict"]); assert.equal(r.code, 1, r.out);
  r = run({ [f("proposed", "x", "2020-01-01")]: note("proposed") }); assert.equal(r.code, 0, r.out); assert.match(r.out, /D120/);
});
test("globstar matches whole path segments", () => {
  let r = run({ [f()]: note("accepted", "Applies-To: src/**/worker.ts\n"), "src/worker.ts": "" }, ["--strict"]);
  assert.equal(r.code, 0, r.out);
  r = run({ [f()]: note("accepted", "Applies-To: src/**/worker.ts\n"), "src/nested/worker.ts": "" }, ["--strict"]);
  assert.equal(r.code, 0, r.out);
  r = run({ [f()]: note("accepted", "Applies-To: src/**/worker.ts\n"), "src/myworker.ts": "" }, ["--strict"]);
  assert.equal(r.code, 1, r.out); assert.match(r.out, /D051/);
  r = run({ [f()]: note("accepted", "Applies-To: **/worker.ts\n"), "coworker.ts": "" }, ["--strict"]);
  assert.equal(r.code, 1, r.out); assert.match(r.out, /D051/);
});

test("unsupported glob syntax reports D052 instead of D051", () => {
  const files = { [f()]: note("accepted", "Applies-To: src/**/*.{ts,js}\n"), "src/a.ts": "" };
  let r = run(files); assert.equal(r.code, 1, r.out); assert.match(r.out, /D052/); assert.doesNotMatch(r.out, /D051/);
  r = run({ [f()]: note("accepted", "Applies-To: src/[abc]/**\n") }); assert.equal(r.code, 1, r.out); assert.match(r.out, /D052/);
  r = run({ [f()]: note("accepted", "Applies-To: src/**/*.{ts,js}, src/**\n"), "src/a.ts": "" }); assert.equal(r.code, 1, r.out); assert.match(r.out, /D052/); assert.doesNotMatch(r.out, /D051/);
});

test("None must link to an existing decision within Alternatives", () => {
  const none = body.replace("- **A** — useful; rejected.", "None — constrained.");
  expectCode({ [f()]: note("accepted", undefined, none.replace("\n\nc\n\n", "\n\n[other](./2026-09-20-accepted-other.md)\n\n")), [f("accepted", "other", "2026-09-20")]: note() }, "D071");
  expectCode({ [f()]: note("accepted", undefined, none.replace("None — constrained.", "None — [placeholder](./.gitkeep).")), [`${D}.gitkeep`]: "" }, "D071");
});

test("Applies-To cannot be satisfied by the decision note itself", () => {
  const r = run({ [f()]: note("accepted", "Applies-To: .agents/decisions/**\n") }, ["--strict"]);
  assert.equal(r.code, 1, r.out); assert.match(r.out, /D051/);
});

test("CLI rejects unknown or incomplete arguments", () => {
  for (const args of [["--unknown"], ["--root"], ["--root", "--strict"], ["--root", "--help"]]) {
    const r = run({}, args); assert.equal(r.code, 2, r.out); assert.match(r.out, /unknown or incomplete argument/);
  }
});

test("explicit root without a decisions directory reports D000", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-empty-"));
  try {
    const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--root", root], { encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, /D000/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("installed skill may omit an empty decisions directory", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-no-decisions-"));
  try {
    const skill = join(root, ".agents", "skills", "decision-notes", "SKILL.md");
    mkdirSync(dirname(skill), { recursive: true }); writeFileSync(skill, "# skill\n");
    const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--root", root], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.doesNotMatch(r.stdout, /D000/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("help succeeds without a decisions directory", () => {
  const root = mkdtempSync(join(tmpdir(), "vd-help-"));
  try {
    for (const flag of ["--help", "-h"]) {
      const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--root", root, flag], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /Usage:/);
      assert.doesNotMatch(r.stdout, /D000/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("file discovery uses git ls-files inside a git repository", (t) => {
  if (spawnSync("git", ["--version"], { encoding: "utf8" }).status !== 0) return t.skip("git is not available");
  const root = mkdtempSync(join(tmpdir(), "vd-git-"));
  try {
    mkdirSync(join(root, D), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "ignored"), { recursive: true });
    writeFileSync(join(root, D, "2026-09-21-accepted-x.md"), note());
    writeFileSync(join(root, "src", "a.ts"), "// Decision" + ": 2026-09-22-accepted-missing.md");
    writeFileSync(join(root, "ignored", "b.ts"), "// Decision" + ": 2026-09-23-accepted-missing.md");
    writeFileSync(join(root, ".gitignore"), "ignored/\n");
    for (const args of [["init", "-q"], ["add", "-A"]]) {
      const g = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
      assert.equal(g.status, 0, g.stdout + g.stderr);
    }
    const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--root", root], { encoding: "utf8" });
    const out = r.stdout + r.stderr;
    assert.equal(r.status, 1, out);
    assert.match(out, /src\/a\.ts:1: error D110/);
    assert.doesNotMatch(out, /ignored\/b\.ts/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
