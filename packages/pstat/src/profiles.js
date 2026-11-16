// The profiles of PSTAT-1 section 7, and their parts. checkProfile() is run by checkProject() for a writer, once the
// file passes every other rule. Problems carry rule F1 (the layout) or F2 (the part's own form).

export const PROFILE_ITEM_RESULTS = "OpenAssess item results 1";
export const PROFILE_ITEM_RESULTS_2 = "OpenAssess item results 2";
export const PROFILE_CASE_TABLE = "PrismQDA case table 1";

/** The part each profile adds (section 2): the entry's name and the `part` member it starts with. */
export const PARTS = {
  [PROFILE_ITEM_RESULTS_2]: { entry: "assessment.json", part: "OpenAssess assessment", version: 1 },
  [PROFILE_CASE_TABLE]: { entry: "case-table.json", part: "PrismQDA case table", version: 1 },
};

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v, lo = 0, hi = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= lo && v <= hi;
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const isString = (v) => typeof v === "string";
const stringOrNull = (v) => v === null || typeof v === "string";
const ULID = "[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}";
const TEST_ID = new RegExp(`^t_${ULID}$`);
const BANK_ID = new RegExp(`^q_${ULID}$`);
const BLOOM = new Set(["remember", "understand", "apply", "analyze", "evaluate", "create"]);
const DIFFICULTY = new Set(["easy", "medium", "hard"]);
const TYPES = new Set(["multiple_choice", "select_all", "true_false", "other"]);
const ADJUSTMENTS = new Set(["none", "dropped", "credit_all"]);
const SOURCES = new Set(["scanned sheets", "learning system report"]);
const LEVELS = new Set(["nominal", "ordinal", "interval", "ratio", "date", "text"]);
const MEASURE_OF_LEVEL = { nominal: "nominal", ordinal: "ordinal", interval: "scale", ratio: "scale", date: "nominal", text: "nominal" };
const letterAt = (i) => String.fromCharCode(65 + i);
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** An answer cell's form: capital letters in alphabetical order, each once (`""` for blank). */
export const isAnswer = (s) => typeof s === "string" && /^[A-Z]*$/.test(s) && [...s].every((c, i, a) => i === 0 || a[i - 1] < c);

/**
 * The points an answer earns under a key entry (PSTAT-1 section 7.2, "The key reproduces the points"). Returns null
 * for a dropped entry and undefined for type `other`, whose points come from the source.
 * @param {{type: string}} question
 * @param {{correct: string[], points: number, adjustment: string, partial_credit: boolean}} entry
 * @param {string | null} answer null only for a credited question whose marks were not settled (revision 1.3)
 */
export function pointsFor(question, entry, answer) {
  if (entry.adjustment === "dropped") return null;
  if (entry.adjustment === "credit_all") return entry.points;
  if (question.type === "other") return undefined;
  if (answer === "") return 0;
  if (question.type === "select_all") {
    const key = entry.correct[0];
    if (answer === key) return entry.points;
    if (!entry.partial_credit) return 0;
    const right = [...answer].filter((c) => key.includes(c)).length;
    const wrong = answer.length - right;
    return Math.round((entry.points * Math.max(0, right - wrong) / key.length) * 1e6) / 1e6;
  }
  return answer.length === 1 && entry.correct.includes(answer) ? entry.points : 0;
}

/** The key entry that applies to version number `v`. */
export const entryFor = (question, v) => question.key.find((e) => e.versions === undefined || e.versions.includes(v));

/**
 * Checks a project against the profile it names, with its part (already parsed) when the profile has one.
 * @param {any} project a project that passed every other rule
 * @param {{ part?: unknown, partFractional?: Set<string> }} options
 */
export function checkProfile(project, options = {}) {
  const problems = [];
  const where = { project, problems, part: options.part, partFractional: options.partFractional ?? new Set() };
  const profile = project.profile;
  if (PARTS[profile] && options.part === undefined) {
    problems.push({ rule: "F1", path: PARTS[profile].entry, message: `the ${profile} profile has a part: the file must hold ${PARTS[profile].entry}` });
    return problems;
  }
  if (profile === PROFILE_ITEM_RESULTS) itemResults(where, 1);
  else if (profile === PROFILE_ITEM_RESULTS_2) itemResults(where, 2);
  else if (profile === PROFILE_CASE_TABLE) caseTable(where);
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Section 7.1 and 7.2: OpenAssess item results
// ---------------------------------------------------------------------------------------------------------------------

function itemResults(w, profileVersion) {
  const { project, problems } = w;
  const add = (path, message) => problems.push({ rule: "F1", path, message });
  const ds = project.dataset;
  const vars = ds.variables;
  const cols = ds.columns;
  if (!/^OpenAssess \S/.test(project.app_version)) add("$.app_version", "app_version is OpenAssess and the release");
  const want = (n, name, measure, label, type = "numeric") => {
    const v = vars[n];
    if (!v || v.name !== name) return add(`$.dataset.variables[${n}]`, `variable ${n + 1} must be ${name}`), false;
    if (v.measure !== measure) add(`$.dataset.variables[${n}].measure`, `${name} is ${measure}`);
    if (label !== undefined && v.label !== label) add(`$.dataset.variables[${n}].label`, `${name}'s label is "${label}"`);
    if (cols[n].type !== type) add(`$.dataset.columns[${n}]`, `${name} is ${type}`);
    return true;
  };
  const totalAt = vars.findIndex((v) => v.name === "total");
  if (vars.length < 4 || totalAt < 3) return add("$.dataset.variables", "the profile has sheet, version, at least one question and total");
  want(0, "sheet", "nominal", "Sheet number");
  want(1, "version", "nominal", "Version");
  want(totalAt, "total", "scale", "Total score");
  if (profileVersion === 1 && totalAt !== vars.length - 1) add(`$.dataset.variables[${totalAt}]`, "total is the last variable");

  // The question variables: q and the question's number on version A, the numbers rising, every name the same width.
  const questions = [];
  let width;
  for (let n = 2; n < totalAt; n++) {
    const v = vars[n];
    const m = /^q(\d+)$/.exec(v.name);
    if (!m) {
      add(`$.dataset.variables[${n}]`, `variable ${n + 1} (${v.name}) must be a question variable: q and its number on version A`);
      continue;
    }
    const number = Number(m[1]);
    if (width === undefined) width = m[1].length;
    else if (m[1].length !== width) add(`$.dataset.variables[${n}].name`, `${v.name}: every question variable has the same number of digits`);
    if (m[1].length < 2) add(`$.dataset.variables[${n}].name`, `${v.name}: the number has at least two digits`);
    if (number < 1) add(`$.dataset.variables[${n}].name`, `${v.name}: questions are numbered from 1`);
    if (questions.length > 0 && number <= questions.at(-1).number) add(`$.dataset.variables[${n}].name`, `${v.name}: the question variables are in version A's order, so their numbers rise`);
    want(n, v.name, "scale");
    if (v.value_labels.length > 0) add(`$.dataset.variables[${n}].value_labels`, `${v.name} has no value labels`);
    if (v.label !== `Question ${number}`) add(`$.dataset.variables[${n}].label`, `${v.name}'s label is "Question ${number}" (its number on version A), not the question's text`);
    if (cols[n].values.every((x) => x === null)) add(`$.dataset.columns[${n}]`, `${v.name} counts on no sheet, so it is left out`);
    questions.push({ n, number, name: v.name, id: v.id });
  }
  vars.forEach((v, n) => {
    if (v.missing_values.length > 0 || (v.missing_ranges ?? []).length > 0) add(`$.dataset.variables[${n}]`, `${v.name} has no missing codes (every gap is null)`);
  });

  const rows = cols[0]?.values.length ?? 0;
  const sheets = cols[0].values;
  for (let r = 0; r < rows; r++) {
    if (!isInt(sheets[r], 1)) add(`$.dataset.columns[0].values[${r}]`, "a sheet number is a whole number from 1");
    else if (r > 0 && isInt(sheets[r - 1]) && sheets[r] <= sheets[r - 1]) add(`$.dataset.columns[0].values[${r}]`, "cases are in sheet-number order, each sheet once");
    if (!isInt(cols[1].values[r], 1)) add(`$.dataset.columns[1].values[${r}]`, "every exported sheet has its version");
    const total = cols[totalAt].values[r];
    let sum = 0;
    for (const q of questions) sum += cols[q.n].values[r] ?? 0;
    if (total === null || Math.abs(total - sum) > 1e-9 * Math.max(1, Math.abs(sum))) add(`$.dataset.columns[${totalAt}].values[${r}]`, `the total (${total}) is the points earned on the questions that count (${sum})`);
  }
  const versionsUsed = [...new Set(cols[1].values.filter((v) => isInt(v, 1)))].sort((a, b) => a - b);
  const labels = new Map(vars[1].value_labels.map((l) => [l.value, l.label]));
  for (const v of versionsUsed) {
    const letter = v <= 26 ? letterAt(v - 1) : undefined;
    if (letter && labels.get(v) !== letter) add("$.dataset.variables[1].value_labels", `version ${v} is labelled ${letter}`);
  }
  const source = project.source;
  if (!source) add("$.source", 'the profile names its source: the test\'s name followed by " results"');
  else {
    if (source.file_name !== `${ds.name} results`) add("$.source.file_name", 'file_name is the test\'s name followed by " results"');
    if (source.report.rows !== rows) add("$.source.report.rows", `rows is the number of cases (${rows})`);
    if (source.report.variables !== vars.length) add("$.source.report.variables", `variables is the number of variables (${vars.length})`);
  }
  if (profileVersion === 2 && problems.length === 0) itemResults2(w, { totalAt, questions, width, rows, versionsUsed });
}

function itemResults2(w, { totalAt, questions, width, rows, versionsUsed }) {
  const { project, problems } = w;
  const add = (path, message) => problems.push({ rule: "F1", path, message });
  const addPart = (path, message, rule = "F2") => problems.push({ rule, path: `assessment.json ${path}`, message });
  const vars = project.dataset.variables;
  const cols = project.dataset.columns;

  // After total: the answer variables (one for each question variable whose question has letters, or none), then
  // student_id and student_name (each optional), then nothing. A question of type other has no letters (revision 1.3).
  const partQuestions = isObject(w.part) && Array.isArray(w.part.questions) ? w.part.questions : [];
  const noLetters = new Set(partQuestions.filter((q) => isObject(q) && q.type === "other").map((q) => q.number));
  let n = totalAt + 1;
  const answers = new Map(); // question number -> column index
  if (vars[n] && /^r\d+$/.test(vars[n].name)) {
    for (const q of questions) {
      if (noLetters.has(q.number)) continue;
      const name = `r${String(q.number).padStart(width, "0")}`;
      const v = vars[n];
      if (!v || v.name !== name) {
        add(`$.dataset.variables[${n}]`, `variable ${n + 1} must be ${name}: one answer variable for each question variable, in the same order, except a question of type other, which has no letters`);
        return;
      }
      if (v.measure !== "nominal") add(`$.dataset.variables[${n}].measure`, `${name} is nominal`);
      if (v.label !== `Question ${q.number} answer`) add(`$.dataset.variables[${n}].label`, `${name}'s label is "Question ${q.number} answer"`);
      if (v.value_labels.length > 0) add(`$.dataset.variables[${n}].value_labels`, `${name} has no value labels`);
      if (cols[n].type !== "text") add(`$.dataset.columns[${n}]`, `${name} is text`);
      else
        cols[n].values.forEach((s, r) => {
          const points = cols[q.n].values[r];
          // null with points present is checked against the key below: only a credited question's unsettled marks.
          if (points === null && s !== null) add(`$.dataset.columns[${n}].values[${r}]`, `${name} is empty where ${q.name} is empty`);
          else if (s !== null && !isAnswer(s)) add(`$.dataset.columns[${n}].values[${r}]`, `${JSON.stringify(s)} is not an answer: capital letters in alphabetical order, each once, or "" for blank`);
        });
      answers.set(q.number, n);
      n++;
    }
  }
  for (const [name, label] of [["student_id", "Student ID"], ["student_name", "Student name"]]) {
    if (!vars[n] || vars[n].name !== name) continue;
    const v = vars[n];
    if (v.measure !== "nominal" || v.label !== label || cols[n].type !== "text" || v.value_labels.length > 0) add(`$.dataset.variables[${n}]`, `${name} is text, nominal, labelled "${label}", with no value labels`);
    n++;
  }
  if (n < vars.length) {
    const m = /^r(\d+)$/.exec(vars[n].name);
    if (m && noLetters.has(Number(m[1]))) add(`$.dataset.variables[${n}]`, `${vars[n].name}: question ${Number(m[1])} is of type other, which has no letters, so it has no answer variable`);
    else add(`$.dataset.variables[${n}]`, `${vars[n].name} is not part of the profile: after total come the answer variables, then student_id, then student_name`);
  }
  if (problems.length > 0) return;

  // The part.
  const part = w.part;
  const fractional = w.partFractional;
  const int = (v, path, lo = 0) => {
    if (!isInt(v, lo)) addPart(path, `must be an integer from ${lo}`, typeof v === "number" && !Number.isInteger(v) ? "J2" : "F2");
    else if (fractional.has(path)) addPart(path, "is written with a fraction or an exponent; write it as a plain integer", "J2");
    return isInt(v, lo);
  };
  if (!isObject(part)) return addPart("$", "the part is one JSON object");
  if (part.part !== "OpenAssess assessment") addPart("$.part", 'part is "OpenAssess assessment"');
  if (part.version !== 1) addPart("$.version", "this is version 1 of the part");
  const t = part.test;
  if (!isObject(t)) return addPart("$.test", "test is an object");
  if (!isString(t.id) || !TEST_ID.test(t.id)) addPart("$.test.id", "id is OpenAssess's test id: t_ and 26 characters");
  if (t.name !== project.dataset.name) addPart("$.test.name", "name is the test's name, as dataset.name");
  if (!(t.given === null || isDate(t.given))) addPart("$.test.given", "given is a date, YYYY-MM-DD, or null");
  if (!SOURCES.has(t.source)) addPart("$.test.source", 'source is "scanned sheets" or "learning system report"');
  if (!Array.isArray(t.versions) || t.versions.length < 1 || !t.versions.every((x, i) => x === letterAt(i))) addPart("$.test.versions", "versions lists the version letters in order: A, B ...");
  const versionCount = Array.isArray(t.versions) ? t.versions.length : 0;
  for (const v of versionsUsed) if (v > versionCount) addPart("$.test.versions", `a sheet is version ${v}, which the test does not have`);
  int(t.sheets_left_out, "$.test.sheets_left_out");
  if (!int(t.questions, "$.test.questions", 1)) return;
  if (t.source === "learning system report" && answers.size > 0) add(`$.dataset.variables[${totalAt + 1}]`, "a learning system's report gives points only: no answer variables");
  const qs = part.questions;
  if (!Array.isArray(qs)) return addPart("$.questions", "questions is an array");
  if (qs.length !== t.questions) addPart("$.questions", `questions has one entry per question on version A (${t.questions})`);
  if (questions.length > 0 && questions.at(-1).number > t.questions) add(`$.dataset.variables[${questions.at(-1).n}]`, `${questions.at(-1).name}: the test has only ${t.questions} questions`);
  if (questions.length > 0 && String(t.questions).length > width && width >= 2) add(`$.dataset.variables[2].name`, `the names have as many digits as ${t.questions} questions need`);
  if (questions.length > 0 && Math.max(2, String(t.questions).length) !== width) add(`$.dataset.variables[2].name`, `with ${t.questions} questions on version A the numbers have ${Math.max(2, String(t.questions).length)} digits`);

  const byNumber = new Map(questions.map((q) => [q.number, q]));
  const parsed = [];
  qs.forEach((q, i) => {
    const p = `$.questions[${i}]`;
    if (!isObject(q)) return addPart(p, "a question is an object");
    if (q.number !== i + 1) addPart(`${p}.number`, `the questions are in version A's order: this is number ${i + 1}`);
    int(q.number, `${p}.number`, 1);
    if (!isString(q.bank_id) || !BANK_ID.test(q.bank_id)) addPart(`${p}.bank_id`, "bank_id is the bank's question id: q_ and 26 characters");
    int(q.revision, `${p}.revision`, 1);
    const variable = byNumber.get(i + 1);
    if (variable) {
      if (q.points_variable !== variable.id) addPart(`${p}.points_variable`, `points_variable is the id of ${variable.name} (${variable.id})`);
    } else if (q.points_variable !== null) addPart(`${p}.points_variable`, `question ${i + 1} has no q variable, so points_variable is null`);
    const at = answers.get(i + 1);
    if (at !== undefined) {
      if (q.answer_variable !== vars[at].id) addPart(`${p}.answer_variable`, `answer_variable is the id of ${vars[at].name} (${vars[at].id})`);
    } else if (q.answer_variable !== null) addPart(`${p}.answer_variable`, "answer_variable is null: the file has no answer variable for it");
    if (!TYPES.has(q.type)) return addPart(`${p}.type`, "type is multiple_choice, select_all, true_false or other");
    const opts = q.options;
    if (!Array.isArray(opts)) return addPart(`${p}.options`, "options is an array of letters");
    if (q.type === "other") {
      if (opts.length !== 0) addPart(`${p}.options`, "a question of type other has no options");
    } else if (q.type === "true_false") {
      if (JSON.stringify(opts) !== '["A","B"]') addPart(`${p}.options`, 'a true/false question\'s options are ["A", "B"]');
    } else if (opts.length < 2 || opts.length > 26 || !opts.every((x, k) => x === letterAt(k))) addPart(`${p}.options`, "options are the letters A, B ... of its options on version A, at least two");
    if (!Array.isArray(q.option_ids) || q.option_ids.length !== opts.length || !q.option_ids.every(isString) || new Set(q.option_ids).size !== q.option_ids.length) addPart(`${p}.option_ids`, "option_ids gives the bank's id of each option, distinct, in the order of options");
    else if (q.type === "true_false" && JSON.stringify(q.option_ids) !== '["true","false"]') addPart(`${p}.option_ids`, 'a true/false question\'s option_ids are ["true", "false"]');
    if (q.type === "true_false" ? JSON.stringify(q.option_labels) !== '{"A":"True","B":"False"}' : q.option_labels !== null) addPart(`${p}.option_labels`, q.type === "true_false" ? 'option_labels is {"A": "True", "B": "False"}' : "option_labels is null (an option's text is never written)");
    const d = q.details;
    if (!isObject(d)) addPart(`${p}.details`, "details is an object");
    else {
      for (const k of ["objective", "chapter", "section", "page"]) if (!stringOrNull(d[k])) addPart(`${p}.details.${k}`, `${k} is a string or null`);
      if (!(d.bloom === null || BLOOM.has(d.bloom))) addPart(`${p}.details.bloom`, "bloom is remember, understand, apply, analyze, evaluate, create or null");
      if (!(d.difficulty === null || DIFFICULTY.has(d.difficulty))) addPart(`${p}.details.difficulty`, "difficulty is easy, medium, hard or null");
      if (!Array.isArray(d.tags) || !d.tags.every(isString)) addPart(`${p}.details.tags`, "tags is an array of strings");
    }
    // The key.
    if (!Array.isArray(q.key) || q.key.length === 0) return addPart(`${p}.key`, "key holds at least one entry");
    const covered = new Map();
    let unversioned = 0;
    q.key.forEach((e, k) => {
      const pk = `${p}.key[${k}]`;
      if (!isObject(e)) return addPart(pk, "a key entry is an object");
      if (e.versions === undefined) unversioned++;
      else if (!Array.isArray(e.versions) || e.versions.length === 0) addPart(`${pk}.versions`, "versions lists version numbers");
      else
        e.versions.forEach((v, j) => {
          if (int(v, `${pk}.versions[${j}]`, 1)) {
            if (v > versionCount) addPart(`${pk}.versions[${j}]`, `the test has no version ${v}`);
            covered.set(v, (covered.get(v) ?? 0) + 1);
          }
        });
      if (!ADJUSTMENTS.has(e.adjustment)) addPart(`${pk}.adjustment`, "adjustment is none, dropped or credit_all");
      if (!finite(e.points) || e.points <= 0) addPart(`${pk}.points`, "points is a number greater than 0");
      if (typeof e.partial_credit !== "boolean") addPart(`${pk}.partial_credit`, "partial_credit is true or false");
      else if (e.partial_credit && q.type !== "select_all") addPart(`${pk}.partial_credit`, "only a select-all question gives partial credit");
      if (!Array.isArray(e.correct) || !e.correct.every(isString)) return addPart(`${pk}.correct`, "correct is an array of answers");
      if (q.type === "other" || e.adjustment === "dropped" || e.adjustment === "credit_all") {
        if (e.correct.length > 0 && (q.type === "other" || e.adjustment === "dropped")) addPart(`${pk}.correct`, "correct is [] for this entry");
        if (q.type === "other" || e.adjustment !== "credit_all") return;
      }
      const inOptions = (s) => isAnswer(s) && s !== "" && [...s].every((c) => opts.includes(c));
      if (q.type === "select_all") {
        if (e.adjustment === "none" && (e.correct.length !== 1 || !inOptions(e.correct[0]))) addPart(`${pk}.correct`, "a select-all question's correct is one answer: every letter that must be marked, in alphabetical order");
      } else if (e.adjustment === "none" && (e.correct.length < 1 || !e.correct.every((s) => s.length === 1 && inOptions(s)) || new Set(e.correct).size !== e.correct.length)) addPart(`${pk}.correct`, "a one-answer question's correct lists the accepted letters, each once");
    });
    if (unversioned > 1 || (unversioned === 1 && q.key.length > 1)) addPart(`${p}.key`, "a key has one entry without versions, or entries that each name their versions");
    if (unversioned === 0) for (let v = 1; v <= versionCount; v++) if (covered.get(v) !== 1) addPart(`${p}.key`, `version ${v} must be named by exactly one key entry`);
    parsed.push({ q, variable, answerAt: at });
  });
  for (const q of questions) if (!qs.some((x) => isObject(x) && x.number === q.number)) add(`$.dataset.variables[${q.n}]`, `${q.name} has no entry in assessment.json`);
  if (problems.length > 0) return;

  // The key reproduces every cell.
  for (const { q, variable, answerAt } of parsed) {
    if (!variable) continue;
    for (let r = 0; r < rows; r++) {
      const v = cols[1].values[r];
      const e = entryFor(q, v);
      const got = cols[variable.n].values[r];
      const where = `$.dataset.columns[${variable.n}].values[${r}]`;
      if (e.adjustment === "dropped") {
        if (got !== null) add(where, `${variable.name} does not count on version ${t.versions[v - 1]} (dropped), so its cell is empty`);
        continue;
      }
      if (got === null) {
        add(where, `${variable.name} counts on version ${t.versions[v - 1]}, so its cell holds the points earned`);
        continue;
      }
      if (got < 0 || got > e.points + 1e-9) add(where, `${variable.name} earns from 0 to ${e.points} points`);
      const answer = answerAt === undefined ? undefined : cols[answerAt].values[r];
      if (answer === null && e.adjustment !== "credit_all") {
        add(`$.dataset.columns[${answerAt}].values[${r}]`, `${project.dataset.variables[answerAt].name} is empty only where ${variable.name} is, or on a question credited to everyone whose marks were not settled`);
        continue;
      }
      const expected = answer === undefined ? (e.adjustment === "credit_all" ? e.points : undefined) : pointsFor(q, e, answer);
      if (expected !== undefined && Math.abs(got - expected) > 1e-9) add(where, `${variable.name}: the key gives ${expected} for ${answer === undefined ? "a credited question" : JSON.stringify(answer)}, but the cell says ${got}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Section 7.3: PrismQDA case table
// ---------------------------------------------------------------------------------------------------------------------

/** The variable name made from an attribute's name (section 7.3), before any _2 for a name already used. */
export function attributeName(name) {
  let s = String(name).replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (s === "") s = "a";
  else if (!/^[A-Za-z]/.test(s)) s = `a_${s}`;
  return s.slice(0, 64);
}

const CODE_NAME = /^code_(\d+)_(present|count)$/i;

/**
 * The variable names of a case table's attributes, in order (section 7.3): made from the names, then made distinct.
 * @param {string[]} names the attributes' names
 * @param {string[]} [taken] names already used (case_id, case_name)
 */
export function attributeNames(names, taken = ["case_id", "case_name"]) {
  const used = new Set(taken.map((s) => s.toLowerCase()));
  return names.map((name) => {
    const base = attributeName(name);
    let out = base;
    for (let k = 2; used.has(out.toLowerCase()) || CODE_NAME.test(out); k++) out = `${base.slice(0, 64 - String(k).length - 1)}_${k}`;
    used.add(out.toLowerCase());
    return out;
  });
}

function caseTable(w) {
  const { project, problems } = w;
  const add = (path, message) => problems.push({ rule: "F1", path, message });
  const addPart = (path, message, rule = "F2") => problems.push({ rule, path: `case-table.json ${path}`, message });
  const ds = project.dataset;
  const vars = ds.variables;
  const cols = ds.columns;
  if (!/^PrismQDA \S/.test(project.app_version)) add("$.app_version", "app_version is PrismQDA and the release");
  const at = (n) => `$.dataset.variables[${n}]`;
  if (vars[0]?.name !== "case_id") return add(at(0), "variable 1 is case_id");
  if (vars[0].measure !== "nominal" || vars[0].label !== "Case ID" || cols[0].type !== "numeric" || vars[0].value_labels.length > 0) add(at(0), 'case_id is numeric, nominal, labelled "Case ID", with no value labels');
  const caseIds = cols[0].values;
  caseIds.forEach((id, r) => {
    if (!isInt(id, 1)) add(`$.dataset.columns[0].values[${r}]`, "a case id is a whole number from 1");
    else if (r > 0 && isInt(caseIds[r - 1]) && id <= caseIds[r - 1]) add(`$.dataset.columns[0].values[${r}]`, "cases are in case-id order, each case once");
  });
  let n = 1;
  let nameVar = null;
  if (vars[1]?.name === "case_name") {
    if (vars[1].measure !== "nominal" || vars[1].label !== "Case name" || cols[1].type !== "text") add(at(1), 'case_name is text, nominal, labelled "Case name"');
    nameVar = vars[1];
    n = 2;
  }
  const attributes = [];
  while (n < vars.length && !CODE_NAME.test(vars[n].name)) attributes.push(n++);
  const codes = [];
  for (; n < vars.length; n += 2) {
    const m = CODE_NAME.exec(vars[n].name);
    if (!m || m[2] !== "present" || vars[n].name !== `code_${m[1]}_present`) {
      add(at(n), `after the attributes come pairs code_<id>_present and code_<id>_count (found ${vars[n].name})`);
      break;
    }
    const id = Number(m[1]);
    const present = vars[n];
    const count = vars[n + 1];
    if (!count || count.name !== `code_${m[1]}_count`) {
      add(at(n + 1), `code_${m[1]}_present is followed by code_${m[1]}_count`);
      break;
    }
    if (codes.length > 0 && id <= codes.at(-1).id) add(at(n), "the codes are in the order of PrismQDA's code id");
    if (present.measure !== "nominal" || cols[n].type !== "numeric" || JSON.stringify(present.value_labels) !== '[{"value":0,"label":"No"},{"value":1,"label":"Yes"}]') add(at(n), `${present.name} is numeric, nominal, with value labels 0 No and 1 Yes`);
    if (present.label.trim() === "") add(`${at(n)}.label`, `${present.name}'s label is the code's path`);
    if (count.measure !== "scale" || cols[n + 1].type !== "numeric" || count.value_labels.length > 0) add(at(n + 1), `${count.name} is numeric, scale, with no value labels`);
    if (count.label !== `${present.label} (excerpts)`) add(`${at(n + 1)}.label`, `${count.name}'s label is the path followed by " (excerpts)"`);
    for (let r = 0; r < caseIds.length; r++) {
      const p = cols[n].values[r];
      const c = cols[n + 1].values[r];
      if ((p === null) !== (c === null)) add(`$.dataset.columns[${n}].values[${r}]`, `${present.name} and ${count.name} are empty together (a case with no document)`);
      else if (p !== null && (!isInt(c) || p !== (c > 0 ? 1 : 0))) add(`$.dataset.columns[${n}].values[${r}]`, `${present.name} is 1 when ${count.name} (a whole number) is above 0, otherwise 0`);
    }
    codes.push({ id, n, present, count });
  }
  vars.forEach((v, k) => {
    if (!attributes.includes(k) && (v.missing_values.length > 0 || (v.missing_ranges ?? []).length > 0)) add(at(k), `${v.name} has no missing codes`);
  });
  const source = project.source;
  if (!source) add("$.source", 'the profile names its source: the project\'s name followed by " case table"');
  else {
    if (source.file_name !== `${ds.name} case table`) add("$.source.file_name", 'file_name is the project\'s name followed by " case table"');
    if (source.report.rows !== caseIds.length) add("$.source.report.rows", `rows is the number of cases (${caseIds.length})`);
    if (source.report.variables !== vars.length) add("$.source.report.variables", `variables is the number of variables (${vars.length})`);
  }
  if (problems.length > 0) return;

  // The part.
  const part = w.part;
  const fractional = w.partFractional;
  const int = (v, path, lo = 0) => {
    if (!isInt(v, lo)) addPart(path, `must be an integer from ${lo}`, typeof v === "number" && !Number.isInteger(v) ? "J2" : "F2");
    else if (fractional.has(path)) addPart(path, "is written with a fraction or an exponent; write it as a plain integer", "J2");
    return isInt(v, lo);
  };
  if (!isObject(part)) return addPart("$", "the part is one JSON object");
  if (part.part !== "PrismQDA case table") addPart("$.part", 'part is "PrismQDA case table"');
  if (part.version !== 1) addPart("$.version", "this is version 1 of the part");
  if (!isObject(part.project) || part.project.name !== ds.name || !isString(part.project.id) || !/^[0-9a-f]{32}$/.test(part.project.id)) addPart("$.project", "project is {name: the project's name, as dataset.name, id: its 32-character id}");
  if (!isString(part.exported) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(part.exported) || Number.isNaN(Date.parse(part.exported))) addPart("$.exported", "exported is a time in UTC: YYYY-MM-DDThh:mm:ssZ");
  if (part.codebook_version !== null) int(part.codebook_version, "$.codebook_version", 1);
  if (typeof part.sub_codes_counted !== "boolean") addPart("$.sub_codes_counted", "sub_codes_counted is true or false");
  if (part.case_id_variable !== vars[0].id) addPart("$.case_id_variable", `case_id_variable is the id of case_id (${vars[0].id})`);
  if (part.case_name_variable !== (nameVar ? nameVar.id : null)) addPart("$.case_name_variable", nameVar ? `case_name_variable is the id of case_name (${nameVar.id})` : "case_name_variable is null: the file has no case_name");
  if (!Array.isArray(part.attributes) || part.attributes.length !== attributes.length) addPart("$.attributes", `attributes has one entry per attribute variable (${attributes.length})`);
  else {
    const made = attributeNames(part.attributes.map((a) => (isObject(a) ? String(a.name) : "")), nameVar ? ["case_id", "case_name"] : ["case_id"]);
    const renamed = new Map((source.report.renamed ?? []).map(([a, b]) => [b, a]));
    part.attributes.forEach((a, i) => {
      const p = `$.attributes[${i}]`;
      const k = attributes[i];
      const v = vars[k];
      if (!isObject(a)) return addPart(p, "an attribute is an object");
      if (a.variable !== v.id) addPart(`${p}.variable`, `variable is the id of ${v.name} (${v.id})`);
      int(a.attribute_id, `${p}.attribute_id`, 1);
      if (a.name !== v.label) addPart(`${p}.name`, `name is the attribute's name, which is ${v.name}'s label`);
      if (!LEVELS.has(a.level)) return addPart(`${p}.level`, "level is nominal, ordinal, interval, ratio, date or text");
      if (v.name !== made[i]) add(at(k), `the name made from "${a.name}" is ${made[i]}`);
      if (v.name !== a.name && renamed.get(v.name) !== a.name) add("$.source.report.renamed", `renamed lists ["${a.name}", "${v.name}"]`);
      if (v.measure !== MEASURE_OF_LEVEL[a.level]) add(`${at(k)}.measure`, `an attribute of level ${a.level} is ${MEASURE_OF_LEVEL[a.level]}`);
      if ((a.level === "date" || a.level === "text") && cols[k].type !== "text") add(`$.dataset.columns[${k}]`, `a ${a.level} attribute is a text column`);
      if (a.level === "date" && cols[k].type === "text") cols[k].values.forEach((x, r) => x !== null && !isDate(x) && add(`$.dataset.columns[${k}].values[${r}]`, "a date is written YYYY-MM-DD"));
      if (cols[k].type === "text" && v.value_labels.length > 0) add(`${at(k)}.value_labels`, "value labels only on a numeric column");
    });
  }
  if (!Array.isArray(part.codes) || part.codes.length !== codes.length) return addPart("$.codes", `codes has one entry per pair of code variables (${codes.length})`);
  part.codes.forEach((c, i) => {
    const p = `$.codes[${i}]`;
    const code = codes[i];
    if (!isObject(c)) return addPart(p, "a code is an object");
    if (c.code_id !== code.id) addPart(`${p}.code_id`, `code_id is ${code.id}, as in ${code.present.name}`);
    int(c.code_id, `${p}.code_id`, 0);
    if (!Array.isArray(c.path) || c.path.length === 0 || !c.path.every((x) => isString(x) && x !== "")) addPart(`${p}.path`, "path lists the code's names from the top level down");
    else if (code.present.label !== c.path.join(" > ")) add(`${at(code.n)}.label`, `${code.present.name}'s label is the path: "${c.path.join(" > ")}"`);
    if (c.kind !== "code" && c.kind !== "theme") addPart(`${p}.kind`, "kind is code or theme");
    if (c.present_variable !== code.present.id) addPart(`${p}.present_variable`, `present_variable is the id of ${code.present.name} (${code.present.id})`);
    if (c.count_variable !== code.count.id) addPart(`${p}.count_variable`, `count_variable is the id of ${code.count.name} (${code.count.id})`);
  });
}
