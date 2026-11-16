// Checks that a reader opens and refuses .pstat files as PSTAT-1 says: PrismStatistics (through its batch runner) and
// this repository's own readPstat. Each file below is either sound (the reader must open it) or breaks one rule (the
// reader must refuse it).
//
//   node specs/pstat/conformance/check_reader.mjs [--prism <prism.exe or prismstatistics-app.exe>] [--work <folder>]
//
// Without --prism only readPstat is checked. Exit code 0 when every reader does what the spec says.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { readPstat, writePstat } from "../../../packages/pstat/src/index.js";
import { writeArchive } from "../../../packages/pstat/src/zip.js";
import { assessment, assessmentBoxes, caseTable, caseTablePart, itemResults2, itemResults2Boxes } from "../examples/make_examples.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith("--")) args[process.argv[i].slice(2)] = process.argv[++i];
const work = args.work ? resolve(args.work) : mkdtempSync(join(tmpdir(), "pstat-reader-"));
mkdirSync(work, { recursive: true });

const minimal = () => ({
  format: "PrismStatistics project",
  version: 1,
  app_version: "Example writer 1.0",
  dataset: {
    name: "Example",
    variables: [
      { id: 1, name: "group", label: "Group", measure: "nominal", value_labels: [{ value: 1, label: "Control" }, { value: 2, label: "Treatment" }], missing_values: [9] },
      { id: 2, name: "score", label: "", measure: "scale", value_labels: [], missing_values: [] },
    ],
    columns: [
      { type: "numeric", values: [1, 2, 9] },
      { type: "numeric", values: [12.5, null, 14] },
    ],
    next_id: 3,
  },
  source: null,
  operations: [],
  results: [],
});
const json = (p) => new TextEncoder().encode(typeof p === "string" ? p : JSON.stringify(p));
const entry = (p, extra = {}) => writeArchive([{ name: "project.json", data: json(p), ...extra }]);
const changed = (change) => {
  const p = minimal();
  change(p);
  return entry(p);
};

/** [name, bytes, "open" or the rule it breaks] */
const files = [
  ["minimal", writePstat(minimal()), "open"],
  ["unknown members and a profile", changed((p) => Object.assign(p, { profile: "Example profile 1", x_future: { a: 1 } })), "open"],
  ["stored, not deflated", entry(minimal(), { method: 0 }), "open"],
  ["another entry beside project.json", writeArchive([{ name: "project.json", data: json(minimal()) }, { name: "notes.txt", data: json("later parts") }]), "open"],
  ["no source member", changed((p) => delete p.source), "open"],
  ["a variable with id 0", changed((p) => (p.dataset.variables[0].id = 0)), "open"],
  ["a name with letters outside ASCII", changed((p) => (p.dataset.variables[1].name = "été")), "open"],
  ["a next_id no greater than the ids (a writer rule only)", changed((p) => (p.dataset.next_id = 2)), "open"],
  ["missing ranges", changed((p) => (p.dataset.variables[1].missing_ranges = [[90, 99]])), "open"],
  ["text column", changed((p) => (p.dataset.variables.push({ id: 3, name: "site", label: "", measure: "nominal", value_labels: [], missing_values: [] }), p.dataset.columns.push({ type: "text", values: ["North", null, "Süd"] }), (p.dataset.next_id = 4))), "open"],
  // Revision 1.1: a profile's part is one more entry, which a reader of 1.0 already ignores (Z3).
  ["item results 2, with assessment.json (section 7.2)", writePstat(itemResults2(), assessment()), "open"],
  // Revision 1.3: an empty answer cell beside points (a credited question's unsettled marks), and no answer variable for a box.
  ["item results 2 with a credited question and a box (revision 1.3)", writePstat(itemResults2Boxes(), assessmentBoxes()), "open"],
  ["a PrismQDA case table, with case-table.json (section 7.3)", writePstat(caseTable(), caseTablePart()), "open"],
  ["a part that is not JSON (only the writer is wrong)", writeArchive([{ name: "project.json", data: json(itemResults2()) }, { name: "assessment.json", data: json("{ not json").subarray(1) }]), "open"],
  ["not a ZIP archive", json("not a zip"), "Z1"],
  ["Project.json, not project.json", writeArchive([{ name: "Project.json", data: json(minimal()) }]), "Z1"],
  ["a byte-order mark", writeArchive([{ name: "project.json", data: new Uint8Array([0xef, 0xbb, 0xbf, ...json(minimal())]) }]), "J1"],
  ["not JSON", entry("{ format: 1 }"), "J1"],
  ["another format", changed((p) => (p.format = "Something else")), "P1"],
  ["a newer version", changed((p) => Object.assign(p, { version: 2, app_version: "9.9.9" })), "P2"],
  ["next_id written as 3.0", entry(JSON.stringify(minimal()).replace('"next_id":3', '"next_id":3.0')), "J2"],
  ["an id written as 1.0", entry(JSON.stringify(minimal()).replace('"id":1,', '"id":1.0,')), "J2"],
  ["no next_id", changed((p) => delete p.dataset.next_id), "D4"],
  ["no results member", changed((p) => delete p.results), "P3"],
  ["no operations member", changed((p) => delete p.operations), "P3"],
  ["columns of different lengths", changed((p) => p.dataset.columns[1].values.push(1)), "D1"],
  ["two variables, one column", changed((p) => p.dataset.columns.pop()), "D1"],
  ["names the same but for case", changed((p) => (p.dataset.variables[1].name = "GROUP")), "D3"],
  ["a name starting with a digit", changed((p) => (p.dataset.variables[1].name = "1st")), "D3"],
  ["two variables with one id", changed((p) => (p.dataset.variables[1].id = 1)), "D4"],
  ["text in a numeric column", changed((p) => (p.dataset.columns[0].values[0] = "1")), "D2"],
  ["an unknown measure", changed((p) => (p.dataset.variables[0].measure = "interval")), "D6"],
  ["a value label whose value is text", changed((p) => (p.dataset.variables[0].value_labels[0].value = "1")), "D7"],
  ["a source report without short_rows", changed((p) => (p.source = { file_name: "a.csv", report: { rows: 3, variables: 2, renamed: [] } })), "S1"],
];

const results = [];
let wrong = 0;
for (const [name, bytes, expect] of files) {
  const file = join(work, `${String(results.length + 1).padStart(2, "0")}.pstat`);
  writeFileSync(file, bytes);
  const row = { name, expect, readers: {} };
  // readPstat
  try {
    readPstat(bytes);
    row.readers.readPstat = "open";
  } catch (e) {
    row.readers.readPstat = e.rule ?? "refused";
  }
  if (args.prism) {
    const script = file.replace(/\.pstat$/, ".pscript");
    writeFileSync(script, `open_project ${JSON.stringify({ path: file })}\n`);
    try {
      execFileSync(args.prism, ["run", script], { stdio: ["ignore", "ignore", "pipe"] });
      row.readers.PrismStatistics = "open";
    } catch (e) {
      row.readers.PrismStatistics = "refused";
      row.message = String(e.stderr ?? "").trim().split("\n").pop();
    }
  }
  for (const [reader, got] of Object.entries(row.readers)) {
    const ok = expect === "open" ? got === "open" : reader === "readPstat" ? got === expect : got === "refused";
    if (!ok) {
      wrong++;
      row.wrong = `${row.wrong ?? ""} ${reader}`;
    }
  }
  if (expect === "P2" && row.message && !row.message.includes("9.9.9")) {
    wrong++;
    row.wrong = `${row.wrong ?? ""} PrismStatistics (its message does not name the newer version)`;
  }
  results.push(row);
}

for (const r of results) {
  const readers = Object.entries(r.readers).map(([k, v]) => `${k}: ${v}`).join(", ");
  console.log(`${r.wrong ? "WRONG" : "ok   "}  ${r.name}: ${r.expect === "open" ? "must open" : `must refuse (${r.expect})`}; ${readers}${r.message ? `\n         PrismStatistics said: ${r.message}` : ""}`);
}
console.log(`${files.length - wrong} of ${files.length} as the spec says${args.prism ? "" : " (readPstat only: pass --prism to check PrismStatistics too)"}.`);
process.exit(wrong === 0 ? 0 : 1);
