// Made cases/course/course.openassess with OpenAssess's own code (OpenAssess commit d1ef945, alpha 29), so the test set
// has a bank written by the real writer: folders, metadata, a picture, an equation, an edit (version 2), a retired
// question, a test and the class figures of a test given on a date. Run from an OpenAssess clone's packages/assess:
//   node --experimental-strip-types --no-warnings <this file> <path to openassess clone> <out.openassess>
// The ids are new each run, so a new file needs new ids in make_cases.mjs; the file in cases/ is the one the set uses.
const root = process.argv[2].replaceAll("\\", "/");
const at_ = (p: string) => `file:///${root.replace(/^\/+/, "")}/packages/assess/src/${p}`;
const { Bank } = await import(at_("bank/store.ts"));
const { createQuestion } = await import(at_("model/create.ts"));
const { createTest } = await import(at_("model/test.ts"));
const { rich } = await import(at_("model/richtext.ts"));
const { newId } = await import(at_("model/ids.ts"));
const { ADMINISTRATION_VERSION } = await import(at_("model/statistics.ts"));

const out = process.argv[3];
const at = "2026-11-10T09:00:00.000Z";
const bank = Bank.createEmpty("Introduction to Printing", { description: "Questions for the printing unit.", subject: "CMP 101", at });
const ch1 = bank.addFolder("Chapter 1: Printers");
const l1 = bank.addFolder("Lesson 1.1: The Print window", ch1.id);
const ch2 = bank.addFolder("Chapter 2: Settings");

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 227, 85, 242, 156, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const mediaId = newId("m");
const mediaFile = `media/${mediaId}.png`;
const mathId = newId("e");

const q1 = createQuestion({
  type: "multipleChoice",
  title: "Which button prints",
  stem: rich(`<p>In the Print window shown, which button sends the pages to the printer?</p><oa-media ref="${mediaId}"></oa-media>`),
  body: {
    shuffle: false,
    options: [
      { id: "o1", content: rich("<p>Print</p>"), correct: true, feedback: rich("<p>Yes: <strong>Print</strong> sends it.</p>") },
      { id: "o2", content: rich("<p>Preview</p>"), correct: false },
      { id: "o3", content: rich("<p>Cancel</p>"), correct: false },
      { id: "o4", content: rich("<p>None of the above</p>"), correct: false, fixedPosition: true },
    ],
  },
  points: 2,
  feedback: { correct: rich("<p>Right.</p>"), incorrect: rich("<p>Look at the bottom right of the window.</p>") },
  metadata: { objective: "Print a document", chapter: "1", section: "1.1", page: "12", bloom: "remember", difficulty: "easy", tags: ["print window", "buttons"], author: "Test author", status: "approved" },
  media: [{ id: mediaId, file: mediaFile, mime: "image/png", alt: "The Print window, with the Print button at the bottom right", width: 1, height: 1 }],
  by: "Test author",
  at,
});
bank.add(q1, { folderId: l1.id, media: new Map([[mediaFile, png]]) });

const q2 = createQuestion({
  type: "numeric",
  title: "Pages on a sheet",
  stem: rich(`<p>Two pages per sheet and <oa-math ref="${mathId}"></oa-math> pages: how many sheets?</p>`),
  body: { mode: "exact", value: 5 },
  math: [{ id: mathId, latex: "n = 10", mathml: '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>n</mi><mo>=</mo><mn>10</mn></math>', source: "typed" }],
  metadata: { objective: "Work out sheets of paper", chapter: "1", bloom: "apply", difficulty: "medium", tags: [], status: "reviewed" },
  by: "Test author",
  at,
});
bank.add(q2, { folderId: ch1.id });

const q3 = createQuestion({
  type: "essay",
  title: "Why preview",
  stem: rich("<p>Explain why someone might preview a document before printing it.</p>"),
  body: { modelAnswer: rich("<p>To catch layout problems and save paper.</p>"), rubric: [{ criterion: "Names a reason", points: 2 }, { criterion: "Explains it", points: 3, description: "Says what goes wrong without it" }], expectedWords: 80 },
  points: 5,
  metadata: { objective: "Explain print preview", chapter: "2", bloom: "understand", tags: ["preview"], status: "draft" },
  by: "Test author",
  at,
});
bank.add(q3, { folderId: ch2.id });

const q4 = createQuestion({
  type: "trueFalse",
  title: "Old dialog",
  stem: rich("<p>The Print window has a Fax button.</p>"),
  body: { correct: false },
  metadata: { chapter: "2", tags: [], status: "retired" },
  by: "Test author",
  at,
});
bank.add(q4, { folderId: ch2.id });

const q5 = createQuestion({
  type: "ordering",
  title: "Steps to print",
  stem: rich("<p>Put the steps in order.</p>"),
  body: { items: [{ id: "i1", content: rich("<p>Press Ctrl+P</p>"), position: 1 }, { id: "i2", content: rich("<p>Choose the printer</p>"), position: 2 }, { id: "i3", content: rich("<p>Press Print</p>"), position: 3 }] },
  metadata: { objective: "Print a document", chapter: "1", bloom: "apply", tags: [], status: "draft" },
  by: "Test author",
  at,
});
bank.add(q5);

// An edit: the stem of question 2 changes, so its version becomes 2 and its history says so.
bank.update(q2.id, { title: "Sheets for ten pages" }, { by: "Second author", at: "2026-11-12T10:00:00.000Z", change: "retitled" });

const test = createTest({ name: "Unit quiz", questions: [bank.get(q1.id)!, bank.get(q2.id)!], at: "2026-11-13T08:00:00.000Z", seed: "a1b2c3d4e5f6" });
bank.addTest(test);
bank.addAdministration({
  recordVersion: ADMINISTRATION_VERSION,
  id: newId("adm"),
  testId: test.id,
  testName: test.name,
  date: "2026-11-14",
  sheets: 24,
  unstable: true,
  items: [
    { questionId: q1.id, sheets: 24, version: 1, difficulty: 0.75, options: [{ answer: "o1", chosen: 18 }, { answer: "o2", chosen: 4 }, { answer: "o3", chosen: 2 }, { answer: "o4", chosen: 0 }], blanks: 0 },
    { questionId: q2.id, sheets: 24, version: 2, difficulty: 0.5, options: [], blanks: 1 },
  ],
});

const written = await bank.save(out);
console.log(`wrote ${written}`);
console.log(JSON.stringify({ q1: q1.id, q2: q2.id, q3: q3.id, q4: q4.id, q5: q5.id, ch1: ch1.id, l1: l1.id, ch2: ch2.id, test: test.id, media: mediaFile, math: mathId }, null, 1));
