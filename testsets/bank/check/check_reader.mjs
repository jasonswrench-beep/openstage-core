// Checks a bank reader against the test set: reads each case's bank and compares what it gives with expected.json.
//   node testsets/bank/check/check_reader.mjs [--module <path to a module that exports readBank, as @openstage/bank does>]
// With no --module it checks the core's own package (packages/bank). A case passes when:
//   - a case with "error" makes readBank throw an error whose `code` is that;
//   - otherwise every listed bank field matches, the questions are exactly the listed ids in that order with each
//     listed field matching, each listed picture file gives bytes of that length and SHA-256 (or none), and the
//     problems are exactly the listed ones, each matched by file, question id, whether the question was skipped, and
//     a piece of its message.
// "Matching": a listed object's listed members match (members not listed are not checked); a listed array has exactly
// that many entries, each matching; anything else is equal. Prints a line a case; exits 1 when one fails.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SET = join(dirname(fileURLToPath(import.meta.url)), "..");

export function match(want, got, path, problems) {
  if (Array.isArray(want)) {
    if (!Array.isArray(got)) return problems.push(`${path}: expected a list, got ${JSON.stringify(got)}`);
    if (got.length !== want.length) return problems.push(`${path}: ${got.length} entries, expected ${want.length}`);
    want.forEach((w, i) => match(w, got[i], `${path}[${i}]`, problems));
  } else if (want !== null && typeof want === "object") {
    if (got === null || typeof got !== "object") return problems.push(`${path}: expected an object, got ${JSON.stringify(got)}`);
    for (const [k, w] of Object.entries(want)) match(w, got[k], `${path}.${k}`, problems);
  } else if (want !== got) {
    problems.push(`${path}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  }
}

export async function checkCase(readBank, id) {
  const dir = join(SET, "cases", id);
  const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));
  const bytes = new Uint8Array(readFileSync(join(dir, expected.input)));
  const problems = [];
  let bank;
  try {
    bank = await readBank(bytes);
  } catch (e) {
    if (expected.error) {
      if (e.code !== expected.error) problems.push(`error ${e.code}, expected ${expected.error}`);
    } else problems.push(`readBank threw: ${e.message}`);
    return problems;
  }
  if (expected.error) return [`read the file, expected the error ${expected.error}`];
  if (expected.bank) match(expected.bank, bank, "bank", problems);
  const wantIds = expected.questions.map((q) => q.id);
  const gotIds = bank.questions.map((q) => q.id);
  if (wantIds.join(" ") !== gotIds.join(" ")) problems.push(`questions are [${gotIds.join(", ")}], expected [${wantIds.join(", ")}]`);
  else expected.questions.forEach((q, i) => match(q, bank.questions[i], `question ${q.id}`, problems));
  for (const m of expected.media ?? []) {
    const b = await bank.media(m.file);
    if (m.bytes === null) {
      if (b !== null) problems.push(`media ${m.file}: expected none`);
    } else if (!b || b.length !== m.bytes || createHash("sha256").update(b).digest("hex") !== m.sha256) problems.push(`media ${m.file}: not the expected bytes`);
  }
  const got = [...bank.problems];
  for (const w of expected.problems) {
    const i = got.findIndex((g) => g.file === w.file && (w.questionId === undefined || g.questionId === w.questionId) && g.skipped === w.skipped && g.message.includes(w.contains));
    if (i < 0) problems.push(`missing problem: ${JSON.stringify(w)}`);
    else got.splice(i, 1);
  }
  for (const g of got) problems.push(`unexpected problem: ${JSON.stringify(g)}`);
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf("--module");
  const module = at > 0 ? pathToFileURL(resolve(process.argv[at + 1])).href : new URL("../../../packages/bank/src/index.js", import.meta.url).href;
  const { readBank } = await import(module);
  const ids = JSON.parse(readFileSync(join(SET, "cases.json"), "utf8"));
  let failed = 0;
  for (const id of ids) {
    const problems = await checkCase(readBank, id);
    if (problems.length === 0) console.log(`${id}: ok`);
    else {
      failed++;
      console.log(`${id}: FAILED`);
      for (const p of problems) console.log(`  ${p}`);
    }
  }
  console.log(failed === 0 ? `all ${ids.length} cases pass` : `${failed} of ${ids.length} cases fail`);
  process.exitCode = failed === 0 ? 0 : 1;
}
