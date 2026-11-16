// The profiles of PSTAT-1 revision 1.1: item results 2 with its assessment.json, the case table with its
// case-table.json, and the parts in the archive. The sound files are the spec's own examples.
import { test } from "node:test";
import assert from "node:assert/strict";

import { assessment, caseTable, caseTablePart, itemResults, itemResults2 } from "../../../specs/pstat/examples/make_examples.mjs";
import { attributeName, attributeNames, checkProject, checkPstat, pointsFor, readPart, readPstat, writePstat } from "../src/index.js";
import { writeArchive } from "../src/zip.js";

const messages = (problems) => problems.map((p) => `${p.rule} ${p.message}`).join(" | ");
const enc = (v) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));

test("the examples are sound and keep their part", () => {
  assert.deepEqual(checkProject(itemResults2(), { part: assessment() }), []);
  assert.deepEqual(checkProject(caseTable(), { part: caseTablePart() }), []);
  const bytes = writePstat(itemResults2(), assessment());
  assert.deepEqual(checkPstat(bytes), []);
  assert.deepEqual(readPart(bytes), assessment());
  assert.equal(readPstat(bytes).profile, "OpenAssess item results 2");
  assert.deepEqual(readPart(writePstat(itemResults())), null);
});

test("a profile with a part needs it, and nothing else goes in the archive", () => {
  assert.match(messages(checkProject(itemResults2())), /F1 .*must hold assessment\.json/);
  const project = enc(itemResults2());
  assert.match(messages(checkPstat(writeArchive([{ name: "project.json", data: project }]))), /F1 .*assessment\.json/);
  const extra = writeArchive([{ name: "project.json", data: project }, { name: "assessment.json", data: enc(assessment()) }, { name: "notes.txt", data: enc("hi") }]);
  assert.match(messages(checkPstat(extra)), /Z2 /);
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc(assessment())]);
  assert.match(messages(checkPstat(writeArchive([{ name: "project.json", data: project }, { name: "assessment.json", data: bom }]))), /F2 .*byte-order mark/);
  const fraction = enc(JSON.stringify(assessment()).replace('"questions":4', '"questions":4.0'));
  assert.match(messages(checkPstat(writeArchive([{ name: "project.json", data: project }, { name: "assessment.json", data: fraction }]))), /J2 /);
  // A profile without a part takes none.
  assert.throws(() => writePstat(itemResults(), assessment()), /has no part/);
  // A reader ignores the part: readPstat opens the file whatever the part says.
  assert.equal(readPstat(writeArchive([{ name: "project.json", data: project }, { name: "assessment.json", data: enc("not json") }])).profile, "OpenAssess item results 2");
});

test("the key reproduces the points (section 7.2)", () => {
  const one = { type: "multiple_choice" };
  const all = { type: "select_all" };
  const e = (correct, extra = {}) => ({ correct, points: 2, adjustment: "none", partial_credit: false, ...extra });
  assert.equal(pointsFor(one, e(["B", "D"]), "D"), 2);
  assert.equal(pointsFor(one, e(["B", "D"]), "BD"), 0);
  assert.equal(pointsFor(one, e(["B"]), ""), 0);
  assert.equal(pointsFor(all, e(["AC"]), "AC"), 2);
  assert.equal(pointsFor(all, e(["AC"]), "ACD"), 0);
  assert.equal(pointsFor(all, e(["AC"], { partial_credit: true }), "ACD"), 1);
  assert.equal(pointsFor(all, e(["ACE"], { partial_credit: true }), "A"), 0.666667);
  assert.equal(pointsFor(all, e(["AC"], { partial_credit: true }), "BD"), 0);
  assert.equal(pointsFor(one, e([], { adjustment: "credit_all" }), ""), 2);
  assert.equal(pointsFor(one, e([], { adjustment: "dropped" }), "A"), null);
});

test("item results 2: what checkPstat refuses", () => {
  const wrong = (change, changePart = () => {}) => {
    const p = itemResults2();
    const a = assessment();
    change(p);
    changePart(a);
    return messages(checkProject(p, { part: a }));
  };
  // The data.
  assert.match(wrong((p) => ((p.dataset.columns[3].values[1] = 2), (p.dataset.columns[5].values[1] = 3))), /the key gives 1 for "A".*says 2/);
  assert.match(wrong((p) => (p.dataset.columns[6].values[0] = "b")), /not an answer/);
  assert.match(wrong((p) => (p.dataset.columns[6].values[0] = "DB")), /not an answer/);
  assert.match(wrong((p) => (p.dataset.columns[8].values[0] = null)), /r04 is empty only where q04 is, or on a question credited to everyone/);
  assert.match(wrong((p) => (p.dataset.variables[7].name = "r03")), /must be r02/);
  assert.match(wrong((p) => (p.dataset.variables[6].label = "Question 1")), /label is "Question 1 answer"/);
  assert.match(wrong((p) => p.dataset.variables.push({ id: 10, name: "extra", label: "", measure: "scale", value_labels: [], missing_values: [] }) && p.dataset.columns.push({ type: "numeric", values: [1, 2, 3, 4, 5] }) && (p.dataset.next_id = 11) && (p.source.report.variables = 10)), /extra is not part of the profile/);
  // student_id, when written, is text and labelled.
  const withId = (p) => {
    p.dataset.variables.push({ id: p.dataset.next_id, name: "student_id", label: "Student ID", measure: "nominal", value_labels: [], missing_values: [] });
    p.dataset.columns.push({ type: "text", values: ["1001", "1002", null, "1005", "1006"] });
    p.dataset.next_id += 1;
    p.source.report.variables += 1;
  };
  assert.equal(wrong(withId), "");
  // student_name (revision 1.2) after student_id, or alone; nothing after it.
  const withName = (p) => {
    p.dataset.variables.push({ id: p.dataset.next_id, name: "student_name", label: "Student name", measure: "nominal", value_labels: [], missing_values: [] });
    p.dataset.columns.push({ type: "text", values: ["Ana Ruiz", "Ben Okafor", null, "Cal Ng", "Dee Park"] });
    p.dataset.next_id += 1;
    p.source.report.variables += 1;
  };
  assert.equal(wrong((p) => (withId(p), withName(p))), "");
  assert.equal(wrong(withName), "");
  assert.match(wrong((p) => (withName(p), withId(p))), /student_id is not part of the profile/);
  assert.match(wrong((p) => (withName(p), (p.dataset.variables[9].label = "Name"))), /labelled "Student name"/);
  // The part.
  assert.match(wrong(() => {}, (a) => (a.questions[1].points_variable = 5)), /points_variable is the id of q02 \(4\)/);
  assert.match(wrong(() => {}, (a) => (a.questions[2].points_variable = 5)), /has no q variable/);
  assert.match(wrong(() => {}, (a) => (a.test.id = "t_123")), /OpenAssess's test id/);
  assert.match(wrong(() => {}, (a) => (a.test.given = "2026-02-30")), /given is a date/);
  assert.match(wrong(() => {}, (a) => (a.test.questions = 3)), /one entry per question on version A \(3\)/);
  assert.match(wrong(() => {}, (a) => (a.questions[0].key[0].correct = ["F"])), /accepted letters/);
  assert.match(wrong(() => {}, (a) => (a.questions[1].key[0].correct = ["CA"])), /every letter that must be marked/);
  assert.match(wrong(() => {}, (a) => (a.questions[0].key[0].partial_credit = true)), /only a select-all question gives partial credit/);
  assert.match(wrong(() => {}, (a) => (a.questions[3].key[1].versions = [1])), /version 2 must be named by exactly one key entry/);
  assert.match(wrong(() => {}, (a) => (a.questions[3].option_labels = null)), /option_labels is \{"A": "True"/);
  assert.match(wrong(() => {}, (a) => (a.questions[0].details.bloom = "know")), /bloom is remember/);
  assert.match(wrong(() => {}, (a) => (a.questions[1].key[0].partial_credit = false)), /the key gives 0 for "A"/);
  assert.match(wrong(() => {}, (a) => (a.test.source = "learning system report")), /gives points only/);
});

test("the case table: attribute names, and what checkPstat refuses", () => {
  assert.equal(attributeName("Age group"), "Age_group");
  assert.equal(attributeName("  % of time  "), "of_time");
  assert.equal(attributeName("2nd language"), "a_2nd_language");
  assert.equal(attributeName("!!!"), "a");
  assert.equal(attributeName("x".repeat(70)), "x".repeat(64));
  assert.deepEqual(attributeNames(["Role", "role", "case name", "code_3_present", "ROLE"]), ["Role", "role_2", "case_name_2", "code_3_present_2", "ROLE_3"]);
  assert.equal(attributeNames(["y".repeat(70), "y".repeat(80)])[1], `${"y".repeat(62)}_2`);

  const wrong = (change, changePart = () => {}) => {
    const p = caseTable();
    const a = caseTablePart();
    change(p);
    changePart(a);
    return messages(checkProject(p, { part: a }));
  };
  assert.match(wrong((p) => (p.dataset.columns[0].values = [1, 3, 2, 5])), /case-id order/);
  assert.match(wrong((p) => (p.dataset.columns[6].values[0] = 0)), /code_12_present is 1 when code_12_count/);
  assert.match(wrong((p) => (p.dataset.columns[7].values[3] = 0)), /empty together/);
  assert.match(wrong((p) => (p.dataset.variables[7].label = "Barriers")), /followed by " \(excerpts\)"/);
  assert.match(wrong((p) => (p.dataset.variables[3].name = "InterviewDate")), /the name made from "Interview date" is Interview_date/);
  assert.match(wrong((p) => (p.source.report.renamed = [])), /renamed lists \["Age group", "Age_group"\]/);
  assert.match(wrong((p) => (p.dataset.variables[5].measure = "ordinal")), /level ratio is scale/);
  assert.match(wrong((p) => (p.dataset.variables[0].missing_values = [0])), /case_id has no missing codes/);
  assert.match(wrong(() => {}, (a) => (a.codes[1].path = ["Barriers", "Money"])), /label is the path: "Barriers > Money"/);
  assert.match(wrong(() => {}, (a) => (a.case_name_variable = null)), /case_name_variable is the id of case_name/);
  assert.match(wrong(() => {}, (a) => (a.exported = "2026-11-15 21:04")), /a time in UTC/);
  assert.match(wrong(() => {}, (a) => (a.project.id = "ABC")), /32-character id/);
  assert.match(wrong(() => {}, (a) => a.codes.pop()), /one entry per pair of code variables \(3\)/);
  // Names left out: no case_name, and the part says so.
  const noNames = (p) => {
    p.dataset.variables.splice(1, 1);
    p.dataset.columns.splice(1, 1);
    p.source.report.variables = 11;
  };
  assert.equal(wrong(noNames, (a) => (a.case_name_variable = null)), "");
});

// Revision 1.3: a credited question whose marks were not settled has a null answer cell; a question of type other (a
// box scored by a person) has no answer variable.
test("revision 1.3: unsettled marks on a credited question, and a box with no letters", async () => {
  const ex = await import("../../../specs/pstat/examples/make_examples.mjs");
  assert.deepEqual(checkProject(ex.itemResults2Boxes(), { part: ex.assessmentBoxes() }), []);
  const bytes = writePstat(ex.itemResults2Boxes(), ex.assessmentBoxes());
  assert.deepEqual(checkPstat(bytes), []);
  assert.equal(pointsFor({ type: "multiple_choice" }, { correct: [], points: 1, adjustment: "credit_all", partial_credit: false }, null), 1);

  const nullHere = ex.itemResults2Boxes();
  nullHere.dataset.columns[6].values[2] = null; // r01: question 1 is not credited
  assert.match(messages(checkProject(nullHere, { part: ex.assessmentBoxes() })), /r01 is empty only where q01 is, or on a question credited to everyone/);

  const boxWithLetters = ex.itemResults2Boxes();
  boxWithLetters.dataset.variables.push({ id: 9, name: "r03", label: "Question 3 answer", measure: "nominal", value_labels: [], missing_values: [] });
  boxWithLetters.dataset.columns.push({ type: "text", values: ["", "", "", ""] });
  boxWithLetters.dataset.next_id = 10;
  boxWithLetters.source.report.variables = 9;
  assert.match(messages(checkProject(boxWithLetters, { part: ex.assessmentBoxes() })), /r03: question 3 is of type other, which has no letters/);

  const answerOnPoints = ex.itemResults2Boxes();
  answerOnPoints.dataset.columns[2].values[1] = null; // q01 empty, r01 not
  assert.match(messages(checkProject(answerOnPoints, { part: ex.assessmentBoxes() })), /r01 is empty where q01 is empty/);
});
