// @openstage/bank: reads an OpenAssess question bank (a .openassess file, format 1; specs/bank/BANK-1.md) and gives
// each question with its key, its details, its folder, its pictures and equations, its history and when it was last
// given, in plain data. What it cannot read it reports and does not guess. No dependencies; Node 20 or later, or any
// browser.

import { openZip, ZipError } from "./zip.js";
import { readText } from "./text.js";

export { cleanHtml, htmlToText, decodeEntities, ALLOWED_TAGS } from "./text.js";

export const BANK_FORMAT = "openassess-bank";
export const BANK_FORMAT_VERSION = 1;
export const EXTENSION = ".openassess";
export const SPEC_REVISION = "1.0";

export const QUESTION_TYPES = ["multipleChoice", "multipleResponse", "trueFalse", "fillInBlank", "matching", "ordering", "numeric", "shortAnswer", "essay", "hotspot", "calculated"];
export const TYPE_NAMES = {
  multipleChoice: "Multiple choice",
  multipleResponse: "Multiple response",
  trueFalse: "True or false",
  fillInBlank: "Fill in the blank",
  matching: "Matching",
  ordering: "Ordering",
  numeric: "Numeric",
  shortAnswer: "Short answer",
  essay: "Essay",
  hotspot: "Hotspot",
  calculated: "Calculated",
};
export const BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
export const DIFFICULTIES = ["easy", "medium", "hard"];
export const STATUSES = ["draft", "reviewed", "approved", "retired"];

/** Why a file cannot be read as a bank at all. `code` is one of the codes in BANK-1 section 7.1. */
export class BankError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BankError";
    this.code = code;
  }
}

const MAX_JSON = 64 * 1024 * 1024;
const decoder = new TextDecoder();
const textOf = (bytes) => decoder.decode(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : undefined);
const nonEmpty = (v) => (typeof v === "string" && v.trim() !== "" ? v : undefined);
const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Reads a bank from its bytes.
 * @param {Uint8Array} bytes
 * @param {{ inflateRaw?: (data: Uint8Array, limit: number) => Uint8Array | Promise<Uint8Array>, maxQuestions?: number }} [options]
 */
export async function readBank(bytes, options = {}) {
  let zip;
  try {
    zip = openZip(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes, { inflateRaw: options.inflateRaw, maxEntry: 256 * 1024 * 1024 });
  } catch (e) {
    throw new BankError("not-a-zip", `This file could not be opened as an OpenAssess bank: ${e.message}.`);
  }
  const problems = [];
  const json = async (name) => {
    const data = await zip.entry(name);
    if (data.length > MAX_JSON) throw new Error(`it is larger than ${MAX_JSON / (1024 * 1024)} MB`);
    return JSON.parse(textOf(data));
  };

  // The manifest (section 3).
  if (!zip.has("manifest.json")) throw new BankError("no-manifest", "This file has no manifest.json, so it is not an OpenAssess bank.");
  let manifest;
  try {
    manifest = await json("manifest.json");
  } catch (e) {
    throw new BankError("damaged-manifest", `The bank's manifest could not be read (${e.message}), so the file may be damaged.`);
  }
  if (!isObject(manifest) || manifest.format !== BANK_FORMAT) {
    const said = isObject(manifest) && typeof manifest.format === "string" ? `"${manifest.format}"` : "nothing";
    throw new BankError("not-a-bank", `This file's manifest says it is ${said}, not an OpenAssess bank.`);
  }
  const version = manifest.formatVersion;
  if (!Number.isInteger(version) || version < 1) throw new BankError("no-version", "This bank's manifest does not say which format version it is written in.");
  if (version > BANK_FORMAT_VERSION) {
    throw new BankError("newer-format", `This bank is written in format ${version}, and this reader reads format ${BANK_FORMAT_VERSION}. Use a newer reader, or save the bank in an older OpenAssess.`);
  }

  // The folders (section 4).
  let folderNodes = [];
  if (zip.has("folders.json")) {
    try {
      const f = await json("folders.json");
      if (!isObject(f) || !Array.isArray(f.root)) throw new Error("it does not hold a list of folders");
      folderNodes = f.root;
    } catch (e) {
      problems.push({ file: "folders.json", message: `The folders could not be read (${e.message}), so every question is read as in no folder.`, skipped: false });
    }
  }
  const folders = [];
  const folderOf = new Map();
  const seenFolders = new Set();
  const walk = (nodes, path, parentId, depth) => {
    if (!Array.isArray(nodes) || depth > 64) return;
    for (const n of nodes) {
      if (!isObject(n) || typeof n.id !== "string" || seenFolders.has(n.id)) continue;
      seenFolders.add(n.id);
      const name = nonEmpty(n.name) ?? "Folder";
      const folder = { id: n.id, name, path: [...path, name], parentId, depth, questionIds: [] };
      folders.push(folder);
      for (const q of Array.isArray(n.questionIds) ? n.questionIds : []) {
        if (typeof q === "string" && !folderOf.has(q)) {
          folderOf.set(q, folder);
          folder.questionIds.push(q);
        }
      }
      walk(n.children, folder.path, n.id, depth + 1);
    }
  };
  walk(folderNodes, [], null, 0);

  // Tests and class figures (section 6), for where each question was used.
  const tests = [];
  const administrations = [];
  for (const name of zip.names) {
    if (/^tests\/[^/]+\.json$/.test(name)) {
      try {
        const t = await json(name);
        if (!isObject(t) || typeof t.id !== "string") throw new Error("it is not a test");
        const ids = [];
        for (const q of Array.isArray(t.questions) ? t.questions : []) if (isObject(q) && typeof q.id === "string" && !ids.includes(q.id)) ids.push(q.id);
        tests.push({ id: t.id, name: str(t.name) ?? "", created: str(t.created) ?? "", questionIds: ids });
      } catch (e) {
        problems.push({ file: name, message: `A test could not be read (${e.message}).`, skipped: true });
      }
    } else if (/^statistics\/[^/]+\.json$/.test(name)) {
      try {
        const a = await json(name);
        if (!isObject(a) || typeof a.id !== "string" || typeof a.date !== "string") throw new Error("it is not a class's figures");
        const items = Array.isArray(a.items) ? a.items.filter((i) => isObject(i) && typeof i.questionId === "string") : [];
        administrations.push({ id: a.id, testId: str(a.testId) ?? "", testName: str(a.testName) ?? "", date: a.date, sheets: finite(a.sheets) ?? 0, questionIds: items.map((i) => i.questionId), items });
      } catch (e) {
        problems.push({ file: name, message: `A class's figures could not be read (${e.message}).`, skipped: true });
      }
    }
  }
  administrations.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id < y.id ? -1 : 1));
  tests.sort((x, y) => (x.created < y.created ? -1 : x.created > y.created ? 1 : x.id < y.id ? -1 : 1));

  // The questions (section 5).
  const questionFiles = zip.names.filter((n) => /^questions\/[^/]+\.json$/.test(n)).sort();
  const maxQuestions = options.maxQuestions ?? 200_000;
  if (questionFiles.length > maxQuestions) problems.push({ file: "questions/", message: `The bank has ${questionFiles.length} question files; only the first ${maxQuestions} are read.`, skipped: true });
  const byId = new Map();
  for (const file of questionFiles.slice(0, maxQuestions)) {
    const fileId = file.slice("questions/".length, -".json".length);
    let raw;
    try {
      raw = await json(file);
    } catch (e) {
      problems.push({ file, questionId: fileId, message: `The question file could not be read (${e.message}).`, skipped: true });
      continue;
    }
    const result = readQuestion(raw, file);
    if (result.problem) {
      problems.push({ file, questionId: str(raw?.id) ?? fileId, message: result.problem, skipped: true });
      continue;
    }
    const q = result.question;
    if (byId.has(q.id)) {
      problems.push({ file, questionId: q.id, message: `Another file in the bank already holds the question ${q.id}, so this copy was not read.`, skipped: true });
      continue;
    }
    if (q.id !== fileId) problems.push({ file, questionId: q.id, message: `The file is named for ${fileId}, but the question in it is ${q.id}. It was read as ${q.id}.`, skipped: false });
    for (const note of result.notes) problems.push({ file, questionId: q.id, message: note, skipped: false });
    for (const p of q.pictures) {
      p.present = zip.has(p.file);
      if (!p.present) problems.push({ file, questionId: q.id, message: `The picture ${p.file} is not in the bank.`, skipped: false });
    }
    const folder = folderOf.get(q.id);
    q.folder = folder ? { id: folder.id, name: folder.name, path: [...folder.path] } : null;
    const given = administrations.filter((a) => a.questionIds.includes(q.id));
    q.usage = { tests: tests.filter((t) => t.questionIds.includes(q.id)).map((t) => t.id), timesGiven: given.length, lastGiven: given.length ? given[given.length - 1].date : null };
    byId.set(q.id, q);
  }

  // In folder order, then the questions in no folder by id.
  const questions = [];
  const placed = new Set();
  for (const f of folders) {
    f.questionIds = f.questionIds.filter((id) => byId.has(id));
    for (const id of f.questionIds) {
      questions.push(byId.get(id));
      placed.add(id);
    }
  }
  for (const id of [...byId.keys()].sort()) if (!placed.has(id)) questions.push(byId.get(id));

  return {
    format: BANK_FORMAT,
    formatVersion: version,
    bankId: str(manifest.bankId) ?? "",
    title: nonEmpty(manifest.title) ?? "Untitled bank",
    ...(nonEmpty(manifest.description) ? { description: manifest.description } : {}),
    ...(nonEmpty(manifest.subject) ? { subject: manifest.subject } : {}),
    created: str(manifest.created) ?? "",
    modified: str(manifest.modified) ?? "",
    generator: str(manifest.generator) ?? "",
    folders,
    questions,
    tests,
    administrations: administrations.map(({ items, ...a }) => a),
    problems,
    /** A file of the bank (a picture's `file`), its bytes, or `null` when the bank does not hold it. */
    async media(file) {
      if (typeof file !== "string" || !file.startsWith("media/") || !zip.has(file)) return null;
      return zip.entry(file);
    },
  };
}

/** A question file's JSON as the reader's view (section 8.2), or why it cannot be read. Exported for a tool's tests. */
export function readQuestion(raw, file = "") {
  if (!isObject(raw)) return { problem: "The question file does not hold a question." };
  const id = raw.id;
  if (typeof id !== "string" || !/^q_[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return { problem: "The question has no id of the form q_ and 26 letters and digits." };
  if (!QUESTION_TYPES.includes(raw.type)) return { problem: `The question's type "${String(raw.type)}" is not one of format 1's types, so it was not read.` };
  if (!isObject(raw.body)) return { problem: "The question has no body, so its answers cannot be read." };
  const notes = [];
  let removed = 0;
  const pictures = (Array.isArray(raw.media) ? raw.media : [])
    .filter((m) => isObject(m) && typeof m.id === "string" && typeof m.file === "string")
    .map((m) => ({
      id: m.id,
      file: m.file,
      mime: str(m.mime) ?? "",
      alt: str(m.alt) ?? "",
      decorative: m.decorative === true,
      ...(finite(m.width) ? { width: m.width } : {}),
      ...(finite(m.height) ? { height: m.height } : {}),
      present: false,
    }));
  const equations = (Array.isArray(raw.math) ? raw.math : [])
    .filter((m) => isObject(m) && typeof m.id === "string")
    .map((m) => ({ id: m.id, latex: str(m.latex) ?? "", mathml: str(m.mathml) ?? "", ...(str(m.source) ? { source: m.source } : {}) }));
  const sidecars = { pictures, equations };
  const text = (v) => {
    const r = readText(v, sidecars);
    if (!r) return null;
    removed += r.removed;
    return r.text;
  };
  const stem = text(raw.stem);
  if (!stem || stem.text === "" && !/<oa-(media|math)/.test(stem.html)) return { problem: "The question has no stem (no question text)." };
  const points = finite(raw.points);
  if (points === undefined || points < 0) return { problem: "The question's points are not a number of 0 or more." };

  const b = raw.body;
  const type = raw.type;
  const q = {
    id,
    revision: Number.isInteger(raw.version) && raw.version >= 1 ? raw.version : 1,
    type,
    typeName: TYPE_NAMES[type],
    title: nonEmpty(raw.title) ?? stem.text.slice(0, 64),
    stem,
    points,
  };
  const options = () => {
    if (!Array.isArray(b.options) || b.options.length < 2) return null;
    const out = [];
    for (const o of b.options) {
      if (!isObject(o) || typeof o.id !== "string") return null;
      const t = text(o.content);
      if (!t) return null;
      const option = { id: o.id, text: t, correct: o.correct === true, fixed: o.fixedPosition === true };
      const fb = text(o.feedback);
      if (fb) option.feedback = fb;
      out.push(option);
    }
    return out;
  };
  switch (type) {
    case "multipleChoice":
    case "multipleResponse": {
      const opts = options();
      if (!opts) return { problem: "The question's options cannot be read (it needs two or more, each with an id and words)." };
      q.options = opts;
      q.shuffle = b.shuffle === true;
      q.key = { correct: opts.filter((o) => o.correct).map((o) => o.id) };
      if (type === "multipleResponse") q.key.partialCredit = b.partialCredit === true;
      q.hasKey = q.key.correct.length > 0;
      break;
    }
    case "trueFalse":
      q.key = { correct: typeof b.correct === "boolean" ? b.correct : null };
      q.hasKey = q.key.correct !== null;
      break;
    case "fillInBlank": {
      if (!Array.isArray(b.blanks) || b.blanks.length === 0) return { problem: "The question has no blanks." };
      const blanks = b.blanks.filter(isObject).map((x, i) => ({
        id: str(x.id) ?? `b${i + 1}`,
        ...(nonEmpty(x.label) ? { label: x.label } : {}),
        accepted: (Array.isArray(x.accepted) ? x.accepted : []).filter((a) => typeof a === "string" && a.trim() !== ""),
      }));
      q.key = { caseSensitive: b.caseSensitive === true, blanks };
      q.hasKey = blanks.length > 0 && blanks.every((x) => x.accepted.length > 0);
      break;
    }
    case "shortAnswer": {
      const accepted = (Array.isArray(b.accepted) ? b.accepted : []).filter((a) => typeof a === "string" && a.trim() !== "");
      q.key = { caseSensitive: b.caseSensitive === true, accepted };
      q.hasKey = accepted.length > 0;
      break;
    }
    case "matching": {
      if (!Array.isArray(b.pairs) || b.pairs.length < 2) return { problem: "The question has fewer than two pairs." };
      const pairs = [];
      for (const p of b.pairs) {
        const left = isObject(p) ? text(p.left) : null;
        if (!left || typeof p.id !== "string" || typeof p.right !== "string") return { problem: "A pair of the question cannot be read." };
        pairs.push({ id: p.id, left, right: p.right });
      }
      q.shuffle = b.shuffle === true;
      q.key = { pairs, distractors: (Array.isArray(b.distractors) ? b.distractors : []).filter((d) => typeof d === "string" && d.trim() !== "") };
      q.hasKey = pairs.every((p) => p.right.trim() !== "");
      break;
    }
    case "ordering": {
      if (!Array.isArray(b.items) || b.items.length < 2) return { problem: "The question has fewer than two items to put in order." };
      const items = [];
      for (const it of b.items) {
        const t = isObject(it) ? text(it.content) : null;
        if (!t || typeof it.id !== "string" || !Number.isInteger(it.position)) return { problem: "An item of the question cannot be read." };
        items.push({ id: it.id, text: t, position: it.position });
      }
      items.sort((x, y) => x.position - y.position);
      q.key = { items };
      q.hasKey = items.every((it, i) => it.position === i + 1);
      break;
    }
    case "numeric": {
      const mode = ["exact", "range", "tolerance"].includes(b.mode) ? b.mode : null;
      if (!mode) return { problem: "The question's numeric answer has no mode (exact, range or tolerance)." };
      q.key = { mode };
      for (const k of ["value", "min", "max", "tolerance"]) if (finite(b[k]) !== undefined) q.key[k] = b[k];
      if (nonEmpty(b.units)) q.key.units = b.units;
      q.hasKey = mode === "range" ? q.key.min !== undefined && q.key.max !== undefined : q.key.value !== undefined && (mode === "exact" || q.key.tolerance !== undefined);
      break;
    }
    case "essay": {
      const model = text(b.modelAnswer);
      q.key = {
        ...(model && model.text ? { modelAnswer: model } : {}),
        rubric: (Array.isArray(b.rubric) ? b.rubric : [])
          .filter((r) => isObject(r) && typeof r.criterion === "string")
          .map((r) => ({ criterion: r.criterion, points: finite(r.points) ?? 0, ...(nonEmpty(r.description) ? { description: r.description } : {}) })),
        ...(finite(b.expectedWords) ? { expectedWords: b.expectedWords } : {}),
      };
      q.hasKey = Boolean(q.key.modelAnswer) || q.key.rubric.length > 0;
      break;
    }
    case "hotspot": {
      const alternative = text(b.alternative);
      q.key = { mediaRef: str(b.mediaRef) ?? "", regions: Array.isArray(b.regions) ? b.regions.filter(isObject) : [], ...(alternative ? { alternative } : {}) };
      q.hasKey = q.key.regions.some((r) => r.correct === true);
      break;
    }
    case "calculated":
      q.key = { formula: str(b.formula) ?? "", variables: Array.isArray(b.variables) ? b.variables.filter(isObject) : [], tolerance: finite(b.tolerance) ?? 0, toleranceIsPercent: b.toleranceIsPercent === true };
      q.hasKey = q.key.formula.trim() !== "";
      break;
  }

  const fb = isObject(raw.feedback) ? raw.feedback : {};
  q.feedback = {};
  for (const k of ["general", "correct", "incorrect"]) {
    const t = text(fb[k]);
    if (t && (t.text || t.html)) q.feedback[k] = t;
  }

  const m = isObject(raw.metadata) ? raw.metadata : {};
  q.metadata = {
    ...(nonEmpty(m.objective) ? { objective: m.objective } : {}),
    ...(nonEmpty(m.chapter) ? { chapter: m.chapter } : {}),
    ...(nonEmpty(m.section) ? { section: m.section } : {}),
    ...(nonEmpty(m.page) ? { page: m.page } : {}),
    ...(BLOOM_LEVELS.includes(m.bloom) ? { bloom: m.bloom } : {}),
    ...(DIFFICULTIES.includes(m.difficulty) ? { difficulty: m.difficulty } : {}),
    tags: (Array.isArray(m.tags) ? m.tags : []).filter((t) => typeof t === "string" && t.trim() !== ""),
    ...(nonEmpty(m.author) ? { author: m.author } : {}),
    status: STATUSES.includes(m.status) ? m.status : "draft",
    ...(isObject(m.custom) ? { custom: Object.fromEntries(Object.entries(m.custom).filter(([, v]) => typeof v === "string")) } : {}),
  };
  if (!STATUSES.includes(m.status)) notes.push("The question's status could not be read, so it is read as a draft.");

  q.pictures = pictures;
  q.equations = equations;
  q.history = (Array.isArray(raw.history) ? raw.history : [])
    .filter((h) => isObject(h) && typeof h.at === "string")
    .map((h) => ({ at: h.at, by: str(h.by) ?? "", change: str(h.change) ?? "", ...(Number.isInteger(h.fromVersion) ? { fromVersion: h.fromVersion } : {}), ...(Number.isInteger(h.toVersion) ? { toVersion: h.toVersion } : {}) }));
  const last = q.history[q.history.length - 1];
  q.lastChanged = last ? { at: last.at, by: last.by } : null;
  q.findings = (Array.isArray(raw.findings) ? raw.findings : [])
    .filter((f) => isObject(f) && typeof f.code === "string" && f.dismissed !== true)
    .map((f) => ({ code: f.code, severity: ["error", "warn", "info"].includes(f.severity) ? f.severity : "info", message: str(f.message) ?? "" }));
  if (isObject(raw.origin)) q.origin = raw.origin;
  q.folder = null;
  q.usage = { tests: [], timesGiven: 0, lastGiven: null };
  if (removed > 0) notes.push(`Formatting that a bank does not allow was taken out of the question's text (${removed} ${removed === 1 ? "piece" : "pieces"}).`);
  q.raw = raw;
  return { question: q, notes, file };
}

export { ZipError };
