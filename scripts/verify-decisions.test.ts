import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("./verify-decisions.ts", import.meta.url));
const D = ".agents/decisions/";
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
const expectCode = (files: Record<string, string>, code: string, args: string[] = []) => { const r = run(files, args); assert.match(r.out, new RegExp(`\\b${code}\\b`)); assert.equal(r.code, 1); };

test("valid note and empty directory pass", () => {
  let r = run({ [`${D}2026-09-21-example.md`]: note() }); assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, / error D/);
  r = run({ [`${D}.gitkeep`]: "" }); assert.equal(r.code, 0, r.out);
});
test("filename and directory rules", () => {
  expectCode({ [`${D}Bad_Name.md`]: note() }, "D020");
  expectCode({ [`${D}2026-02-30-x.md`]: note() }, "D021");
  expectCode({ [`${D}architecture/x.md`]: note() }, "D010");
});
test("title and headers", () => {
  expectCode({ [`${D}2026-09-21-x.md`]: note().replace("# Decision:", "# Note:") }, "D030");
  expectCode({ [`${D}2026-09-21-x.md`]: note().replace("Status:", "Owner: me\nStatus:") }, "D031");
  expectCode({ [`${D}2026-09-21-x.md`]: note("done") }, "D040");
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", "") }, "D050");
});
test("section structure and bodies", () => {
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", undefined, body.replace("## Alternatives\n\n- **A** — useful; rejected.\n\n", "")) }, "D060");
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", undefined, body.replace("## Context\n\nc\n\n## Decision\n\nd", "## Decision\n\nd\n\n## Context\n\nc")) }, "D060");
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", undefined, `${body}\n## Notes\n\nx`) }, "D060");
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", undefined, body.replace("## Context\n\nc", "## Context\n\n<!-- empty -->")) }, "D060");
});
test("alternatives and consequences", () => {
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", undefined, body.replace("- **A** — useful; rejected.", "plain text")) }, "D070");
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", undefined, body.replace("- **A** — useful; rejected.", "None — reason.")) }, "D071");
  const linked = note("accepted", undefined, body.replace("- **A** — useful; rejected.", "None — see [other](./2026-09-20-other.md)."));
  const r = run({ [`${D}2026-09-21-x.md`]: linked, [`${D}2026-09-20-other.md`]: note() }); assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /D07[01]/);
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", undefined, body.replace("- Negative: n", "")) }, "D080");
});
test("links ignore fences and detect missing targets", () => {
  expectCode({ [`${D}2026-09-21-x.md`]: note().replace("\n\nc\n\n", "\n\n[bad](./missing.md)\n\n") }, "D090");
  const r = run({ [`${D}2026-09-21-x.md`]: note().replace("\n\nc\n\n", "\n\nc\n\n```md\n[bad](./missing.md)\n```\n\n") }); assert.equal(r.code, 0, r.out);
});
test("header values tolerate trailing whitespace", () => {
  const r = run({ [`${D}2026-09-21-x.md`]: note().replace("Status: accepted", "Status: accepted   ").replace("Applies-To: project-wide", "Applies-To: project-wide  ") });
  assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /D0[45]/);
});
test("links skip HTML comments and multi-backtick code spans", () => {
  for (const snippet of ["<!-- [bad](./missing.md) -->", "<!--\n[bad](./missing.md)\n-->", "``see [bad](./missing.md)``", "```\n[bad](./missing.md)\n```"]) {
    const r = run({ [`${D}2026-09-21-x.md`]: note().replace("\n\nc\n\n", `\n\nc\n\n${snippet}\n\n`) });
    assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /D090/);
  }
});
test("superseded fields, chains, cycles, and endpoints", () => {
  expectCode({ [`${D}2026-09-21-a.md`]: note("superseded", "") }, "D100");
  expectCode({ [`${D}2026-09-21-a.md`]: note("accepted", "Applies-To: project-wide\nSuperseded-By: 2026-09-22-b.md\n") }, "D100");
  expectCode({ [`${D}2026-09-21-a.md`]: note("superseded", "Superseded-By: nope.md\n") }, "D101");
  expectCode({ [`${D}2026-09-21-a.md`]: note("superseded", "Superseded-By: 2026-09-21-a.md\n") }, "D101");
  let r = run({ [`${D}2026-09-19-a.md`]: note("superseded", "Superseded-By: 2026-09-20-b.md\n"), [`${D}2026-09-20-b.md`]: note("superseded", "Superseded-By: 2026-09-21-c.md\n"), [`${D}2026-09-21-c.md`]: note() }); assert.equal(r.code, 0, r.out);
  expectCode({ [`${D}2026-09-20-a.md`]: note("superseded", "Superseded-By: 2026-09-21-b.md\n"), [`${D}2026-09-21-b.md`]: note("superseded", "Superseded-By: 2026-09-20-a.md\n") }, "D102");
  expectCode({ [`${D}2026-09-20-a.md`]: note("superseded", "Superseded-By: 2026-09-21-b.md\n"), [`${D}2026-09-21-b.md`]: note("rejected") }, "D103");
});
test("code references and markdown examples", () => {
  let r = run({ [`${D}2026-09-21-x.md`]: note(), "src/a.ts": "// Decision" + ": 2026-09-21-x.md" }); assert.equal(r.code, 0, r.out);
  expectCode({ [`${D}2026-09-21-x.md`]: note(), "src/a.ts": "// Decision" + ": 2026-09-22-missing.md" }, "D110");
  r = run({ [`${D}2026-09-21-x.md`]: note(), "README.md": "// Decision" + ": 2026-09-22-missing.md" }); assert.equal(r.code, 0, r.out);
  r = run({ [`${D}2026-09-20-a.md`]: note("superseded", "Superseded-By: 2026-09-21-b.md\n"), [`${D}2026-09-21-b.md`]: note(), "src/a.ts": "// Decision" + ": 2026-09-20-a.md" }); assert.equal(r.code, 0, r.out); assert.match(r.out, /D111/);
});
test("stale Applies-To and strict mode", () => {
  let r = run({ [`${D}2026-09-21-x.md`]: note("accepted", "Applies-To: src/missing/**\n") }); assert.equal(r.code, 0, r.out); assert.match(r.out, /D051/);
  r = run({ [`${D}2026-09-21-x.md`]: note("accepted", "Applies-To: src/missing/**\n") }, ["--strict"]); assert.equal(r.code, 1, r.out);
  r = run({ [`${D}2020-01-01-x.md`]: note("proposed") }); assert.equal(r.code, 0, r.out); assert.match(r.out, /D120/);
});
test("unsupported glob syntax reports D052 instead of D051", () => {
  const files = { [`${D}2026-09-21-x.md`]: note("accepted", "Applies-To: src/**/*.{ts,js}\n"), "src/a.ts": "" };
  let r = run(files); assert.equal(r.code, 1, r.out); assert.match(r.out, /D052/); assert.doesNotMatch(r.out, /D051/);
  r = run({ [`${D}2026-09-21-x.md`]: note("accepted", "Applies-To: src/[abc]/**\n") }); assert.equal(r.code, 1, r.out); assert.match(r.out, /D052/);
  r = run({ [`${D}2026-09-21-x.md`]: note("accepted", "Applies-To: src/**/*.{ts,js}, src/**\n"), "src/a.ts": "" }); assert.equal(r.code, 1, r.out); assert.match(r.out, /D052/); assert.doesNotMatch(r.out, /D051/);
});

test("None must link to an existing decision within Alternatives", () => {
  const none = body.replace("- **A** — useful; rejected.", "None — constrained.");
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", undefined, none.replace("\n\nc\n\n", "\n\n[other](./2026-09-20-other.md)\n\n")), [`${D}2026-09-20-other.md`]: note() }, "D071");
  expectCode({ [`${D}2026-09-21-x.md`]: note("accepted", undefined, none.replace("None — constrained.", "None — [placeholder](./.gitkeep).")), [`${D}.gitkeep`]: "" }, "D071");
});

test("Applies-To cannot be satisfied by the decision note itself", () => {
  const r = run({ [`${D}2026-09-21-x.md`]: note("accepted", "Applies-To: .agents/decisions/**\n") }, ["--strict"]);
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