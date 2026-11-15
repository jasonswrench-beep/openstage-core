import { test } from "node:test";
import assert from "node:assert/strict";

import { checkProject, checkPstat, parseJson, PROFILE_ITEM_RESULTS, PstatError, readPstat, validName, writePstat } from "../src/index.js";
import { readEntry, writeSingleEntry } from "../src/zip.js";

/** The minimal project of PSTAT-1 section 9. */
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

const rules = (problems) => problems.map((p) => p.rule).sort();

test("the minimal project is sound and round-trips through a file", () => {
  assert.deepEqual(checkProject(minimal()), []);
  const bytes = writePstat(minimal());
  assert.deepEqual(readPstat(bytes), minimal());
  assert.deepEqual(checkPstat(bytes), []);
});

test("the same project always makes the same bytes", () => {
  assert.deepEqual(writePstat(minimal()), writePstat(minimal()));
});

test("the name rule", () => {
  for (const ok of ["a", "score_1", "Ä", "été", "x".repeat(64), "q01"]) assert.ok(validName(ok), ok);
  for (const bad of ["", "1a", "_a", "a b", "a-b", "x".repeat(65), 3, null]) assert.ok(!validName(bad), String(bad));
});

test("format and version", () => {
  assert.deepEqual(rules(checkProject({ ...minimal(), format: "Something else" })), ["P1"]);
  assert.deepEqual(rules(checkProject({ ...minimal(), version: 2 })), ["P2", "P3"]);
  assert.deepEqual(rules(checkProject({ ...minimal(), version: 2 }, { as: "reader" })), ["P2"]);
  assert.deepEqual(rules(checkProject({ ...minimal(), app_version: "" })), ["P3"]);
  const { operations, ...noOps } = minimal();
  assert.deepEqual(rules(checkProject(noOps)), ["P3"]);
});

test("the dataset rules", () => {
  const p = minimal();
  p.dataset.columns[1].values.push(1);
  assert.deepEqual(rules(checkProject(p)), ["D1"]);
  const q = minimal();
  q.dataset.variables[1].name = "GROUP";
  assert.deepEqual(rules(checkProject(q)), ["D3"]);
  const r = minimal();
  r.dataset.variables[1].id = 1;
  assert.deepEqual(rules(checkProject(r)), ["D4"]);
  const s = minimal();
  s.dataset.next_id = 2;
  assert.deepEqual(rules(checkProject(s)), ["D5"]);
  assert.deepEqual(rules(checkProject(s, { as: "reader" })), [], "a reader does not refuse a low next_id");
  const t = minimal();
  delete t.dataset.next_id;
  assert.deepEqual(rules(checkProject(t, { as: "reader" })), ["D4"], "next_id is required");
  const u = minimal();
  u.dataset.columns[0].values[1] = "2";
  assert.deepEqual(rules(checkProject(u)), ["D2"]);
  const v = minimal();
  v.dataset.variables[0].measure = "interval";
  assert.deepEqual(rules(checkProject(v)), ["D6"]);
  const w = minimal();
  w.dataset.variables[0].missing_values = [Infinity];
  assert.deepEqual(rules(checkProject(w)), ["D7"]);
});

test("only PrismStatistics writes its own parts", () => {
  const p = { ...minimal(), operations: [{ seq: 1, command: "frequencies", args: {} }] };
  assert.deepEqual(rules(checkProject(p)), ["O1"]);
  assert.deepEqual(rules(checkProject({ ...p, app_version: "0.1.1" })), [], "PrismStatistics writes a bare version");
  assert.deepEqual(rules(checkProject({ ...minimal(), report: { title: "x", blocks: [] } })), ["O1"]);
});

test("the source", () => {
  assert.deepEqual(checkProject({ ...minimal(), source: { file_name: "a.csv", report: { rows: 3, variables: 2, renamed: [], short_rows: 0 } } }), []);
  assert.deepEqual(rules(checkProject({ ...minimal(), source: { file_name: "a.csv", report: { rows: 3, variables: 2, renamed: [["a"]], short_rows: 0 } } })), ["S1"]);
  assert.deepEqual(rules(checkProject({ ...minimal(), source: { file_name: "a.csv" } })), ["S1"]);
});

test("integers written with a fraction break J2", () => {
  const text = JSON.stringify(minimal()).replace('"next_id":3', '"next_id":3.0').replace('"id":1,', '"id":1e0,');
  const parsed = parseJson(text);
  assert.deepEqual(rules(checkProject(parsed.value, { fractional: parsed.fractional })), ["J2", "J2"]);
  const bytes = writeSingleEntry("project.json", new TextEncoder().encode(text));
  assert.throws(() => readPstat(bytes), (e) => e instanceof PstatError && e.rule === "J2");
});

test("parseJson matches JSON.parse and refuses what it should", () => {
  const text = String.raw`{"a": [1, -2.5, 3e2, "x\"\\é", null, true, false, {}], "b": {"c": []}}`;
  assert.deepEqual(parseJson(text).value, JSON.parse(text));
  assert.deepEqual([...parseJson(text).fractional].sort(), ["$.a[1]", "$.a[2]"]);
  for (const bad of ["{", "[1,]", "{\"a\":1,}", "01", "1 2", "'a'", "NaN"]) assert.throws(() => parseJson(bad), SyntaxError, bad);
  const polluted = parseJson('{"__proto__": {"x": 1}}').value;
  assert.equal(Object.getPrototypeOf(polluted), Object.prototype, "a __proto__ member is an ordinary member");
  assert.deepEqual(polluted.__proto__, { x: 1 });
});

test("files that are not projects are refused with the rule they break", () => {
  const refuse = (bytes, rule) => assert.throws(() => readPstat(bytes), (e) => e instanceof PstatError && e.rule === rule, rule);
  refuse(new TextEncoder().encode("not a zip"), "Z1");
  refuse(writeSingleEntry("other.json", new TextEncoder().encode("{}")), "Z1");
  refuse(writeSingleEntry("project.json", new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), "J1");
  refuse(writeSingleEntry("project.json", new TextEncoder().encode("{ not json")), "J1");
  refuse(writeSingleEntry("project.json", new TextEncoder().encode(JSON.stringify({ ...minimal(), format: "x" }))), "P1");
  const newer = writeSingleEntry("project.json", new TextEncoder().encode(JSON.stringify({ ...minimal(), version: 2, app_version: "PrismStatistics 9.0.0" })));
  assert.throws(() => readPstat(newer), /PrismStatistics 9\.0\.0/);
  const damaged = minimal();
  damaged.dataset.columns[0].values.pop();
  refuse(writeSingleEntry("project.json", new TextEncoder().encode(JSON.stringify(damaged))), "D1");
});

test("the ZIP reader checks what it unpacks", () => {
  const bytes = writePstat(minimal());
  const broken = bytes.slice();
  broken[60] ^= 0xff; // inside the deflated data (the local header and the name take the first 42 bytes)
  assert.throws(() => readPstat(broken), (e) => e instanceof PstatError && e.rule === "Z1");
  // A stored (method 0) entry reads as well as a deflated one.
  const json = new TextEncoder().encode(JSON.stringify(minimal()));
  const deflated = writeSingleEntry("project.json", json);
  assert.deepEqual(readEntry(deflated, "project.json"), json);
  // An entry that claims to unpack to more than the cap is refused before it is unpacked.
  assert.throws(() => readEntry(deflated, "project.json", { maxUnpacked: 10 }), /more than 10 bytes/);
});

test("writePstat refuses a broken project and names the rules", () => {
  const p = minimal();
  p.dataset.variables[0].name = "1st";
  assert.throws(() => writePstat(p), (e) => e instanceof PstatError && e.rule === "D3");
});

/** A small project in the OpenAssess item results 1 profile. */
const itemResults = () => ({
  format: "PrismStatistics project",
  version: 1,
  app_version: "OpenAssess 0.1.0-alpha.28",
  profile: PROFILE_ITEM_RESULTS,
  dataset: {
    name: "Quiz",
    variables: [
      { id: 1, name: "sheet", label: "Sheet number", measure: "nominal", value_labels: [], missing_values: [] },
      { id: 2, name: "version", label: "Version", measure: "nominal", value_labels: [{ value: 1, label: "A" }, { value: 2, label: "B" }], missing_values: [] },
      { id: 3, name: "q01", label: "Question 1", measure: "scale", value_labels: [], missing_values: [] },
      { id: 4, name: "q02", label: "Question 2", measure: "scale", value_labels: [], missing_values: [] },
      { id: 5, name: "total", label: "Total score", measure: "scale", value_labels: [], missing_values: [] },
    ],
    columns: [
      { type: "numeric", values: [1, 2, 4] },
      { type: "numeric", values: [1, 2, 2] },
      { type: "numeric", values: [1, 0, 1] },
      { type: "numeric", values: [0.5, null, 1] },
      { type: "numeric", values: [1.5, 0, 2] },
    ],
    next_id: 6,
  },
  source: { file_name: "Quiz results", report: { rows: 3, variables: 5, renamed: [], short_rows: 0, notes: ["1 sheet was left out because it has a question not yet settled."] } },
  operations: [],
  results: [],
});

test("the item results profile", () => {
  assert.deepEqual(checkProject(itemResults()), []);
  const wrong = (change) => {
    const p = itemResults();
    change(p);
    return checkProject(p).map((x) => x.message);
  };
  assert.match(wrong((p) => (p.dataset.columns[4].values[0] = 2)).join(), /the total \(2\)/);
  assert.match(wrong((p) => (p.dataset.columns[0].values = [2, 1, 4])).join(), /sheet-number order/);
  assert.match(wrong((p) => (p.dataset.variables[1].value_labels[1].label = "b")).join(), /version 2 is labelled B/);
  assert.match(wrong((p) => (p.app_version = "Something 1.0")).join(), /OpenAssess and the release/);
  assert.match(wrong((p) => (p.source.file_name = "Quiz")).join(), /followed by " results"/);
  assert.match(wrong((p) => (p.dataset.variables[2].missing_values = [9])).join(), /no missing codes/);
  assert.match(wrong((p) => (p.dataset.columns[3].values = [null, null, null])).join(), /counts on no sheet/);
  assert.match(wrong((p) => (p.dataset.columns[1].values[2] = null)).join(), /every exported sheet has its version/);
  assert.match(wrong((p) => (p.dataset.variables[3].name = "q2")).join(), /must be q02/);
  assert.match(wrong((p) => (p.dataset.variables[2].label = "What is 2 + 2?")).join(), /not the question's text/);
  // Without the profile member the same layout is an ordinary project, not checked against the profile.
  const plain = itemResults();
  delete plain.profile;
  plain.dataset.columns[4].values[0] = 2;
  assert.deepEqual(checkProject(plain), []);
});
