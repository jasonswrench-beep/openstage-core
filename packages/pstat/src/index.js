// @openstage/pstat: read, write and check .pstat project files, format 1 (specs/pstat/PSTAT-1.md).
// No dependencies; Node 22.2 or later (node:zlib's crc32). Rule numbers in messages are the spec's section 8.

import { MAX_UNPACKED, readEntry, writeSingleEntry, ZipError } from "./zip.js";

export const EXTENSION = "pstat";
export const FORMAT = "PrismStatistics project";
export const VERSION = 1;
export const SPEC_REVISION = "1.0";
export const ENTRY = "project.json";
export const PROFILE_ITEM_RESULTS = "OpenAssess item results 1";
export { MAX_UNPACKED };

const U32_MAX = 4294967295;
const MEASURES = new Set(["nominal", "ordinal", "scale"]);

/** A file that cannot be opened, with the spec rule it breaks. */
export class PstatError extends Error {
  /** @param {string} rule @param {string} message */
  constructor(rule, message) {
    super(`${message} (PSTAT-1 rule ${rule})`);
    this.rule = rule;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// JSON, keeping note of numbers written with a fraction or an exponent (rule J2 needs the text, not the value).
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Parses JSON text and lists the paths of numbers written as `3.0` or `3e0`.
 * @param {string} text
 * @returns {{ value: unknown, fractional: Set<string> }}
 */
export function parseJson(text) {
  let i = 0;
  const fractional = new Set();
  const fail = (what) => {
    throw new SyntaxError(`${what} at character ${i + 1}`);
  };
  const space = () => {
    while (i < text.length && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++;
  };
  const value = (path) => {
    space();
    const c = text[i];
    if (c === "{") {
      i++;
      const out = {};
      space();
      if (text[i] === "}") {
        i++;
        return out;
      }
      for (;;) {
        space();
        if (text[i] !== '"') fail("expected a member name");
        const key = string();
        space();
        if (text[i] !== ":") fail("expected a colon");
        i++;
        Object.defineProperty(out, key, { value: value(`${path}.${key}`), enumerable: true, writable: true, configurable: true });
        space();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          return out;
        }
        fail("expected a comma or a closing brace");
      }
    }
    if (c === "[") {
      i++;
      const out = [];
      space();
      if (text[i] === "]") {
        i++;
        return out;
      }
      for (;;) {
        out.push(value(`${path}[${out.length}]`));
        space();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          return out;
        }
        fail("expected a comma or a closing bracket");
      }
    }
    if (c === '"') return string();
    if (text.startsWith("true", i)) return (i += 4), true;
    if (text.startsWith("false", i)) return (i += 5), false;
    if (text.startsWith("null", i)) return (i += 4), null;
    const m = /^-?(?:0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
    if (!m) fail("unexpected text");
    i += m[0].length;
    if (m[1] !== undefined || m[2] !== undefined) fractional.add(path);
    return Number(m[0]);
  };
  const string = () => {
    // From the opening quote to the closing one, decoded by JSON.parse so escapes follow the standard exactly.
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") i++;
      else if (text.charCodeAt(i) < 0x20) fail("a control character in a string");
      i++;
    }
    if (i >= text.length) fail("an unfinished string");
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const out = value("$");
  space();
  if (i !== text.length) fail("text after the end");
  return { value: out, fractional };
}

// ---------------------------------------------------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------------------------------------------------

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v, lo = 0, hi = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= lo && v <= hi;
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const asciiLower = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** Whether a variable name follows the name rule (PSTAT-1 section 4). */
export function validName(name) {
  return typeof name === "string" && /^\p{Alphabetic}[\p{Alphabetic}\p{N}_]*$/u.test(name) && [...name].length <= 64;
}

/**
 * Checks a parsed project.json against the rules of PSTAT-1.
 * @param {unknown} project
 * @param {{ as?: "writer" | "reader", fractional?: Set<string> }} [options] `as: "writer"` (the default) also applies
 *   the writer rules; `fractional` is from parseJson, for rule J2.
 * @returns {Array<{ rule: string, path: string, message: string }>} the problems; empty when the project is sound
 */
export function checkProject(project, options = {}) {
  const writer = (options.as ?? "writer") === "writer";
  const problems = [];
  const add = (rule, path, message) => problems.push({ rule, path, message });
  // A missing or out-of-range integer breaks `rule`; a number with a fraction breaks J2.
  const integer = (v, path, lo, hi, what, rule = "P3") => {
    if (!isInt(v, lo, hi)) add(typeof v === "number" && !Number.isInteger(v) ? "J2" : rule, path, `${what} must be an integer${lo !== undefined ? ` from ${lo}` : ""}${hi !== undefined && hi !== Number.MAX_SAFE_INTEGER ? ` to ${hi}` : ""}`);
    else if (options.fractional?.has(path)) add("J2", path, `${what} is written with a fraction or an exponent; write it as a plain integer`);
  };

  if (!isObject(project)) return [{ rule: "J1", path: "$", message: "project.json must be one JSON object" }];
  if (project.format !== FORMAT) add("P1", "$.format", `format must be exactly "${FORMAT}"`);
  if (!isInt(project.version, 0)) add("P3", "$.version", "version must be an integer");
  else {
    if (project.version > VERSION) add("P2", "$.version", `version ${project.version} is newer than format ${VERSION}`);
    if (writer && project.version !== VERSION) add("P3", "$.version", `a writer of format ${VERSION} writes version ${VERSION}`);
    if (options.fractional?.has("$.version")) add("J2", "$.version", "version is written with a fraction or an exponent");
  }
  if (typeof project.app_version !== "string" || project.app_version.trim() === "") add("P3", "$.app_version", "app_version must name the program that wrote the file and its version");
  if (!Array.isArray(project.operations)) add("P3", "$.operations", "operations must be an array (empty unless PrismStatistics wrote the file)");
  if (!Array.isArray(project.results)) add("P3", "$.results", "results must be an array (empty unless PrismStatistics wrote the file)");
  if (project.profile !== undefined && typeof project.profile !== "string") add("P3", "$.profile", "profile must be a string");

  // The dataset.
  const ds = project.dataset;
  if (!isObject(ds)) add("P3", "$.dataset", "dataset must be an object");
  else {
    if (typeof ds.name !== "string") add("D6", "$.dataset.name", "the dataset's name must be a string");
    const vars = Array.isArray(ds.variables) ? ds.variables : (add("D1", "$.dataset.variables", "variables must be an array"), []);
    const cols = Array.isArray(ds.columns) ? ds.columns : (add("D1", "$.dataset.columns", "columns must be an array"), []);
    if (vars.length !== cols.length) add("D1", "$.dataset", `it lists ${vars.length} variables but holds ${cols.length} columns`);
    const names = new Map();
    const ids = new Set();
    let maxId = -1;
    vars.forEach((v, n) => {
      const p = `$.dataset.variables[${n}]`;
      if (!isObject(v)) return add("D6", p, "a variable must be an object");
      integer(v.id, `${p}.id`, 0, U32_MAX, "the variable's id", "D4");
      if (isInt(v.id, 0, U32_MAX)) {
        if (ids.has(v.id)) add("D4", `${p}.id`, `two variables share the id ${v.id}`);
        ids.add(v.id);
        maxId = Math.max(maxId, v.id);
        if (writer && v.id < 1) add("D5", `${p}.id`, "a writer numbers variables from 1");
      }
      if (!validName(v.name)) add("D3", `${p}.name`, `the name ${JSON.stringify(v.name)} does not follow the name rule`);
      else {
        const key = asciiLower(v.name);
        if (names.has(key)) add("D3", `${p}.name`, `the name ${v.name} is used twice (ignoring case)`);
        names.set(key, n);
      }
      if (typeof v.label !== "string") add("D6", `${p}.label`, "label must be a string (empty for none)");
      if (!MEASURES.has(v.measure)) add("D6", `${p}.measure`, "measure must be nominal, ordinal or scale");
      if (!Array.isArray(v.value_labels)) add("D7", `${p}.value_labels`, "value_labels must be an array");
      else
        v.value_labels.forEach((l, k) => {
          if (!isObject(l) || !finite(l.value) || typeof l.label !== "string") add("D7", `${p}.value_labels[${k}]`, "a value label is {value: a finite number, label: a string}");
        });
      if (!Array.isArray(v.missing_values) || !v.missing_values.every(finite)) add("D7", `${p}.missing_values`, "missing_values must be an array of finite numbers");
      if (v.missing_ranges !== undefined && (!Array.isArray(v.missing_ranges) || !v.missing_ranges.every((r) => Array.isArray(r) && r.length === 2 && finite(r[0]) && finite(r[1]))))
        add("D7", `${p}.missing_ranges`, "missing_ranges must be an array of [low, high] pairs of finite numbers");
    });
    let rows;
    cols.forEach((c, n) => {
      const p = `$.dataset.columns[${n}]`;
      if (!isObject(c) || (c.type !== "numeric" && c.type !== "text") || !Array.isArray(c.values)) return add("D2", p, 'a column is {"type": "numeric" or "text", "values": [...]}');
      if (rows === undefined) rows = c.values.length;
      else if (c.values.length !== rows) add("D1", p, `${vars[n]?.name ?? `column ${n + 1}`} has ${c.values.length} cases where the first column has ${rows}`);
      const bad = c.type === "numeric" ? c.values.findIndex((x) => x !== null && !finite(x)) : c.values.findIndex((x) => x !== null && typeof x !== "string");
      if (bad >= 0) add("D2", `${p}.values[${bad}]`, c.type === "numeric" ? "a numeric cell is a finite number or null" : "a text cell is a string or null");
    });
    integer(ds.next_id, "$.dataset.next_id", 0, U32_MAX, "next_id", "D4");
    if (writer && isInt(ds.next_id) && (ds.next_id < 1 || ds.next_id <= maxId)) add("D5", "$.dataset.next_id", `next_id (${ds.next_id}) must be at least 1 and greater than every variable's id (${maxId})`);
  }

  // Where the data came from.
  if (project.source !== undefined && project.source !== null) {
    const s = project.source;
    if (!isObject(s) || typeof s.file_name !== "string" || !isObject(s.report)) add("S1", "$.source", "source is null, or {file_name: a string, report: an object}");
    else {
      for (const k of ["rows", "variables", "short_rows"]) integer(s.report[k], `$.source.report.${k}`, 0, undefined, k, "S1");
      for (const k of ["long_rows", "skipped_blank_rows"]) if (s.report[k] !== undefined) integer(s.report[k], `$.source.report.${k}`, 0, undefined, k, "S1");
      const pairs = (v) => Array.isArray(v) && v.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === "string" && typeof x[1] === "string");
      if (!pairs(s.report.renamed)) add("S1", "$.source.report.renamed", "renamed must be an array of [original, used] string pairs");
      if (s.report.sas_formats !== undefined && !pairs(s.report.sas_formats)) add("S1", "$.source.report.sas_formats", "sas_formats must be an array of [variable, format] string pairs");
      if (s.report.notes !== undefined && !(Array.isArray(s.report.notes) && s.report.notes.every((x) => typeof x === "string"))) add("S1", "$.source.report.notes", "notes must be an array of strings");
      if (s.report.other_sheets !== undefined && !(Array.isArray(s.report.other_sheets) && s.report.other_sheets.every((x) => typeof x === "string"))) add("S1", "$.source.report.other_sheets", "other_sheets must be an array of strings");
      if (s.report.sheet !== undefined && s.report.sheet !== null && typeof s.report.sheet !== "string") add("S1", "$.source.report.sheet", "sheet must be a string or null");
    }
  }

  // PrismStatistics's own parts, and the profile.
  const byPrism = typeof project.app_version === "string" && /^\d/.test(project.app_version);
  if (writer && !byPrism) {
    if (Array.isArray(project.operations) && project.operations.length > 0) add("O1", "$.operations", "only PrismStatistics writes operations");
    if (Array.isArray(project.results) && project.results.length > 0) add("O1", "$.results", "only PrismStatistics writes results");
    if (project.report !== undefined) add("O1", "$.report", "only PrismStatistics writes report");
    if (project.data_settings !== undefined) add("O1", "$.data_settings", "only PrismStatistics writes data_settings");
  }
  if (Array.isArray(project.operations))
    project.operations.forEach((o, n) => {
      if (!isObject(o) || !isInt(o.seq) || typeof o.command !== "string" || !isObject(o.args)) add("P3", `$.operations[${n}]`, "an operation is {seq: an integer, command: a string, args: an object}");
    });
  if (writer && project.profile === PROFILE_ITEM_RESULTS && problems.length === 0) problems.push(...checkItemResults(project));
  return problems;
}

/**
 * Checks the layout of the OpenAssess item results 1 profile (PSTAT-1 section 7.1). Run by checkProject.
 * @param {any} project a project that already passed the other checks
 */
function checkItemResults(project) {
  const problems = [];
  const add = (path, message) => problems.push({ rule: "F1", path, message });
  const ds = project.dataset;
  const vars = ds.variables;
  const cols = ds.columns;
  if (!/^OpenAssess \S/.test(project.app_version)) add("$.app_version", "app_version is OpenAssess and the release");
  const want = (n, name, measure, label) => {
    const v = vars[n];
    if (!v || v.name !== name) return add(`$.dataset.variables[${n}]`, `variable ${n + 1} must be ${name}`), false;
    if (v.measure !== measure) add(`$.dataset.variables[${n}].measure`, `${name} is ${measure}`);
    if (label !== undefined && v.label !== label) add(`$.dataset.variables[${n}].label`, `${name}'s label is "${label}"`);
    if (cols[n].type !== "numeric") add(`$.dataset.columns[${n}]`, `${name} is numeric`);
    return true;
  };
  if (vars.length < 4) return [{ rule: "F1", path: "$.dataset.variables", message: "the profile has sheet, version, at least one question and total" }];
  want(0, "sheet", "nominal", "Sheet number");
  want(1, "version", "nominal", "Version");
  const last = vars.length - 1;
  want(last, "total", "scale", "Total score");
  const k = last - 2;
  const width = Math.max(2, String(k).length);
  for (let j = 0; j < k; j++) {
    const n = j + 2;
    const name = `q${String(j + 1).padStart(width, "0")}`;
    if (!want(n, name, "scale")) continue;
    if (vars[n].value_labels.length > 0) add(`$.dataset.variables[${n}].value_labels`, `${name} has no value labels`);
    if (vars[n].label !== `Question ${j + 1}`) add(`$.dataset.variables[${n}].label`, `${name}'s label is "Question ${j + 1}" (its number on version A), not the question's text`);
    if (cols[n].values.every((x) => x === null)) add(`$.dataset.columns[${n}]`, `${name} counts on no sheet, so it is left out`);
  }
  vars.forEach((v, n) => {
    if (v.missing_values.length > 0 || (v.missing_ranges ?? []).length > 0) add(`$.dataset.variables[${n}]`, `${v.name} has no missing codes (every gap is null)`);
  });
  const rows = cols[0]?.values.length ?? 0;
  const sheets = cols[0].values;
  for (let r = 0; r < rows; r++) {
    if (!isInt(sheets[r], 1)) add(`$.dataset.columns[0].values[${r}]`, "a sheet number is a whole number from 1");
    else if (r > 0 && isInt(sheets[r - 1]) && sheets[r] <= sheets[r - 1]) add(`$.dataset.columns[0].values[${r}]`, "cases are in sheet-number order, each sheet once");
    const version = cols[1].values[r];
    if (!isInt(version, 1)) add(`$.dataset.columns[1].values[${r}]`, "every exported sheet has its version");
    const total = cols[last].values[r];
    let sum = 0;
    for (let j = 2; j < last; j++) sum += cols[j].values[r] ?? 0;
    if (total === null || Math.abs(total - sum) > 1e-9 * Math.max(1, Math.abs(sum))) add(`$.dataset.columns[${last}].values[${r}]`, `the total (${total}) is the points earned on the questions that count (${sum})`);
  }
  const versionsUsed = new Set(cols[1].values.filter((v) => isInt(v, 1)));
  const labels = new Map(vars[1].value_labels.map((l) => [l.value, l.label]));
  for (const v of versionsUsed) {
    const letter = v <= 26 ? String.fromCharCode(64 + v) : undefined;
    if (letter && labels.get(v) !== letter) add("$.dataset.variables[1].value_labels", `version ${v} is labelled ${letter}`);
  }
  const source = project.source;
  if (!source) add("$.source", "the profile names its source: the test's name followed by \" results\"");
  else {
    if (source.file_name !== `${ds.name} results`) add("$.source.file_name", "file_name is the test's name followed by \" results\"");
    if (source.report.rows !== rows) add("$.source.report.rows", `rows is the number of cases (${rows})`);
    if (source.report.variables !== vars.length) add("$.source.report.variables", `variables is the number of variables (${vars.length})`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Opens a .pstat file as PrismStatistics does: refuses anything that is not a format 1 project or whose dataset does
 * not hold together, and returns the parsed project.json.
 * @param {Uint8Array} bytes
 * @returns {any}
 */
export function readPstat(bytes) {
  let entry;
  try {
    entry = readEntry(bytes, ENTRY);
  } catch (e) {
    if (e instanceof ZipError) throw new PstatError(/unpacks to more/.test(e.message) ? "Z3" : "Z1", `This file isn't a PrismStatistics project, or it is damaged: ${e.message}`);
    throw e;
  }
  if (!entry) throw new PstatError("Z1", "This file isn't a PrismStatistics project: it has no project.json");
  if (entry[0] === 0xef && entry[1] === 0xbb && entry[2] === 0xbf) throw new PstatError("J1", "project.json starts with a byte-order mark");
  let parsed;
  try {
    parsed = parseJson(new TextDecoder("utf-8", { fatal: true }).decode(entry));
  } catch (e) {
    throw new PstatError("J1", `project.json is not UTF-8 JSON: ${e.message}`);
  }
  const project = parsed.value;
  if (!isObject(project) || project.format !== FORMAT) throw new PstatError("P1", "This file isn't a PrismStatistics project");
  if (isInt(project.version) && project.version > VERSION) throw new PstatError("P2", `This project was saved by ${typeof project.app_version === "string" ? project.app_version : "a newer version"}, which is newer than format ${VERSION}`);
  const problems = checkProject(project, { as: "reader", fractional: parsed.fractional });
  if (problems.length > 0) {
    const first = problems[0];
    throw new PstatError(first.rule, `The project is damaged and could not be read: ${first.message} at ${first.path}${problems.length > 1 ? ` (and ${problems.length - 1} more)` : ""}`);
  }
  return project;
}

/**
 * Writes a project as a .pstat file's bytes, after checking it with the writer rules. The same project always makes
 * the same bytes.
 * @param {any} project
 * @returns {Uint8Array}
 */
export function writePstat(project) {
  const problems = checkProject(project, { as: "writer" });
  if (problems.length > 0) throw new PstatError(problems[0].rule, `The project breaks the format: ${problems.map((p) => `${p.message} at ${p.path} (${p.rule})`).join("; ")}`);
  return writeSingleEntry(ENTRY, new TextEncoder().encode(JSON.stringify(project)));
}

/**
 * Checks a .pstat file's bytes against every rule a writer must keep, and returns the problems (empty when sound).
 * For the tests of a tool that writes .pstat files.
 * @param {Uint8Array} bytes
 */
export function checkPstat(bytes) {
  let entry;
  try {
    entry = readEntry(bytes, ENTRY);
  } catch (e) {
    return [{ rule: "Z1", path: "", message: e.message }];
  }
  if (!entry) return [{ rule: "Z1", path: "", message: "no project.json entry" }];
  const problems = [];
  const names = listEntries(bytes);
  if (names.length !== 1) problems.push({ rule: "Z2", path: "", message: `a writer writes project.json as the only entry (found ${names.join(", ")})` });
  if (entry[0] === 0xef && entry[1] === 0xbb && entry[2] === 0xbf) return [...problems, { rule: "J1", path: "", message: "project.json starts with a byte-order mark" }];
  let parsed;
  try {
    parsed = parseJson(new TextDecoder("utf-8", { fatal: true }).decode(entry));
  } catch (e) {
    return [...problems, { rule: "J1", path: "", message: e.message }];
  }
  return [...problems, ...checkProject(parsed.value, { as: "writer", fractional: parsed.fractional })];
}

/** The names of a ZIP archive's entries, from its central directory. */
function listEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) return [];
  const out = [];
  let at = view.getUint32(end + 16, true);
  for (let n = view.getUint16(end + 10, true); n > 0 && at + 46 <= bytes.length; n--) {
    const len = view.getUint16(at + 28, true);
    out.push(new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + len)));
    at += 46 + len + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return out;
}
