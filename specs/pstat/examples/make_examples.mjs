// Writes the spec's example files. Run from the repository root: node specs/pstat/examples/make_examples.mjs
//
//   minimal.pstat          PSTAT-1 section 9
//   item-results.pstat     a small class in the OpenAssess item results 1 profile (section 7.1)
//   item-results-2.pstat   the same kind of class in profile 2, with its assessment.json (section 7.2)
//   item-results-2-boxes.pstat  profile 2 with a credited question whose marks were not settled on one sheet, and a
//                          short answer in a box scored by a person (revision 1.3)
//   case-table.pstat       a PrismQDA case table, with its case-table.json (section 7.3)
//
// The builders are exported so the package's tests check the same files.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { attributeNames, PROFILE_CASE_TABLE, PROFILE_ITEM_RESULTS, PROFILE_ITEM_RESULTS_2, writePstat } from "../../../packages/pstat/src/index.js";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const variable = (id, name, label, measure, extra = {}) => ({ id, name, label, measure, value_labels: [], missing_values: [], ...extra });
const numeric = (values) => ({ type: "numeric", values });
const text = (values) => ({ type: "text", values });

export const minimal = () => ({
  format: "PrismStatistics project",
  version: 1,
  app_version: "Example writer 1.0",
  dataset: {
    name: "Example",
    variables: [variable(1, "group", "Group", "nominal", { value_labels: [{ value: 1, label: "Control" }, { value: 2, label: "Treatment" }], missing_values: [9] }), variable(2, "score", "", "scale")],
    columns: [numeric([1, 2, 9]), numeric([12.5, null, 14])],
    next_id: 3,
  },
  source: null,
  operations: [],
  results: [],
});

export const itemResults = () => ({
  format: "PrismStatistics project",
  version: 1,
  app_version: "OpenAssess 0.1.0-alpha.28",
  profile: PROFILE_ITEM_RESULTS,
  dataset: {
    name: "Unit 3 quiz",
    variables: [
      variable(1, "sheet", "Sheet number", "nominal"),
      variable(2, "version", "Version", "nominal", { value_labels: [{ value: 1, label: "A" }, { value: 2, label: "B" }] }),
      variable(3, "q01", "Question 1", "scale"),
      variable(4, "q02", "Question 2", "scale"),
      variable(5, "q03", "Question 3", "scale"),
      variable(6, "total", "Total score", "scale"),
    ],
    columns: [numeric([1, 2, 3, 5, 6]), numeric([1, 2, 1, 1, 2]), numeric([1, 1, 0, 1, 0]), numeric([1, 0.5, 0.5, 1, 0]), numeric([1, null, 0, 1, null]), numeric([3, 1.5, 0.5, 3, 0])],
    next_id: 7,
  },
  source: {
    file_name: "Unit 3 quiz results",
    report: {
      rows: 5,
      variables: 6,
      renamed: [],
      short_rows: 0,
      notes: ["1 sheet was left out because it has a question not yet settled, a page missing, or no version.", "q03 does not count on version B (an adjustment), so its cells there are empty."],
    },
  },
  operations: [],
  results: [],
});

// Profile 2. Four questions on version A: 1 one-answer with D also accepted, 2 select-all with partial credit worth 2
// points, 3 dropped (so left out, and the names skip it), 4 true/false dropped on version B only.
export const itemResults2 = () => ({
  format: "PrismStatistics project",
  version: 1,
  app_version: "OpenAssess 0.1.0-alpha.28",
  profile: PROFILE_ITEM_RESULTS_2,
  dataset: {
    name: "Unit 3 quiz",
    variables: [
      variable(1, "sheet", "Sheet number", "nominal"),
      variable(2, "version", "Version", "nominal", { value_labels: [{ value: 1, label: "A" }, { value: 2, label: "B" }] }),
      variable(3, "q01", "Question 1", "scale"),
      variable(4, "q02", "Question 2", "scale"),
      variable(5, "q04", "Question 4", "scale"),
      variable(6, "total", "Total score", "scale"),
      variable(7, "r01", "Question 1 answer", "nominal"),
      variable(8, "r02", "Question 2 answer", "nominal"),
      variable(9, "r04", "Question 4 answer", "nominal"),
    ],
    columns: [
      numeric([1, 2, 3, 5, 6]),
      numeric([1, 2, 1, 1, 2]),
      numeric([1, 1, 0, 0, 0]),
      numeric([2, 1, 1, 0, 0]),
      numeric([1, null, 0, 1, null]),
      numeric([4, 2, 1, 1, 0]),
      text(["B", "D", "C", "", "AB"]),
      text(["AC", "A", "ACD", "", "CE"]),
      text(["A", null, "B", "A", null]),
    ],
    next_id: 10,
  },
  source: {
    file_name: "Unit 3 quiz results",
    report: {
      rows: 5,
      variables: 9,
      renamed: [],
      short_rows: 0,
      notes: [
        "1 sheet was left out because it is not complete: a question that counts is not settled, a page is missing, or the version is not known.",
        "Question 3 counts on none of the sheets written (it was dropped), so it is left out.",
        "q04 does not count on version B (dropped there), so its cells there are empty.",
      ],
    },
  },
  operations: [],
  results: [],
});

const details = (objective, chapter, bloom, difficulty) => ({ objective, chapter, section: null, page: null, bloom, difficulty, tags: [] });
const entry = (correct, points = 1, extra = {}) => ({ correct, points, adjustment: "none", partial_credit: false, ...extra });
const dropped = (extra = {}) => ({ correct: [], points: 1, adjustment: "dropped", partial_credit: false, ...extra });

export const assessment = () => ({
  part: "OpenAssess assessment",
  version: 1,
  test: { id: "t_01KA8V6F3Q0000000000000000", name: "Unit 3 quiz", given: "2026-11-10", source: "scanned sheets", versions: ["A", "B"], questions: 4, sheets_left_out: 1 },
  questions: [
    { number: 1, bank_id: "q_01KA8V6F3Q0000000000000001", revision: 2, points_variable: 3, answer_variable: 7, type: "multiple_choice", options: ["A", "B", "C", "D"], option_ids: ["o1", "o2", "o3", "o4"], option_labels: null, key: [entry(["B", "D"])], details: details("Name the parts of a cell", "3", "remember", "easy") },
    { number: 2, bank_id: "q_01KA8V6F3Q0000000000000002", revision: 1, points_variable: 4, answer_variable: 8, type: "select_all", options: ["A", "B", "C", "D", "E"], option_ids: ["o1", "o2", "o3", "o4", "o5"], option_labels: null, key: [entry(["AC"], 2, { partial_credit: true })], details: details("Tell plant cells from animal cells", "3", "understand", "medium") },
    { number: 3, bank_id: "q_01KA8V6F3Q0000000000000003", revision: 5, points_variable: null, answer_variable: null, type: "multiple_choice", options: ["A", "B", "C", "D"], option_ids: ["o2", "o1", "o3", "o4"], option_labels: null, key: [dropped()], details: details(null, "3", "apply", "hard") },
    { number: 4, bank_id: "q_01KA8V6F3Q0000000000000004", revision: 1, points_variable: 5, answer_variable: 9, type: "true_false", options: ["A", "B"], option_ids: ["true", "false"], option_labels: { A: "True", B: "False" }, key: [entry(["A"], 1, { versions: [1] }), dropped({ versions: [2] })], details: details(null, "3", null, null) },
  ],
});

// Profile 7.3. Four cases (case 4 was deleted), four attributes, three codes; case 5 holds no document.
const ATTRIBUTES = [
  { attribute_id: 4, name: "Age group", level: "ordinal" },
  { attribute_id: 2, name: "Interview date", level: "date" },
  { attribute_id: 1, name: "Role", level: "nominal" },
  { attribute_id: 3, name: "Years caring", level: "ratio" },
];
const CODES = [
  { code_id: 12, path: ["Barriers"], kind: "theme" },
  { code_id: 13, path: ["Barriers", "Cost"], kind: "code" },
  { code_id: 20, path: ["Support", "Family"], kind: "code" },
];
const MEASURE = { nominal: "nominal", ordinal: "ordinal", interval: "scale", ratio: "scale", date: "nominal", text: "nominal" };

export const caseTable = () => {
  const names = attributeNames(ATTRIBUTES.map((a) => a.name));
  const variables = [variable(1, "case_id", "Case ID", "nominal"), variable(2, "case_name", "Case name", "nominal")];
  ATTRIBUTES.forEach((a, i) => variables.push(variable(3 + i, names[i], a.name, MEASURE[a.level])));
  variables[2].value_labels = [{ value: 1, label: "Under 40" }, { value: 2, label: "40 to 64" }, { value: 3, label: "65 and over" }];
  variables[2].missing_values = [9];
  CODES.forEach((c, i) => {
    const path = c.path.join(" > ");
    variables.push(variable(7 + 2 * i, `code_${c.code_id}_present`, path, "nominal", { value_labels: [{ value: 0, label: "No" }, { value: 1, label: "Yes" }] }));
    variables.push(variable(8 + 2 * i, `code_${c.code_id}_count`, `${path} (excerpts)`, "scale"));
  });
  return {
    format: "PrismStatistics project",
    version: 1,
    app_version: "PrismQDA 0.1.0-beta.2",
    profile: PROFILE_CASE_TABLE,
    dataset: {
      name: "Caregiver interviews",
      variables,
      columns: [
        numeric([1, 2, 3, 5]),
        text(["P01", "P02", "P03", "P05"]),
        numeric([2, 3, 9, 1]),
        text(["2026-09-14", "2026-09-21", null, "2026-10-02"]),
        text(["Spouse", "Child", "Child", null]),
        numeric([12, 3.5, 6, 1]),
        numeric([1, 1, 0, null]),
        numeric([3, 2, 0, null]),
        numeric([1, 0, 0, null]),
        numeric([2, 0, 0, null]),
        numeric([0, 1, 1, null]),
        numeric([0, 4, 1, null]),
      ],
      next_id: 13,
    },
    source: {
      file_name: "Caregiver interviews case table",
      report: {
        rows: 4,
        variables: 12,
        renamed: ATTRIBUTES.map((a, i) => [a.name, names[i]]).filter(([a, b]) => a !== b),
        short_rows: 0,
        notes: ["2 retired codes are left out.", "Excerpt text is never written."],
      },
    },
    operations: [],
    results: [],
  };
};

export const caseTablePart = () => ({
  part: "PrismQDA case table",
  version: 1,
  project: { name: "Caregiver interviews", id: "9f2c4e7a0b1d4c3e8a6f5b2d1c0e9a8b" },
  exported: "2026-11-15T21:04:00Z",
  codebook_version: 3,
  sub_codes_counted: true,
  case_id_variable: 1,
  case_name_variable: 2,
  attributes: ATTRIBUTES.map((a, i) => ({ variable: 3 + i, ...a })),
  codes: CODES.map((c, i) => ({ ...c, present_variable: 7 + 2 * i, count_variable: 8 + 2 * i })),
});

// Profile 7.2 with what revision 1.3 settled: q02 was credited to everyone, and sheet 3's marks on it were never
// settled (its r cell is null; sheet 2 left it blank, ""); q03 is a short answer written in a box and scored by a
// person (type other), so it has no answer variable.
export const itemResults2Boxes = () => ({
  format: "PrismStatistics project",
  version: 1,
  app_version: "OpenAssess 0.1.0-alpha.30",
  profile: PROFILE_ITEM_RESULTS_2,
  dataset: {
    name: "Unit 4 quiz",
    variables: [
      variable(1, "sheet", "Sheet number", "nominal"),
      variable(2, "version", "Version", "nominal", { value_labels: [{ value: 1, label: "A" }] }),
      variable(3, "q01", "Question 1", "scale"),
      variable(4, "q02", "Question 2", "scale"),
      variable(5, "q03", "Question 3", "scale"),
      variable(6, "total", "Total score", "scale"),
      variable(7, "r01", "Question 1 answer", "nominal"),
      variable(8, "r02", "Question 2 answer", "nominal"),
    ],
    columns: [
      numeric([1, 2, 3, 4]),
      numeric([1, 1, 1, 1]),
      numeric([1, 0, 1, 0]),
      numeric([1, 1, 1, 1]),
      numeric([2, 1, 0, 1.5]),
      numeric([4, 2, 2, 2.5]),
      text(["C", "A", "C", ""]),
      text(["B", "", null, "D"]),
    ],
    next_id: 9,
  },
  source: {
    file_name: "Unit 4 quiz results",
    report: {
      rows: 4,
      variables: 8,
      renamed: [],
      short_rows: 0,
      notes: ["Question 2 was credited to everyone; on sheet 3 its marks were never settled, so its answer cell is empty.", "Question 3 is written in a box and scored by a person, so it has no answer variable."],
    },
  },
  operations: [],
  results: [],
});

export const assessmentBoxes = () => ({
  part: "OpenAssess assessment",
  version: 1,
  test: { id: "t_01KA8V6F3Q0000000000000010", name: "Unit 4 quiz", given: "2026-11-16", source: "scanned sheets", versions: ["A"], questions: 3, sheets_left_out: 0 },
  questions: [
    { number: 1, bank_id: "q_01KA8V6F3Q0000000000000011", revision: 1, points_variable: 3, answer_variable: 7, type: "multiple_choice", options: ["A", "B", "C", "D"], option_ids: ["o1", "o2", "o3", "o4"], option_labels: null, key: [entry(["C"])], details: details(null, "4", null, null) },
    { number: 2, bank_id: "q_01KA8V6F3Q0000000000000012", revision: 3, points_variable: 4, answer_variable: 8, type: "multiple_choice", options: ["A", "B", "C", "D"], option_ids: ["o1", "o2", "o3", "o4"], option_labels: null, key: [{ correct: [], points: 1, adjustment: "credit_all", partial_credit: false }], details: details(null, "4", null, null) },
    { number: 3, bank_id: "q_01KA8V6F3Q0000000000000013", revision: 1, points_variable: 5, answer_variable: null, type: "other", options: [], option_ids: [], option_labels: null, key: [{ correct: [], points: 2, adjustment: "none", partial_credit: false }], details: details("Explain print preview", "4", "understand", null) },
  ],
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(here("minimal.pstat"), writePstat(minimal()));
  writeFileSync(here("item-results.pstat"), writePstat(itemResults()));
  writeFileSync(here("item-results-2.pstat"), writePstat(itemResults2(), assessment()));
  writeFileSync(here("item-results-2-boxes.pstat"), writePstat(itemResults2Boxes(), assessmentBoxes()));
  writeFileSync(here("case-table.pstat"), writePstat(caseTable(), caseTablePart()));
  console.log("wrote minimal.pstat, item-results.pstat, item-results-2.pstat, item-results-2-boxes.pstat and case-table.pstat");
}
