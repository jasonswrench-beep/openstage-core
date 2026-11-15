// Writes the spec's example files: minimal.pstat (PSTAT-1 section 9) and item-results.pstat (a small class in the
// OpenAssess item results 1 profile, section 7.1). Run from the repository root: node specs/pstat/examples/make_examples.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PROFILE_ITEM_RESULTS, writePstat } from "../../../packages/pstat/src/index.js";

const here = (name) => fileURLToPath(new URL(name, import.meta.url));

const minimal = {
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
};

const itemResults = {
  format: "PrismStatistics project",
  version: 1,
  app_version: "OpenAssess 0.1.0-alpha.28",
  profile: PROFILE_ITEM_RESULTS,
  dataset: {
    name: "Unit 3 quiz",
    variables: [
      { id: 1, name: "sheet", label: "Sheet number", measure: "nominal", value_labels: [], missing_values: [] },
      { id: 2, name: "version", label: "Version", measure: "nominal", value_labels: [{ value: 1, label: "A" }, { value: 2, label: "B" }], missing_values: [] },
      { id: 3, name: "q01", label: "Question 1", measure: "scale", value_labels: [], missing_values: [] },
      { id: 4, name: "q02", label: "Question 2", measure: "scale", value_labels: [], missing_values: [] },
      { id: 5, name: "q03", label: "Question 3", measure: "scale", value_labels: [], missing_values: [] },
      { id: 6, name: "total", label: "Total score", measure: "scale", value_labels: [], missing_values: [] },
    ],
    columns: [
      { type: "numeric", values: [1, 2, 3, 5, 6] },
      { type: "numeric", values: [1, 2, 1, 1, 2] },
      { type: "numeric", values: [1, 1, 0, 1, 0] },
      { type: "numeric", values: [1, 0.5, 0.5, 1, 0] },
      { type: "numeric", values: [1, null, 0, 1, null] },
      { type: "numeric", values: [3, 1.5, 0.5, 3, 0] },
    ],
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
};

writeFileSync(here("minimal.pstat"), writePstat(minimal));
writeFileSync(here("item-results.pstat"), writePstat(itemResults));
console.log("wrote minimal.pstat and item-results.pstat");
