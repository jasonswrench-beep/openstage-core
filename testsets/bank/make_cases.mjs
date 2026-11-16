// Writes the bank reader's test set (BANK-1 section 9): the hand-made cases' banks, and expected.json for every case.
// Two cases are banks OpenAssess itself wrote (gift-import: its importer, from sources/printing.gift; course: its bank
// code, from sources/make_course_bank.ts); this script leaves those files as they are and writes only what a reader
// must give for them, worked out from their sources by hand. Run from anywhere:  node testsets/bank/make_cases.mjs
// SHA256SUMS.txt is rewritten.

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { writeArchive } from "../../packages/pstat/src/zip.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const enc = (s) => new TextEncoder().encode(typeof s === "string" ? s : JSON.stringify(s, null, 2));
const cases = [];
const text = (t) => ({ text: t });

// 1. A bank OpenAssess's importer wrote from a GIFT file (sources/printing.gift).
const G = (s) => `q_01M7JCBXT${s}`;
const giftTags = (t) => ({ tags: [t], status: "draft" });
cases.push({
  id: "gift-import",
  about: "A bank written by OpenAssess's own importer from sources/printing.gift (alpha 29): one question of each of eight types, no folders (GIFT's categories become tags), the importer's history entry. Every value here comes from the GIFT file.",
  input: "printing.openassess",
  expected: {
    bank: { title: "printing", bankId: "bank_01M7JCBXTCC8E01SYTR70RRQXS", formatVersion: 1, folders: [], tests: [], administrations: [] },
    questions: [
      {
        id: G("6CFYJMBAH2G7C96FR"), type: "multipleChoice", typeName: "Multiple choice", title: "Default printer", revision: 1, points: 1,
        stem: text("Which printer does a program use when you press Ctrl+P?"),
        options: [
          { id: "o1", text: text("The default printer"), correct: true, feedback: text("Right: the default printer is used unless you choose another.") },
          { id: "o2", text: text("The last printer you used"), correct: false, feedback: text("Not unless you set it that way.") },
          { id: "o3", text: text("The nearest printer"), correct: false },
          { id: "o4", text: text("A printer chosen at random"), correct: false },
        ],
        key: { correct: ["o1"] }, hasKey: true, metadata: giftTags("Printing/Choosing a printer"), folder: null,
        history: [{ by: "import", change: "created", toVersion: 1 }], usage: { tests: [], timesGiven: 0, lastGiven: null },
      },
      {
        id: G("83KZ0PD9KNMNJHG1B"), type: "multipleResponse", title: "Paper sizes", stem: text("Which of these are paper sizes?"),
        options: [{ id: "o1", text: text("Letter"), correct: true }, { id: "o2", text: text("A4"), correct: true }, { id: "o3", text: text("Ledger blue"), correct: false }],
        key: { correct: ["o1", "o2"], partialCredit: true }, hasKey: true, metadata: giftTags("Printing/Choosing a printer"),
      },
      { id: G("963DN443KJZ9XP451"), type: "trueFalse", typeName: "True or false", title: "Print preview", stem: text("Print preview shows the pages before they are printed."), key: { correct: true }, hasKey: true },
      {
        id: G("963DN443KJZ9XP452"), type: "fillInBlank", title: "Copies box", stem: text("The box for how many copies to print is called the _____ box."),
        key: { caseSensitive: false, blanks: [{ id: "b1", accepted: ["Copies", "copies count"] }] }, hasKey: true, metadata: giftTags("Printing/Settings"),
      },
      { id: G("963DN443KJZ9XP453"), type: "shortAnswer", title: "Shortcut", stem: text("Which key, held with P, opens the Print window?"), key: { caseSensitive: false, accepted: ["Ctrl", "Control"] }, hasKey: true },
      {
        id: G("963DN443KJZ9XP454"), type: "matching", title: "Match the setting", stem: text("Match each setting with what it does."),
        key: {
          pairs: [
            { id: "p1", left: text("Copies"), right: "How many of each page" },
            { id: "p2", left: text("Orientation"), right: "Which way the page turns" },
            { id: "p3", left: text("Scale"), right: "How large the page prints" },
          ],
          distractors: [],
        },
        hasKey: true,
      },
      { id: G("A6BFWGMYAMZ7RX5M8"), type: "numeric", title: "Pages per sheet", key: { mode: "exact", value: 2 }, hasKey: true },
      { id: G("A6BFWGMYAMZ7RX5M9"), type: "numeric", title: "Margins", key: { mode: "tolerance", value: 25, tolerance: 5 }, hasKey: true },
      { id: G("A6BFWGMYAMZ7RX5MA"), type: "essay", title: "Why preview", key: { rubric: [] }, hasKey: false, stem: text("Explain why someone might preview a document before printing it.") },
    ],
    problems: [],
  },
});

// 2. A bank OpenAssess's bank code wrote (sources/make_course_bank.ts).
const C = {
  q1: "q_01M7JCE7NC6DG3C864WZNNNW8Z", q2: "q_01M7JCE7NW8E69S95NMNP6HJGG", q3: "q_01M7JCE7NX3G04N1GZR3A6E9VF", q4: "q_01M7JCE7NY7VJYCEV5JPDHYHMZ", q5: "q_01M7JCE7NY7VJYCEV5JPDHYHN0",
  ch1: "f_01M7JCE7NAF5W0XJ3AVV70EF17", l1: "f_01M7JCE7NB0T2DQBDB3DG4RWMT", ch2: "f_01M7JCE7NB0T2DQBDB3DG4RWMV", test: "t_01M7JCE7NZ0YGSQQ2YY5GD07RM",
  media: "media/m_01M7JCE7NB0T2DQBDB3DG4RWMW.png",
};
const CH1 = "Chapter 1: Printers";
const L1 = "Lesson 1.1: The Print window";
const CH2 = "Chapter 2: Settings";
cases.push({
  id: "course",
  about: "A bank written by OpenAssess's bank code (sources/make_course_bank.ts, alpha 29): three folders, one inside another; full details on a question; a picture and its bytes; an equation; question 2 edited by a second author (version 2, and back to draft, since OpenAssess returns an edited reviewed question to draft); a retired question; a question in no folder; a test of questions 1 and 2, and a class's figures for it dated 2026-11-14. Every value comes from the script.",
  input: "course.openassess",
  expected: {
    bank: {
      title: "Introduction to Printing", description: "Questions for the printing unit.", subject: "CMP 101", bankId: "bank_01M7JCE7N9BVGSWMY93T6WR6MR", created: "2026-11-10T09:00:00.000Z",
      folders: [
        { id: C.ch1, name: CH1, path: [CH1], parentId: null, depth: 0, questionIds: [C.q2] },
        { id: C.l1, name: L1, path: [CH1, L1], parentId: C.ch1, depth: 1, questionIds: [C.q1] },
        { id: C.ch2, name: CH2, path: [CH2], parentId: null, depth: 0, questionIds: [C.q3, C.q4] },
      ],
      tests: [{ id: C.test, name: "Unit quiz", created: "2026-11-13T08:00:00.000Z", questionIds: [C.q1, C.q2] }],
      administrations: [{ testId: C.test, testName: "Unit quiz", date: "2026-11-14", sheets: 24, questionIds: [C.q1, C.q2] }],
    },
    questions: [
      {
        id: C.q2, type: "numeric", title: "Sheets for ten pages", revision: 2, points: 1,
        stem: text("Two pages per sheet and [Equation: n = 10] pages: how many sheets?"),
        key: { mode: "exact", value: 5 }, hasKey: true,
        equations: [{ latex: "n = 10", source: "typed" }],
        metadata: { objective: "Work out sheets of paper", chapter: "1", bloom: "apply", difficulty: "medium", tags: [], status: "draft" },
        history: [{ by: "Test author", change: "created", toVersion: 1 }, { at: "2026-11-12T10:00:00.000Z", by: "Second author", change: "retitled", fromVersion: 1, toVersion: 2 }],
        lastChanged: { at: "2026-11-12T10:00:00.000Z", by: "Second author" },
        folder: { id: C.ch1, name: CH1, path: [CH1] },
        usage: { tests: [C.test], timesGiven: 1, lastGiven: "2026-11-14" },
      },
      {
        id: C.q1, type: "multipleChoice", title: "Which button prints", revision: 1, points: 2,
        stem: { html: `<p>In the Print window shown, which button sends the pages to the printer?</p><oa-media ref="m_01M7JCE7NB0T2DQBDB3DG4RWMW"></oa-media>`, text: "In the Print window shown, which button sends the pages to the printer?\n[Picture: The Print window, with the Print button at the bottom right]" },
        shuffle: false,
        options: [
          { id: "o1", text: text("Print"), correct: true, fixed: false, feedback: { html: "<p>Yes: <strong>Print</strong> sends it.</p>", text: "Yes: Print sends it." } },
          { id: "o2", text: text("Preview"), correct: false },
          { id: "o3", text: text("Cancel"), correct: false },
          { id: "o4", text: text("None of the above"), correct: false, fixed: true },
        ],
        key: { correct: ["o1"] }, hasKey: true,
        feedback: { correct: text("Right."), incorrect: text("Look at the bottom right of the window.") },
        metadata: { objective: "Print a document", chapter: "1", section: "1.1", page: "12", bloom: "remember", difficulty: "easy", tags: ["print window", "buttons"], author: "Test author", status: "approved" },
        pictures: [{ file: C.media, mime: "image/png", alt: "The Print window, with the Print button at the bottom right", decorative: false, width: 1, height: 1, present: true }],
        findings: [{ code: "quality.all-or-none-of-the-above" }, { code: "a11y.alt-text-gives-answer" }],
        folder: { id: C.l1, name: L1, path: [CH1, L1] },
        usage: { tests: [C.test], timesGiven: 1, lastGiven: "2026-11-14" },
      },
      {
        id: C.q3, type: "essay", title: "Why preview", points: 5,
        key: { modelAnswer: text("To catch layout problems and save paper."), rubric: [{ criterion: "Names a reason", points: 2 }, { criterion: "Explains it", points: 3, description: "Says what goes wrong without it" }], expectedWords: 80 },
        hasKey: true, metadata: { objective: "Explain print preview", chapter: "2", bloom: "understand", tags: ["preview"], status: "draft" },
        folder: { id: C.ch2, name: CH2, path: [CH2] }, usage: { tests: [], timesGiven: 0, lastGiven: null },
      },
      { id: C.q4, type: "trueFalse", title: "Old dialog", key: { correct: false }, hasKey: true, metadata: { chapter: "2", tags: [], status: "retired" }, folder: { id: C.ch2 } },
      {
        id: C.q5, type: "ordering", title: "Steps to print",
        key: { items: [{ id: "i1", text: text("Press Ctrl+P"), position: 1 }, { id: "i2", text: text("Choose the printer"), position: 2 }, { id: "i3", text: text("Press Print"), position: 3 }] },
        hasKey: true, folder: null,
      },
    ],
    media: [{ file: C.media, bytes: 68, sha256: "9f00b9c41b4ef20c302df206851543bd63a0ec9d4aa6f191156a27880496ecfe" }, { file: "media/m_not_there.png", bytes: null }],
    problems: [],
  },
});

// The hand-made cases.
const MANIFEST = (over = {}) => ({ format: "openassess-bank", formatVersion: 1, bankId: "bank_01KA9C4B000000000000000000", title: "Hand-made bank", created: "2026-11-16T00:00:00.000Z", modified: "2026-11-16T00:00:00.000Z", questionCount: 0, generator: "openstage-core test set", ...over });
const id = (n) => `q_01KA9C4B00000000000000000${n}`;
const rt = (content) => ({ format: "rich", content });
const base = (qid, type, title, stem, body, more = {}) => ({
  id: qid, version: 1, type, title, stem: rt(stem), points: 1, body, feedback: {}, metadata: { tags: [], status: "draft" }, media: [], math: [], findings: [], history: [{ at: "2026-11-16T00:00:00.000Z", by: "test", change: "created", toVersion: 1 }], ...more,
});
const mc = (qid, title) => base(qid, "multipleChoice", title, "<p>Pick one.</p>", { shuffle: true, options: [{ id: "o1", content: rt("<p>A</p>"), correct: true }, { id: "o2", content: rt("<p>B</p>"), correct: false }] });
const bank = (entries) => writeArchive(Object.entries(entries).map(([name, data]) => ({ name, data: data instanceof Uint8Array ? data : enc(data), method: name.endsWith(".png") ? 0 : 8 })));

cases.push({
  id: "damaged",
  about: "A bank with something wrong in many places: folders.json is not JSON (every question is then in no folder); a question file that is not JSON; a type format 1 does not have; a question with no stem; two files holding one id; a question in a file named for another id, with a status that is not one of format 1's; a picture the bank does not hold; HTML outside the subset (an attribute, a script, a picture, a link) and a plain-text feedback. Each is reported, and none stops the rest being read.",
  input: "damaged.openassess",
  build: () =>
    bank({
      "manifest.json": MANIFEST(),
      "folders.json": "{ not json",
      [`questions/${id(1)}.json`]: mc(id(1), "Fine"),
      [`questions/${id(2)}.json`]: "{ cut short",
      [`questions/${id(3)}.json`]: base(id(3), "dragAndDrop", "Drag", "<p>Drag it.</p>", {}),
      [`questions/${id(4)}.json`]: base(id(4), "trueFalse", "No stem", "", { correct: true }),
      [`questions/${id(6)}.json`]: { ...base(id(5), "trueFalse", "Named wrongly", "<p>The sky is green.</p>", { correct: false }), metadata: { tags: [], status: "published" } },
      [`questions/${id(7)}.json`]: mc(id(1), "A second copy"),
      [`questions/${id(8)}.json`]: base(id(8), "shortAnswer", "Missing picture", `<p>Name the key.</p><oa-media ref="m_gone"></oa-media>`, { caseSensitive: false, accepted: ["Ctrl", ""] }, { media: [{ id: "m_gone", file: "media/m_gone.png", mime: "image/png", alt: "A keyboard" }] }),
      [`questions/${id(9)}.json`]: base(id(9), "multipleChoice", "Cleaned", `<p onclick="x()">Pick <script>alert(1)</script><img src=x onerror=alert(1)>one &amp; only</p><a href="javascript:x">link</a>`, { shuffle: false, options: [{ id: "o1", content: rt("<p>A</p>"), correct: false }, { id: "o2", content: rt("<p>B &lt; C</p>"), correct: false }] }, { feedback: { general: { format: "plain", content: "Line one\nLine two\n\nNew para <b>" } } }),
    }),
  expected: {
    bank: { title: "Hand-made bank", folders: [] },
    questions: [
      { id: id(1), title: "Fine", folder: null, key: { correct: ["o1"] } },
      { id: id(5), title: "Named wrongly", key: { correct: false }, metadata: { status: "draft" } },
      { id: id(8), key: { caseSensitive: false, accepted: ["Ctrl"] }, hasKey: true, pictures: [{ file: "media/m_gone.png", alt: "A keyboard", present: false }], stem: { text: "Name the key.\n[Picture: A keyboard]" } },
      {
        id: id(9), title: "Cleaned", hasKey: false, key: { correct: [] },
        stem: { html: "<p>Pick one &amp; only</p>link", text: "Pick one & only\nlink" },
        options: [{ id: "o1", text: text("A") }, { id: "o2", text: { html: "<p>B &lt; C</p>", text: "B < C" } }],
        feedback: { general: { html: "<p>Line one<br>Line two</p><p>New para &lt;b&gt;</p>", text: "Line one\nLine two\nNew para <b>" } },
      },
    ],
    problems: [
      { file: "folders.json", skipped: false, contains: "folders could not be read" },
      { file: `questions/${id(2)}.json`, questionId: id(2), skipped: true, contains: "could not be read" },
      { file: `questions/${id(3)}.json`, questionId: id(3), skipped: true, contains: `type "dragAndDrop"` },
      { file: `questions/${id(4)}.json`, questionId: id(4), skipped: true, contains: "no stem" },
      { file: `questions/${id(6)}.json`, questionId: id(5), skipped: false, contains: "named for" },
      { file: `questions/${id(6)}.json`, questionId: id(5), skipped: false, contains: "status could not be read" },
      { file: `questions/${id(7)}.json`, questionId: id(1), skipped: true, contains: "already holds" },
      { file: `questions/${id(8)}.json`, questionId: id(8), skipped: false, contains: "media/m_gone.png is not in the bank" },
      { file: `questions/${id(9)}.json`, questionId: id(9), skipped: false, contains: "(5 pieces)" },
    ],
  },
});

cases.push({
  id: "damaged-zip",
  about: "A bank whose second question's stored bytes were changed after it was packed, so its check value no longer matches: that question is reported and the other is read.",
  input: "damaged-zip.openassess",
  build: () => {
    const marker = "<p>Pick one, damaged.</p>";
    const bytes = writeArchive([
      { name: "manifest.json", data: enc(MANIFEST()), method: 8 },
      { name: `questions/${id(1)}.json`, data: enc(mc(id(1), "Fine")), method: 0 },
      { name: `questions/${id(2)}.json`, data: enc(base(id(2), "trueFalse", "Damaged", marker, { correct: true })), method: 0 },
    ]);
    const at = Buffer.from(bytes).indexOf(Buffer.from("damaged."));
    bytes[at] = "D".charCodeAt(0);
    return bytes;
  },
  expected: {
    questions: [{ id: id(1), title: "Fine" }],
    problems: [{ file: `questions/${id(2)}.json`, questionId: id(2), skipped: true, contains: "check value does not match" }],
  },
});

cases.push({ id: "newer-format", about: "A bank of format 2: refused, never read in part.", input: "newer.openassess", build: () => bank({ "manifest.json": MANIFEST({ formatVersion: 2 }), [`questions/${id(1)}.json`]: mc(id(1), "Fine") }), expected: { error: "newer-format" } });
cases.push({ id: "not-a-bank", about: "A ZIP whose manifest says it is something else.", input: "other.openassess", build: () => bank({ "manifest.json": { format: "moodle-backup", formatVersion: 1 } }), expected: { error: "not-a-bank" } });
cases.push({ id: "no-manifest", about: "A ZIP of questions with no manifest.", input: "no-manifest.openassess", build: () => bank({ [`questions/${id(1)}.json`]: mc(id(1), "Fine") }), expected: { error: "no-manifest" } });
cases.push({ id: "no-version", about: "A manifest that says it is a bank and gives no format version.", input: "no-version.openassess", build: () => bank({ "manifest.json": MANIFEST({ formatVersion: undefined }) }), expected: { error: "no-version" } });
cases.push({ id: "not-a-zip", about: "A text file named as a bank.", input: "text.openassess", build: () => enc("This is not a bank.\n"), expected: { error: "not-a-zip" } });

// Write the cases.
for (const c of cases) {
  const dir = join(HERE, "cases", c.id);
  mkdirSync(dir, { recursive: true });
  if (c.build) writeFileSync(join(dir, c.input), c.build());
  writeFileSync(join(dir, "expected.json"), JSON.stringify({ id: c.id, about: c.about, input: c.input, ...c.expected }, null, 2) + "\n");
}
writeFileSync(join(HERE, "cases.json"), JSON.stringify(cases.map((c) => c.id), null, 2) + "\n");

const all = [];
const walk = (d) => {
  for (const e of readdirSync(d).sort()) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else all.push(p);
  }
};
walk(HERE);
const sums = all
  .filter((p) => !p.endsWith("SHA256SUMS.txt"))
  .map((p) => `${createHash("sha256").update(readFileSync(p)).digest("hex")}  ${relative(HERE, p).split("\\").join("/")}`)
  .join("\n");
writeFileSync(join(HERE, "SHA256SUMS.txt"), sums + "\n");
console.log(`${cases.length} cases written`);
