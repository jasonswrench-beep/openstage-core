# The .pstat project file, format 1

**Spec revision 1.1, 2026-11-15. Status: locked.**

A `.pstat` file is a PrismStatistics project: one dataset with its variables, labels and missing codes, where the data
came from, and PrismStatistics's record of the analyses run on it and their results. PrismStatistics has written this
format since 0.1.0 and called the extension provisional; from revision 1.0 the name, the extension and format 1 are
fixed. Other tools (OpenAssess for its item results, PrismQDA for its case table) may write a `.pstat` file that
PrismStatistics opens.

The words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119. Section 8 lists every rule with a number, and the
checker in `packages/pstat` reports problems by those numbers.

## 1. Versions of the format and of this document

- The number inside the file (`version`, section 3) is the **format version**. This document is format **1**.
- The **spec revision** (1.0 here) goes up for changes a reader of format 1 can safely ignore: a new optional member, a
  new optional entry in the archive, a new profile (section 7), or clearer wording. Those changes keep `version: 1`.
- Anything a reader of format 1 would misread (a member that changes meaning, a required member added, a different
  container) is format 2. Format 2 gets its own document; it never changes this one.
- A reader MUST refuse a file whose `version` is higher than the highest it knows, saying which program and version made
  the file (from `app_version`), rather than open it and lose what it cannot read. PrismStatistics does this today.

## 2. The container

- A `.pstat` file is a ZIP archive (PKWARE APPNOTE). The extension is `.pstat`, in lower case.
- It MUST hold an entry named exactly `project.json` at the root of the archive (no folder, matched with case).
- That entry MUST be stored (method 0) or compressed with deflate (method 8), and MUST NOT be encrypted.
- A writer of format 1 writes `project.json` and, when the file follows a profile that has a **part** (below), that
  part's entry, and no other entry; each compressed with deflate. A reader of format 1 MUST ignore any entry it does not
  know.
- **A profile part** is one more entry, at the root, whose name the profile fixes (`assessment.json`,
  `case-table.json`). It is JSON under the same rules as `project.json` (section 3: UTF-8 with no byte-order mark, one
  object, finite numbers, integers written as integers), stored or deflated and not encrypted. It refers to variables
  only by their `id` (section 4), never by name or position, so it stays right when a variable is renamed or moved. Its
  first two members are `part` (the part's name) and `version` (an integer, the part's own version).
- A reader that keeps `profile` when it saves a file SHOULD also carry the profile's part over, byte for byte. By then a
  part may name a variable the user has deleted; a reader ignores such a reference. A reader that drops `profile` drops
  the part too.
- A reader MAY refuse a `project.json` that unpacks to more than 1 GiB (1,073,741,824 bytes). PrismStatistics does, and
  stops reading at that point whatever size the entry claims.
- Informational: PrismStatistics saves by writing `<name>.pstat.saving`, reading it back, and renaming it over the old
  file, and keeps the version it replaced as `<name>.backup.pstat`. Other writers SHOULD also write a temporary file
  and rename it, so a crash never leaves half a file.

## 3. project.json

`project.json` is one JSON object (RFC 8259), encoded as UTF-8 **without** a byte-order mark. Every number in it MUST be
finite and fit in a 64-bit floating-point number. A member defined as an **integer** MUST be written as a JSON integer,
with no fraction or exponent (`3`, not `3.0` or `3e0`): PrismStatistics refuses `3.0` where it expects a count or an ID.

| Member | Type | Required | Meaning |
|---|---|---|---|
| `format` | string | yes | Exactly `PrismStatistics project`. Anything else is not a project. |
| `version` | integer | yes | The format version: `1`. |
| `app_version` | string | yes | The program that wrote the file and its version. PrismStatistics writes its bare version (`0.1.1`); any other writer MUST write its own name first (`OpenAssess 0.1.0-alpha.28`). |
| `dataset` | object | yes | The data (section 4). |
| `source` | object or null | no | Where the data came from (section 5). Absent and `null` mean the same. |
| `operations` | array | yes | PrismStatistics's operation record (section 6). May be empty. |
| `results` | array | yes | PrismStatistics's stored results (section 6). May be empty. |
| `report` | object | no | PrismStatistics's Report Builder layout (section 6). |
| `data_settings` | object | no | PrismStatistics's Select cases, Split file and Weight cases settings (section 6). |
| `profile` | string | no | The name of the profile the file follows (section 7), so a reader can recognise, for example, OpenAssess item results. |

A reader MUST ignore a member it does not know. A reader that saves the file again MAY drop members it does not know
(PrismStatistics does), so a writer MUST NOT put anything in an unknown member that the user would miss if it went.

## 4. The dataset

```json
{
  "name": "Midterm",
  "variables": [ ... ],
  "columns": [ ... ],
  "next_id": 4
}
```

| Member | Type | Meaning |
|---|---|---|
| `name` | string | The dataset's name, shown as the project's title. |
| `variables` | array of variable objects | One per column, in the order shown in Data View. |
| `columns` | array of column objects | The data, one column per variable, in the same order. |
| `next_id` | integer | Required. The ID the next new variable will get. A writer MUST make it greater than every variable's `id` (and at least 1). |

A **variable**:

| Member | Type | Meaning |
|---|---|---|
| `id` | integer, 0 to 4294967295 | Stable for the life of the dataset; results stay linked to a renamed variable through it. Distinct within the dataset. A writer numbers variables from 1. |
| `name` | string | See the name rule below. |
| `label` | string | The variable label; `""` for none. Output shows the label when there is one, otherwise the name. |
| `measure` | `"nominal"`, `"ordinal"` or `"scale"` | The level of measurement. By convention a numeric variable starts as `scale` and a text one as `nominal`. |
| `value_labels` | array of `{"value": number, "label": string}` | Labels for codes (`1` means "Female"). Values MUST be finite. A writer SHOULD give value labels only to numeric variables. |
| `missing_values` | array of numbers | Codes that mean missing for this variable (user-missing), such as `-99`. Finite. |
| `missing_ranges` | array of `[low, high]` pairs | Optional. Ranges of codes that mean missing, inclusive at both ends. Finite. |

**The name rule.** A name starts with a letter, then has letters, digits and underscores only, and is at most 64
characters long. "Letter" is the Unicode Alphabetic property and "digit" the Unicode Number categories, as Rust's
`char::is_alphabetic` and `char::is_alphanumeric` define them; a writer SHOULD keep to ASCII letters and digits so every
tool reads the names the same way. Names MUST be distinct when compared without regard to ASCII case (`Score` and `score`
cannot both appear).

A **column** is one of:

```json
{ "type": "numeric", "values": [1, 0, null, 2.5] }
{ "type": "text", "values": ["North", null, "South"] }
```

- `values` holds one cell per case. Every column MUST have the same number of cells; that number is the number of cases.
- In a numeric column a cell is a finite number or `null`. In a text column a cell is a string or `null`.
- `null` is **system missing** (an empty cell). A user-missing code (listed in `missing_values` or `missing_ranges`)
  stays in the data as the number it is, so it can be shown and switched off, and analyses leave it out.
- `variables` and `columns` MUST have the same length.

## 5. Where the data came from

```json
{
  "file_name": "Midterm results",
  "report": { "rows": 32, "variables": 9, "renamed": [], "short_rows": 0, "notes": ["3 sheets were left out ..."] }
}
```

`file_name` (string) names the source as the user would know it; PrismStatistics writes the file name it imported.
`report` describes the import:

| Member | Type | Required | Meaning |
|---|---|---|---|
| `rows` | integer | yes | Cases read. |
| `variables` | integer | yes | Variables read. |
| `renamed` | array of `[original, used]` string pairs | yes | Header names changed to make valid, distinct names. |
| `short_rows` | integer | yes | Rows shorter than the header, padded with empty cells. |
| `long_rows` | integer | no | Rows longer than the header; the extra fields were left out. |
| `skipped_blank_rows` | integer | no | Fully empty rows left out. |
| `sheet` | string or null | no | The workbook sheet that was read. |
| `other_sheets` | array of strings | no | The workbook's other sheets, not read. |
| `notes` | array of strings | no | Anything else the user should know, in plain sentences. |
| `sas_formats` | array of `[variable, format]` string pairs | no | SAS format names, for attaching a format catalog later. |

A writer other than PrismStatistics SHOULD put in `notes` everything it left out or changed on the way, so nothing is
dropped without the user being told.

## 6. The parts PrismStatistics owns

`operations`, `results`, `report` and `data_settings` hold PrismStatistics's own work: each analysis and variable
change in order with its settings (`{"seq": 1, "command": "reliability", "args": {...}}`), the result bundles they made,
the Report Builder's layout, and the current case selection, split and weight.

- Their inner shape belongs to PrismStatistics and is not fixed by this document beyond what is said here. A reader
  other than PrismStatistics MUST NOT depend on it and MAY ignore all four.
- A writer other than PrismStatistics MUST write `"operations": []` and `"results": []` and MUST NOT write `report` or
  `data_settings`. An operation record it made up would claim analyses that were never run, and a result it wrote
  would carry figures PrismStatistics did not compute.
- An operation, where present, has `seq` (integer), `command` (string, a command of PrismStatistics's script language)
  and `args` (object).

## 7. Profiles

A profile fixes how one kind of writer lays its data out, so a reader can rely on the layout. A file that follows one
says so in `profile`. A profile only narrows format 1; a file that follows a profile is an ordinary format 1 file. A
profile may add a part (section 2), which then MUST be in the file.

| Profile | Section | Writer | Part |
|---|---|---|---|
| `OpenAssess item results 1` | 7.1 | OpenAssess | none |
| `OpenAssess item results 2` | 7.2 | OpenAssess | `assessment.json` |
| `PrismQDA case table 1` | 7.3 | PrismQDA | `case-table.json` |

### 7.1 `OpenAssess item results`, profile version 1

What OpenAssess writes when a class's scored answer sheets are sent to PrismStatistics. The C3 test set's `.pstat`
files follow it exactly, and both tools are checked against the same files (see `testsets/item-analysis`).

- `profile` is `OpenAssess item results 1`.
- `app_version` is `OpenAssess` and the release (`OpenAssess 0.1.0-alpha.28`).
- `dataset.name` is the test's name.
- One case per **complete** sheet: every question that counts on it is settled, no page is missing, and its version is
  known. These are the sheets OpenAssess's own item statistics use. Cases are in sheet-number order.
- The variables, in this order:
  1. `sheet`: numeric, `nominal`, label `Sheet number`. The sheet's number.
  2. `version`: numeric, `nominal`, label `Version`, value labels `1` `A`, `2` `B` and so on for each version used.
  3. One variable per question that counts on at least one exported sheet, in the order the test was assembled, which
     is version A's order. Numeric, `scale`, no value labels.
     - **The name** is `q` and the question's number on version A, with at least two digits and as many as the number
       of questions on version A needs (`q001` on a test of 100 questions or more). **The label** is `Question` and the
       same number (`Question 7`). A question that is left out (below) leaves its number unused, so the names may skip
       (`q01`, `q03`), and a variable's name and its label always carry the same number.
     - The question's text is not written: a results file is often shared, a test's questions are kept secure, and
       PrismStatistics puts labels into its written results, where a list of question texts would not read well.
     - The cell is the points earned on that sheet, which may be a fraction when the question gives partial credit;
       `null` when the question does not count on that sheet (an adjustment for one version).
     - A question that does not count on any exported sheet is left out, and `notes` says so.
  4. `total`: numeric, `scale`, label `Total score`: the points earned on the questions that count on the sheet.
- No variable has missing codes: every gap is `null`.
- `source.file_name` is the test's name followed by ` results`. `source.report` has `rows` and `variables` as written,
  `renamed: []`, `short_rows: 0`, and `notes` saying how many sheets were left out and why, and any question left out.
- `operations` and `results` are empty (section 6).

### 7.2 `OpenAssess item results`, profile version 2

What OpenAssess writes when the file should also carry the letters marked, the key and the details of each question,
tied to the bank's question ids so that files from different semesters can be matched. Everything section 7.1 says
holds, except that `profile` is `OpenAssess item results 2`; then:

- **The variables up to `total` are exactly profile 1's.** After `total` come, in this order:
  1. **One answer variable per `q` variable**, only when the marks are known: scanned sheets have them; a learning
     system's report gives points only, and then no answer variable is written. Same order as the `q` variables, named
     `r` with the same number and digits (`r07` beside `q07`), text, `nominal`, label `Question 7 answer`, no value
     labels.
     - The cell is the letters marked on that sheet **in version A's lettering**: the first option as version A prints
       it is `A`, whatever version the sheet was. Capital letters, in alphabetical order, with nothing between them
       (`B`, `AC`). A true/false question is `A` for True and `B` for False.
     - `""` when the sheet was left blank on that question. `null` exactly where the `q` cell is `null`.
     - Several letters on a one-answer question are written as marked (`AB`); such an answer earns nothing.
  2. **`student_id`**, optional and **off by default**: text, `nominal`, label `Student ID`. An id the instructor
     typed or imported for each sheet, written only when the person chose to include it; `null` for a sheet without
     one. Never a name. A writer with no ids writes no such variable.
- **The part `assessment.json`** (section 2) is required:

```json
{
  "part": "OpenAssess assessment",
  "version": 1,
  "test": { "id": "t_01KA8V6F3Q0000000000000000", "name": "Unit 3 quiz", "given": "2026-11-10",
            "source": "scanned sheets", "versions": ["A", "B"], "questions": 3, "sheets_left_out": 1 },
  "questions": [
    { "number": 1, "bank_id": "q_01KA8V6F3Q0000000000000001", "revision": 2,
      "points_variable": 3, "answer_variable": 7, "type": "multiple_choice",
      "options": ["A", "B", "C", "D"], "option_ids": ["o1", "o2", "o3", "o4"], "option_labels": null,
      "key": [{ "correct": ["B", "D"], "points": 1, "adjustment": "none", "partial_credit": false }],
      "details": { "objective": "Name the parts of a cell", "chapter": "3", "section": "3.2", "page": null,
                   "bloom": "remember", "difficulty": "easy", "tags": [] } }
  ]
}
```

`test`:

| Member | Type | Meaning |
|---|---|---|
| `id` | string | OpenAssess's id for the test (`t_` and 26 characters). A learning system's report gets a new id each time it is read. |
| `name` | string | The test's name, as `dataset.name`. |
| `given` | string or null | The day the test was given, `YYYY-MM-DD`; `null` when not known. |
| `source` | string | `scanned sheets` or `learning system report`. |
| `versions` | array of strings | The test's version letters in order (`["A", "B"]`); version number *n* in the `version` variable is the *n*th. |
| `questions` | integer | The number of questions on version A, written or left out. |
| `sheets_left_out` | integer | Sheets not written because they are not complete. |

`questions` has one entry per question on version A, in version A's order, **including the questions left out**:

| Member | Type | Meaning |
|---|---|---|
| `number` | integer | The question's number on version A, from 1: the number in its variables' names and labels. |
| `bank_id` | string | The bank's id for the question (`q_` and 26 characters). It never changes, so it matches files across tests and semesters. |
| `revision` | integer | The question's version number in the bank when the test was assembled (it goes up with each edit), from 1. |
| `points_variable` | integer or null | The `id` of its `q` variable; `null` when the question was left out. |
| `answer_variable` | integer or null | The `id` of its `r` variable; `null` when it was left out or no answer variables were written. |
| `type` | string | `multiple_choice`, `select_all`, `true_false`, or `other` for a question with no letters (from a learning system's report). |
| `options` | array of strings | The letters of its options on version A (`["A", "B", "C", "D"]`); `["A", "B"]` for true/false; `[]` for `other`. |
| `option_ids` | array of strings | The bank's id of each option, in the same order (`["o1", "o3", "o2", "o4"]`); `["true", "false"]` for true/false; `[]` for `other`. |
| `option_labels` | object or null | `{"A": "True", "B": "False"}` for true/false, otherwise `null`. The text of an option is never written. |
| `key` | array of key entries | How the question was scored (below). |
| `details` | object | `objective`, `chapter`, `section`, `page` (each a string or `null`), `bloom` (`remember`, `understand`, `apply`, `analyze`, `evaluate`, `create` or `null`), `difficulty` (`easy`, `medium`, `hard` or `null`) and `tags` (an array of strings), as the question stood when the test was assembled. |

A **key entry**:

| Member | Type | Meaning |
|---|---|---|
| `versions` | array of integers | Optional: the version numbers the entry applies to. A question has either one entry without `versions`, or several whose lists together name every version of the test exactly once. |
| `correct` | array of strings | The answers that earn the points, each written as an answer cell. A one-answer question has one letter per accepted answer, two or more when another answer was also accepted (`["B", "D"]`). A select-all question has exactly one string, every letter that must be marked (`["AC"]`). `[]` for `other`, and for `dropped` and `credit_all` entries. |
| `points` | number | What the question is worth on those versions, after any change to its points; greater than 0. |
| `adjustment` | string | `none`; `dropped`: the question does not count on those versions; `credit_all`: every sheet earns the points. |
| `partial_credit` | boolean | `true` only for a select-all question that gives a share of its points for a partly right answer. |

**The key reproduces the points.** For a sheet of version *v*, with key entry *e* for *v* and answer cell *s*:

1. `dropped`: the `q` and `r` cells are `null`.
2. `credit_all`: the sheet earns `points`.
3. Type `other`: the points are as the source gave them (there is no answer cell).
4. *s* is `""`: 0.
5. `select_all`, with *K* = `correct[0]`: if *s* = *K*, `points`. Otherwise, with *right* the letters of *s* that are in
   *K* and *wrong* the others: when `partial_credit`, `points` × max(0, *right* − *wrong*) ÷ (the letters in *K*),
   rounded to the nearest millionth (half up); otherwise 0.
6. One answer (`multiple_choice`, `true_false`): `points` when *s* is one letter that is in `correct`, otherwise 0.

A writer whose scoring differs from this rule MUST NOT write profile 2. Never written: a question's text, its options'
text, feedback, the question's author, the students' names and the scanned pictures.

**For PrismStatistics's key.** Its typed key maps directly: `correct` is the list of alternatives (`D/B`, `AC`),
`dropped` is `-` and `credit_all` is `*`. Partial credit and a key that differs by version have no equivalent there;
such a question is analysed from its points.

### 7.3 `PrismQDA case table`, profile version 1

What PrismQDA writes so that a qualitative project's cases (their attributes, which codes were applied in each case's
documents, and how often) can be analysed in PrismStatistics or matched with survey data.

- `profile` is `PrismQDA case table 1`. `app_version` is `PrismQDA` and the release (`PrismQDA 0.1.0-beta.2`).
- `dataset.name` is the PrismQDA project's name.
- One case per PrismQDA case, in the order of PrismQDA's case id. Every case is written; no case selection applies.
- The variables, in this order:
  1. `case_id`: numeric, `nominal`, label `Case ID`: PrismQDA's id for the case, a whole number. It is stable while
     the case exists; an id can be given again to a new case after a case's creation is undone.
  2. `case_name`: text, `nominal`, label `Case name`: the case's name. Left out when the person chose to leave names
     out of exports.
  3. One variable per case attribute, in the order PrismQDA lists them (by name).
     - **The label** is the attribute's name. **The name** is made from it: every run of characters other than ASCII
       letters, digits and `_` becomes one `_`; leading and trailing `_` are removed; an empty result becomes `a`, and
       one that does not start with a letter gets `a_` in front; it is cut to 64 characters. A name already used (ignoring
       case), or one of the form `code_<n>_present` or `code_<n>_count`, gets `_2`, `_3` and so on, cut so the whole
       stays within 64. Every name that differs from the attribute's name is listed in `source.report.renamed`.
     - **The measure**: PrismQDA's nominal and ordinal stay; interval and ratio are `scale`; date and text are
       `nominal`.
     - **The column** is numeric when every value is a number (a date or text attribute never is), otherwise text.
       Dates are written `YYYY-MM-DD`. Value labels are PrismQDA's, on a numeric column only. PrismQDA's missing
       codes for the attribute are its `missing_values`, and the cells keep the code. A case with no value is `null`.
  4. For each active code, in the order of PrismQDA's code id, two variables:
     - `code_<id>_present`: numeric, `nominal`, value labels `0` `No` and `1` `Yes`, label the code's path in the
       codebook with ` > ` between the levels (`Barriers > Cost`): 1 when at least one excerpt in the case's documents
       is coded with it, otherwise 0.
     - `code_<id>_count`: numeric, `scale`, label the path followed by ` (excerpts)`: the number of distinct excerpts
       so coded.
     - `<id>` is PrismQDA's code id, which a code keeps when it is renamed or moved, so the names never depend on a
       code's text.
     - Both are `null` for a case that holds no document. Whether a code's sub-codes count with it is the same for
       every code and is said in the part.
- `source.file_name` is the project's name followed by ` case table`. `source.report` has `rows` and `variables` as
  written, `renamed` as above, `short_rows: 0`, and `notes` saying what was left out (retired and merged codes, and
  the names when they were left out).
- Never written: excerpt text, document text, memos, coders' names.
- `operations` and `results` are empty.
- **The part `case-table.json`** is required:

```json
{
  "part": "PrismQDA case table",
  "version": 1,
  "project": { "name": "Caregiver interviews", "id": "9f2c4e7a0b1d4c3e8a6f5b2d1c0e9a8b" },
  "exported": "2026-11-15T21:04:00Z",
  "codebook_version": 3,
  "sub_codes_counted": true,
  "case_id_variable": 1,
  "case_name_variable": 2,
  "attributes": [{ "variable": 3, "attribute_id": 4, "name": "Age group", "level": "ordinal" }],
  "codes": [{ "code_id": 12, "path": ["Barriers", "Cost"], "kind": "code", "present_variable": 4, "count_variable": 5 }]
}
```

| Member | Type | Meaning |
|---|---|---|
| `project` | object | `name` (string) and `id` (string): the PrismQDA project's name and its 32-character id. |
| `exported` | string | When the table was made, in UTC (`YYYY-MM-DDThh:mm:ssZ`). |
| `codebook_version` | integer or null | The latest codebook version the person saved in PrismQDA; `null` when none was saved. |
| `sub_codes_counted` | boolean | `true` when an excerpt coded with a sub-code also counts for every code above it. |
| `case_id_variable` | integer | The `id` of `case_id`. |
| `case_name_variable` | integer or null | The `id` of `case_name`; `null` when names were left out. |
| `attributes` | array | One per attribute variable, in order: `variable` (its `id`), `attribute_id` (PrismQDA's), `name` (the attribute's name) and `level` (PrismQDA's: `nominal`, `ordinal`, `interval`, `ratio`, `date` or `text`). |
| `codes` | array | One per code written, in order: `code_id`, `path` (the names from the top level down), `kind` (`code` or `theme`), `present_variable` and `count_variable` (the `id`s). |

## 8. The rules

A **reader** rule says what a program opening a file must do; a **writer** rule what a program making one must do.
PrismStatistics follows every reader rule that says MUST today (0.1.1); Z4, a SHOULD added in revision 1.1, it does
not yet. `packages/pstat`'s `checkProject` reports a broken writer rule by its number.

| Rule | Who | Rule |
|---|---|---|
| Z1 | reader | Refuse a file that is not a ZIP archive or has no `project.json` entry, as not a project. |
| Z2 | writer | Store or deflate `project.json` and any part; never encrypt them. Write no other entry than `project.json` and the part of the profile the file follows. |
| Z3 | reader | Ignore other entries. MAY refuse a `project.json` over 1 GiB unpacked. |
| Z4 | reader | When saving a file whose `profile` it keeps, SHOULD carry the profile's part over byte for byte; ignore a part's reference to a variable that is gone. |
| J1 | both | `project.json` is UTF-8 JSON with no byte-order mark, one object, finite numbers only. |
| J2 | both | Integer members are written as JSON integers. |
| P1 | reader | Refuse a file whose `format` is not exactly `PrismStatistics project`, as not a project. |
| P2 | reader | Refuse a file whose `version` is higher than the reader knows, naming `app_version`. |
| P3 | writer | Write `format`, `version: 1`, `app_version` (with the program's name unless it is PrismStatistics), `dataset`, `operations` and `results`. |
| P4 | reader | Ignore members it does not know. |
| D1 | both | `variables` and `columns` have the same length; every column has the same number of cells. |
| D2 | both | Each column is `numeric` (finite numbers or `null`) or `text` (strings or `null`). |
| D3 | both | Names follow the name rule and are distinct ignoring ASCII case. |
| D4 | both | Variable IDs are distinct integers from 0 to 4294967295, and `next_id` is present and is an integer. |
| D5 | writer | Variable IDs start at 1, and `next_id` is greater than every variable ID. |
| D6 | both | `measure` is `nominal`, `ordinal` or `scale`; `label` is a string. |
| D7 | both | Value labels, missing values and missing ranges hold finite numbers. |
| D8 | reader | Refuse a dataset that breaks D1 to D4 or D7, as damaged, before anything uses it. |
| S1 | both | `source`, when present and not `null`, has `file_name` and a `report` with `rows`, `variables`, `renamed` and `short_rows`. |
| O1 | writer | A writer other than PrismStatistics writes empty `operations` and `results` and no `report` or `data_settings`. |
| F1 | writer | A file that names a profile follows it, and holds its part. |
| F2 | writer | A part follows the JSON rules of J1 and J2, starts with `part` and `version`, and every variable `id` it names is a variable of the dataset. |

### Checking a reader

`conformance/check_reader.mjs` makes 33 files: 13 sound ones (stored and deflated entries, an extra entry, unknown
members, ID 0, a name with letters outside ASCII, a text column, each profile with its part, a part that is not JSON
and others) that a reader must open, and 20 that each break one rule above and must be refused. `readPstat` and
PrismStatistics opened and refused all 33 as this document says (2026-11-15, `prism.exe` built from PrismStatistics
commit 10cee4b; the first 30 also with the 0.1.1 tree):

```bash
node specs/pstat/conformance/check_reader.mjs --prism <path to prism.exe or prismstatistics-app.exe>
```

PrismStatistics's message for a newer file names the program that wrote it ("This project was saved by OpenAssess
0.2.0 in a newer project format ..."), and "PrismStatistics" only when PrismStatistics wrote it, since commit 10cee4b.

## 9. A minimal file

`examples/minimal.pstat` holds this `project.json` (three cases, two variables):

```json
{
  "format": "PrismStatistics project",
  "version": 1,
  "app_version": "Example writer 1.0",
  "dataset": {
    "name": "Example",
    "variables": [
      {"id": 1, "name": "group", "label": "Group", "measure": "nominal",
       "value_labels": [{"value": 1, "label": "Control"}, {"value": 2, "label": "Treatment"}],
       "missing_values": [9]},
      {"id": 2, "name": "score", "label": "", "measure": "scale", "value_labels": [], "missing_values": []}
    ],
    "columns": [
      {"type": "numeric", "values": [1, 2, 9]},
      {"type": "numeric", "values": [12.5, null, 14]}
    ],
    "next_id": 3
  },
  "source": null,
  "operations": [],
  "results": []
}
```

## 10. Changes

- **1.1 (2026-11-15).** Nothing a reader of 1.0 does changes.
  - Section 2: a profile may add one more entry, a **part**, which refers to variables by `id`; rule Z2 allows it,
    and Z4 asks a reader that keeps `profile` to keep the part too.
  - Section 7.1: the `q` names carry the question's number on version A, so they skip a question that is left out,
    and the digits are fixed by the number of questions on version A. This is what OpenAssess writes; 1.0's wording
    could be read either way.
  - New profiles `OpenAssess item results 2` (7.2: answers, key and question details, tied to the bank's ids) and
    `PrismQDA case table 1` (7.3). New rule F2.
- **1.0 (2026-11-15).** Written down from PrismStatistics 0.1.1 (`crates/prism-engine/src/project.rs`, `model.rs` and
  `import.rs`), with no change to what it reads or writes. The extension is no longer provisional. Added the optional
  `profile` member (ignored by PrismStatistics 0.1.1, as rule P4 says) and the `OpenAssess item results 1` profile.
