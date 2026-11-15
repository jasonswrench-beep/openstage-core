# The .pstat project file, format 1

**Spec revision 1.0, 2026-11-15. Status: locked.**

A `.pstat` file is a PrismStatistics project: one dataset with its variables, labels and missing codes, where the data
came from, and PrismStatistics's record of the analyses run on it and their results. PrismStatistics has written this
format since 0.1.0 and called the extension provisional; from this revision the name, the extension and format 1 are
fixed. Other tools (first OpenAssess, for its item results) may write a `.pstat` file that PrismStatistics opens.

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
- A writer of format 1 SHOULD write `project.json` as the only entry, compressed with deflate. A reader of format 1 MUST
  ignore any other entry (a later revision may add parts in their own entries).
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
says so in `profile`. A profile only narrows format 1; a file that follows a profile is an ordinary format 1 file.

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
  3. One variable per question that counts on at least one exported sheet, in the order the test was assembled:
     `q01`, `q02` and on, numbered with at least two digits and with as many as the largest number needs (`q001` when
     there are 100 or more). Numeric, `scale`, no value labels. The label is `Question` and the question's number on
     version A (`Question 7`). The question's text is not written: a results file is often shared, a test's questions
     are kept secure, and PrismStatistics puts labels into its written results, where a list of question texts would
     not read well. The cell is the points earned on that sheet, which may be
     a fraction when the question gives partial credit; `null` when the question does not count on that sheet (an
     adjustment for one version). A question that does not count on any exported sheet is left out, and `notes` says so.
  4. `total`: numeric, `scale`, label `Total score`: the points earned on the questions that count on the sheet.
- No variable has missing codes: every gap is `null`.
- `source.file_name` is the test's name followed by ` results`. `source.report` has `rows` and `variables` as written,
  `renamed: []`, `short_rows: 0`, and `notes` saying how many sheets were left out and why, and any question left out.
- `operations` and `results` are empty (section 6).

## 8. The rules

A **reader** rule says what a program opening a file must do; a **writer** rule what a program making one must do.
PrismStatistics follows every reader rule today (0.1.1). `packages/pstat`'s `checkProject` reports a broken writer rule
by its number.

| Rule | Who | Rule |
|---|---|---|
| Z1 | reader | Refuse a file that is not a ZIP archive or has no `project.json` entry, as not a project. |
| Z2 | writer | Store or deflate `project.json`; never encrypt it. Write it as the only entry. |
| Z3 | reader | Ignore other entries. MAY refuse a `project.json` over 1 GiB unpacked. |
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
| F1 | writer | A file that names a profile follows it. |

### Checking a reader

`conformance/check_reader.mjs` makes 30 files: 10 sound ones (stored and deflated entries, an extra entry, unknown
members, ID 0, a name with letters outside ASCII, a text column and others) that a reader must open, and 20 that each
break one rule above and must be refused. On 2026-11-15 PrismStatistics (`prism.exe` built from the 0.1.1 tree) and
`readPstat` both opened and refused all 30 as this document says:

```bash
node specs/pstat/conformance/check_reader.mjs --prism <path to prism.exe or prismstatistics-app.exe>
```

One wording point for PrismStatistics, not a rule: its message for a newer file puts "PrismStatistics" before
`app_version`, which reads wrongly once another program wrote the file ("saved by PrismStatistics OpenAssess ...").

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

- **1.0 (2026-11-15).** Written down from PrismStatistics 0.1.1 (`crates/prism-engine/src/project.rs`, `model.rs` and
  `import.rs`), with no change to what it reads or writes. The extension is no longer provisional. Added the optional
  `profile` member (ignored by PrismStatistics 0.1.1, as rule P4 says) and the `OpenAssess item results 1` profile.
