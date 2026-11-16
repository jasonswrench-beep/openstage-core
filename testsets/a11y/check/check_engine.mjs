// Checks an A11Y-1 checker against the conformance set: runs it on each case's input and compares its JSON report
// with the case's expected.json.
//   node testsets/a11y/check/check_engine.mjs --engine <path to openstage-a11y, or any program that takes
//        "check <input> --json" and prints an A11Y-1 report>
// A case passes when the report has exactly the expected findings (by rule and key, with the same status, variant and
// count, and the listed params), the listed rule statuses, the listed summary numbers, the listed checklist (when one
// is given) and each listed limit. Prints one line a case; exits 1 when one fails.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SET = join(HERE, "..");
const args = process.argv.slice(2);
const at = args.indexOf("--engine");
if (at < 0 || !args[at + 1]) {
  console.error("usage: node check_engine.mjs --engine <program>");
  process.exit(2);
}
const engine = args[at + 1];

export function compare(expected, report) {
  const problems = [];
  if (expected.kind && report.input?.kind !== expected.kind) problems.push(`input kind is ${report.input?.kind}, expected ${expected.kind}`);
  if (expected.files !== undefined && report.input?.files !== expected.files) problems.push(`${report.input?.files} files read, expected ${expected.files}`);
  const got = new Map(report.findings.map((g) => [`${g.key}`, g]));
  const wanted = new Set();
  for (const e of expected.findings) {
    wanted.add(e.key);
    const g = got.get(e.key);
    if (!g) {
      problems.push(`missing finding ${e.key} (${e.status})`);
      continue;
    }
    if (g.rule !== e.rule) problems.push(`${e.key}: rule ${g.rule}, expected ${e.rule}`);
    if (g.status !== e.status) problems.push(`${e.key}: status ${g.status}, expected ${e.status}`);
    if ((g.variant ?? null) !== (e.variant ?? null)) problems.push(`${e.key}: variant ${g.variant ?? "none"}, expected ${e.variant ?? "none"}`);
    if ((g.count ?? 1) !== (e.count ?? 1)) problems.push(`${e.key}: count ${g.count}, expected ${e.count ?? 1}`);
    for (const [k, v] of Object.entries(e.params ?? {})) {
      if ((g.params ?? {})[k] !== v) problems.push(`${e.key}: ${k} is ${JSON.stringify((g.params ?? {})[k])}, expected ${JSON.stringify(v)}`);
    }
  }
  for (const g of report.findings) if (!wanted.has(g.key)) problems.push(`unexpected finding ${g.key} (${g.status}): ${g.message}`);
  for (const [rule, status] of Object.entries(expected.rules ?? {})) {
    const r = report.rules.find((x) => x.rule === rule);
    if (!r) problems.push(`rule ${rule} is not in the report`);
    else if (r.status !== status) problems.push(`rule ${rule} is ${r.status}, expected ${status}`);
  }
  for (const [k, v] of Object.entries(expected.summary ?? {})) {
    if (report.summary[k] !== v) problems.push(`summary ${k} is ${report.summary[k]}, expected ${v}`);
  }
  if (expected.checklist) {
    const have = report.checklist.map((c) => c.rule).sort().join(", ");
    const want = [...expected.checklist].sort().join(", ");
    if (have !== want) problems.push(`checklist is [${have}], expected [${want}]`);
  }
  for (const l of expected.limits ?? []) if (!report.limits.includes(l)) problems.push(`limit not reported: ${l}`);
  return problems;
}

const ids = JSON.parse(readFileSync(join(SET, "cases.json"), "utf8"));
let failed = 0;
for (const id of ids) {
  const dir = join(SET, "cases", id);
  const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));
  let report;
  try {
    report = JSON.parse(execFileSync(engine, ["check", join(dir, expected.input), "--json"], { encoding: "utf8", maxBuffer: 64 << 20 }));
  } catch (e) {
    console.log(`${id}: FAILED, the engine did not run: ${String(e.stderr || e.message).trim()}`);
    failed++;
    continue;
  }
  const problems = compare(expected, report);
  if (problems.length === 0) console.log(`${id}: ok`);
  else {
    failed++;
    console.log(`${id}: FAILED`);
    for (const p of problems) console.log(`  ${p}`);
  }
}
console.log(failed === 0 ? `all ${ids.length} cases pass` : `${failed} of ${ids.length} cases fail`);
process.exitCode = failed === 0 ? 0 : 1;
