# BANK-1: the OpenAssess question bank, as other tools read it

Revision 1.0, 2026-11-16. Format: `openassess-bank`, **format version 1**, file ending `.openassess`. Written from
OpenAssess at commit d1ef945 (alpha 29), its model (`packages/assess/src/model`) and two banks its own code wrote.

OpenAssess writes banks; other OpenStage tools read them: OpenStage Author (quiz slides and the four games),
OpenStage Guide (its bank import and design desk), and any tool that wants a course's questions. This spec says what
a bank file holds, what a reader may rely on, and the reader's view of a question that
[`@openstage/bank`](../../packages/bank) gives. **Writing a bank stays OpenAssess's work.**

| | |
|---|---|
| The reader | [`packages/bank`](../../packages/bank) (`@openstage/bank` 0.1.0): JavaScript with no dependencies, for Node and the browser. Tag `bank-v0.1.0`. |
| The test set | [`testsets/bank`](../../testsets/bank/README.md): 9 cases, two of them banks OpenAssess wrote, with what a reader must give for each. |

**Who changes the format.** OpenAssess. A change a reader would see (a new member, a new question type, a new format
version) is written into this spec in the same round as OpenAssess makes it, with a new revision, and the test set
gains a case for it; a new format version is refused by readers of this one (section 7.1) until they are moved on.

## 1. Words used here

**Bank**: one file per course or book. **Question**: one item, with an id that never changes and a version that goes
up by one at each saved edit (the reader calls it the **revision**). **Folder**: a place in the bank's tree; a question
is in at most one. **Test**: a set of questions put together to be given. **Administration**: the figures of one class
that took a test, on a date.

## 2. The container

A ZIP archive (stored and deflated entries). Names, with `/` between parts:

| Entry | | A reader |
|---|---|---|
| `manifest.json` | What the file is (section 3). | Must have it. |
| `folders.json` | The folder tree and saved filters (section 4). | Reads it if there; a bank may have none. |
| `questions/<id>.json` | One file a question (section 5). | Reads each. |
| `media/<id>.<ext>` | Pictures and other files a question names. | Reads a file when asked for it. |
| `tests/<id>.json` | Tests put together, each with a copy of its questions as they were. | Reads which questions each holds (section 6). |
| `statistics/<id>.json` | A class's figures for a test (never a student's answers). | Reads the date and which questions it covers (section 6). |
| `history.jsonl` | The bank's own change log, a JSON object a line. | May skip it; each question carries its own history. |
| `blueprints/*.json`, `profiles/*.json` | OpenAssess's recipes for tests and its import profiles. | Skips them. |
| `folders.damaged.json`, `history.damaged.jsonl`, others | Files OpenAssess kept because it could not read them. | Skips them. |

One file a question makes a bank diffable in a shared folder, and lets one damaged question leave the others whole.

## 3. The manifest

```json
{
  "format": "openassess-bank", "formatVersion": 1,
  "bankId": "bank_01M7JCE7N9BVGSWMY93T6WR6MR",
  "title": "Introduction to Printing", "description": "Questions for the printing unit.", "subject": "CMP 101",
  "created": "2026-11-10T09:00:00.000Z", "modified": "2026-11-16T14:33:37.217Z",
  "questionCount": 5, "generator": "@openstage/assess 0.1.0"
}
```

`format` must be `openassess-bank`. `formatVersion` is a whole number; this revision covers 1. `description` and
`subject` (a course code or an ISBN) are optional. `questionCount` is what OpenAssess wrote, not a promise: count
the questions read.

Ids are a prefix, `_`, and 26 letters and digits of Crockford's base 32 (no I, L, O or U): `bank_` a bank, `q_` a
question, `f_` a folder, `m_` a picture, `e_` an equation, `t_` a test, `adm_` an administration.

## 4. Folders

```json
{ "root": [ { "id": "f_...", "name": "Chapter 1: Printers", "questionIds": ["q_..."], "children": [ ... ] } ], "filters": [] }
```

`root` is the top folders in order; each has its `questionIds` in order and its `children`. A question is in at most
one folder; a reader that meets one twice keeps the first. `filters` are OpenAssess's saved searches; a reader skips
them.

## 5. A question

### 5.1 The envelope

| Member | |
|---|---|
| `id` | `q_` and 26 characters. The file's name is the id, but the id inside wins. |
| `version` | 1, then one more at each saved edit. |
| `type` | One of `multipleChoice`, `multipleResponse`, `trueFalse`, `fillInBlank`, `matching`, `ordering`, `numeric`, `shortAnswer`, `essay`, `hotspot`, `calculated`. |
| `title` | Up to 64 characters. |
| `stem` | Rich text (5.2): the question. |
| `points` | 0 to 1000. |
| `body` | The type's own members (5.3). |
| `feedback` | `general`, `correct`, `incorrect`, each rich text, each optional. |
| `metadata` | 5.4. |
| `media`, `math` | The pictures and equations the text names (5.5). |
| `findings` | OpenAssess's notes on the question (`code`, `severity` error, warn or info, `message`, and `dismissed` when a person dismissed one). |
| `history` | `{ at, by, change, fromVersion?, toVersion? }`, oldest first. |
| `origin` | Where it came from: `kind` authored, import, copy or link, and for an import the file and lines. |

OpenAssess refuses any other member on a question: attempts, time limits, when answers are shown, weights and the like
belong to a quiz or a course, not to a question. A tool keeps those in its own project, by question id.

### 5.2 Rich text

`{ "format": "rich" | "plain", "content": "..." }`. Plain is text, paragraphs apart by a blank line. Rich is HTML from
a closed list: `p`, `br`, `strong`, `em`, `u`, `s`, `sub`, `sup`, `code`, `pre`, `ul`, `ol` (`start`), `li`,
`blockquote`, `table`, `thead`, `tbody`, `tr`, `th` (`colspan`, `rowspan`, `scope`), `td` (`colspan`, `rowspan`), and
two placeholders: `<oa-media ref="m_...">` for a picture and `<oa-math ref="e_...">` for an equation, which name an
entry of the question's `media` or `math`.

**A bank can come from anyone**, so a reader never trusts its HTML: it keeps only the list above with those
attributes (values checked), takes other tags out and keeps their words, takes `script`, `style` and the like out with
their content, and escapes a stray `<` or `&`. The reader reports how much it took out (section 7.2).

### 5.3 The bodies

| Type | `body` | The answer |
|---|---|---|
| `multipleChoice` | `shuffle`, `options`: `[{ id, content, correct, feedback?, fixedPosition? }]` (2 or more) | The option marked `correct`. The answer lives on the option, never in a separate list. |
| `multipleResponse` | the same, and `partialCredit` (false: all or nothing) | Every option marked `correct`. |
| `trueFalse` | `correct`: true or false, or absent | Absent means nobody gave the answer, which is not False. |
| `fillInBlank` | `caseSensitive`, `blanks`: `[{ id, label?, accepted: [...] }]` | The accepted words of each blank. `""` is how a blank with no answer is stored. |
| `shortAnswer` | `caseSensitive`, `accepted` | The accepted words; `""` stores none. |
| `matching` | `shuffle`, `pairs`: `[{ id, left (rich text), right (text) }]`, `distractors` | Each left with its right; distractors match nothing. |
| `ordering` | `items`: `[{ id, content, position }]` | `position`, 1 to n. |
| `numeric` | `mode` exact, range or tolerance; `value`, `min`, `max`, `tolerance`, `units` | exact: `value`; range: `min` to `max`; tolerance: `value` plus or minus `tolerance`. |
| `essay` | `modelAnswer?`, `rubric?`: `[{ criterion, points, description? }]`, `expectedWords?` | Scored by a person. |
| `hotspot` | `mediaRef`, `regions`: `[{ id, shape rect/circle/poly, coords, correct }]`, `alternative` (rich text, required) | Not yet offered by OpenAssess. |
| `calculated` | `formula`, `variables`: `[{ name, min, max, decimals }]`, `tolerance`, `toleranceIsPercent` | Not yet offered by OpenAssess. |

### 5.4 Details

`metadata`: `objective`, `chapter`, `section`, `page`, `author` (text, each optional); `bloom` (remember, understand,
apply, analyze, evaluate, create); `difficulty` (easy, medium, hard); `tags` (a list); `status` (draft, reviewed,
approved, retired: OpenAssess returns an edited question to draft); `custom` (a publisher's other labels, text to
text).

### 5.5 Pictures and equations

`media`: `[{ id, file, mime, alt, decorative?, width?, height? }]`, `file` being the entry in `media/`. An empty `alt`
is right only for a decorative picture. A question can name a file the bank does not hold (a sync that lost it); the
question is still read and the reader says so. `math`: `[{ id, latex, mathml, omml?, source? }]`, both LaTeX and
MathML kept for every equation.

## 6. Where a question was used

A test (`tests/<id>.json`) holds `id`, `name`, `created`, and `questions`, copies of the questions as they were when it
was put together. An administration (`statistics/<id>.json`) holds `id`, `testId`, `testName`, `date` (YYYY-MM-DD),
`sheets`, and `items`, one a question (`questionId`, `sheets`, `version`, difficulty and discrimination, how many
chose each answer). Never a student's name or answers.

A reader takes from these which tests hold a question and the dates it was given: **last given** is the latest
administration date whose items name it.

## 7. Reading rules

### 7.1 A file that is not read at all

| Code | When |
|---|---|
| `not-a-zip` | It is not a ZIP archive (or one this reader does not read: ZIP64, encrypted). |
| `no-manifest` | It has no `manifest.json`. |
| `damaged-manifest` | Its manifest is not JSON. |
| `not-a-bank` | Its manifest's `format` is not `openassess-bank`. |
| `no-version` | Its manifest has no whole `formatVersion` of 1 or more. |
| `newer-format` | Its `formatVersion` is higher than the reader's. **Refused, never read in part**: reading a newer bank and dropping what is not understood is how a shared bank loses work. |

### 7.2 Problems inside a bank that is read

Each is listed (`{ file, questionId?, message, skipped }`) and none stops the rest:

- `folders.json` that cannot be read: every question is read as in no folder.
- A question file that is not JSON, whose packed bytes do not match their check value, with no `q_` id, a type that is
  not format 1's, no body, no stem, points that are not 0 or more, or a body whose options, pairs, items or blanks
  cannot be read: **skipped**.
- Two files holding one id: the first read (by file name) is kept, the other **skipped**.
- A file named for another id: read under the id inside.
- A status that is not format 1's: read as a draft.
- A picture the bank does not hold.
- HTML outside the subset, taken out (5.2).
- A test or administration file that cannot be read: **skipped**; the questions are unaffected.

### 7.3 Limits

The reader refuses an archive of more than 100,000 entries, an entry that unpacks to more than 256 MB, a JSON entry of
more than 64 MB, and more than 2 GB unpacked in all; it reads at most 200,000 question files. It checks each entry's
size and CRC-32.

## 8. The reader's view

### 8.1 The bank

`readBank(bytes)` gives `format`, `formatVersion`, `bankId`, `title` ("Untitled bank" when empty), `description`,
`subject`, `created`, `modified`, `generator`; `folders` (each `{ id, name, path, parentId, depth, questionIds }`, top
to bottom, each before the folders inside it); `questions`, in that folder order and then those in no folder by id;
`tests` (`{ id, name, created, questionIds }`) and `administrations` (`{ id, testId, testName, date, sheets,
questionIds }`), oldest first; `problems`; and `media(file)`, a picture's bytes, or null.

### 8.2 A question

| Member | |
|---|---|
| `id`, `revision`, `type`, `typeName`, `title`, `points` | `typeName` in words ("Multiple choice"). `title` falls back to the stem's first 64 characters. |
| `stem` | `{ html, text }`: the HTML cleaned (5.2), and plain text with a line for each paragraph, line break, list item, table row and quotation, a picture as `[Picture: its description]` (`[Picture]` without one; nothing for a decorative one), and an equation as `[Equation: its LaTeX]`. |
| `options` | Multiple choice and multiple response: `[{ id, text, correct, fixed, feedback? }]` in the bank's order (`fixed` is `fixedPosition`). |
| `shuffle` | Multiple choice, multiple response, matching. |
| `key` | The answer, by type: `{ correct: [ids] }` (and `partialCredit` for multiple response); `{ correct: true, false or null }`; `{ caseSensitive, blanks }`; `{ caseSensitive, accepted }`; `{ pairs: [{ id, left, right }], distractors }`; `{ items }` in their right order; `{ mode, value, min, max, tolerance, units }`; `{ modelAnswer, rubric, expectedWords }`; and for hotspot and calculated the body's members. Empty accepted words are left out. |
| `hasKey` | Whether the bank records an answer: a correct option; true or false given; every blank with a word; an accepted word; every pair with a right side; positions 1 to n; a number (or a range, or a value and a tolerance); a model answer or a rubric; a correct region; a formula. |
| `feedback` | `{ general, correct, incorrect }`, each `{ html, text }` when there. |
| `metadata` | 5.4, values that are not format 1's left out (`tags` always a list, `status` always one of the four). |
| `folder` | `{ id, name, path }`, or null. |
| `pictures` | `[{ id, file, mime, alt, decorative, width, height, present }]`; `present` says whether the bank holds the file. |
| `equations` | `[{ id, latex, mathml, source }]`. |
| `history`, `lastChanged` | The question's history; `lastChanged` is its last entry's `{ at, by }`, or null. |
| `usage` | `{ tests: [test ids], timesGiven, lastGiven }`. |
| `findings` | OpenAssess's notes nobody dismissed: `{ code, severity, message }`. |
| `origin` | As stored. |
| `raw` | The question's JSON as stored, **not cleaned**: for a member this view does not give, never for putting HTML on a page. |

What a tool does with a type it cannot show (a hotspot in a tool with no pictures to click, an essay in a game) is the
tool's to decide and to say; the reader gives every type.

## 9. The test set

[`testsets/bank`](../../testsets/bank/README.md). `node testsets/bank/check/check_reader.mjs --module <file>` checks any
module that exports `readBank` the way `@openstage/bank` does.

## 10. Changes

- **1.0** (2026-11-16): first revision, for format version 1 as OpenAssess alpha 29 writes it.
