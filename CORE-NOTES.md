# Core notes

**Updated 2026-11-15.** Repository `jasonswrench-beep/openstage-core` (private). Working folder on the author's PC:
`C:\Dev\openstage-core`.

This repository holds what more than one OpenStage tool depends on: file formats, small packages and the test sets that
keep two tools' figures the same. Per-tool sessions build on what is published here. A change to a format or a test set
is made here first, with a new revision, and only then in the tools. These notes are kept current with every change.

## Where things stand

| Piece | Version | State |
|---|---|---|
| [.pstat format](specs/pstat/PSTAT-1.md) | format 1, spec revision 1.0 | **Locked.** PrismStatistics opens and refuses all 30 conformance files as the spec says. |
| [Item-analysis test set](testsets/item-analysis/README.md) (C3) | set 1.0.0 | **Ready.** OpenAssess matches 349 of 349 figures, PrismStatistics 176 of 176. |
| [`@openstage/pstat`](packages/pstat) | 1.0.0 | **Ready.** Read, write and check `.pstat` files. |
| Packages for the capture format (C1), the accessibility rules (C2) and the bank reader (C4) | | In progress (priority 3). Not here yet. |
| Author's validator: warn, never block, with opt-in blockers | | In progress (priority 4), in the Author repository. |

## The .pstat format, in short

The full text is [specs/pstat/PSTAT-1.md](specs/pstat/PSTAT-1.md); its section 8 numbers every rule.

- A `.pstat` file is a ZIP archive holding `project.json` (stored or deflated, not encrypted). A reader ignores any
  other entry.
- `project.json` is UTF-8 JSON with no byte-order mark. Integers are written as integers: `3`, never `3.0`.
- Top level: `format` = `PrismStatistics project`, `version` = `1`, `app_version`, `dataset`, `operations`, `results`,
  and optionally `source`, `profile`, and PrismStatistics's own `report` and `data_settings`.
- `app_version`: PrismStatistics writes its bare version (`0.1.1`). Any other writer writes its name first
  (`OpenAssess 0.1.0-alpha.28`).
- `dataset`: `name`, `variables`, `columns` and `next_id` (required, greater than every variable ID).
  - A variable has `id`, `name`, `label`, `measure` (`nominal`, `ordinal` or `scale`), `value_labels` and
    `missing_values`, and may have `missing_ranges`.
  - A column is `{"type": "numeric" | "text", "values": [...]}`. `null` is an empty cell.
- Names start with a letter, then letters, digits or `_`, up to 64 characters, and must be distinct ignoring case.
- `operations`, `results`, `report` and `data_settings` belong to PrismStatistics. Any other writer writes empty
  `operations` and `results` and leaves the other two out.
- A reader refuses a newer `version`, naming `app_version`. It ignores members it does not know, and may drop them when
  it saves.
- **Profile `OpenAssess item results 1`** (section 7.1) is what OpenAssess sends to PrismStatistics:
  - One case per complete sheet, in sheet-number order.
  - The variables: `sheet`; `version` (value labels A, B ...); `q01` and on, labelled `Question 1` and on, with points
    earned (`null` where the question does not count on that sheet); and `total`.
  - The question text is not written.
  - `source.file_name` is the test's name followed by ` results`, and `notes` says what was left out.

## Packages

### `@openstage/pstat` 1.0.0

Folder `packages/pstat`. ES module, no dependencies, Node 22.2 or later (it uses `node:zlib`). Types in
`src/index.d.ts`.

| Export | What it does |
|---|---|
| `readPstat(bytes)` | Opens a file as PrismStatistics does and returns `project.json` parsed. It throws `PstatError` (with `.rule`) for anything PrismStatistics would refuse. |
| `writePstat(project)` | Checks a project against the writer rules, then returns the file's bytes: one deflated entry with a fixed date, so the same project always makes the same bytes. |
| `checkPstat(bytes)` | Every problem a writer must not make, as `{rule, path, message}`. Empty when the file is sound. **For a writer's tests.** |
| `checkProject(project, {as})` | The same checks on a parsed `project.json`. `as: "reader"` applies only the rules a reader enforces. |
| `validName(name)` | The name rule. |
| `parseJson(text)` | JSON parsing that also reports numbers written as `3.0` (rule J2). |
| `FORMAT`, `VERSION`, `SPEC_REVISION`, `EXTENSION`, `PROFILE_ITEM_RESULTS` | The constants. |

When a file names the item-results profile, `checkPstat` also checks the profile's layout: the variable names and
labels, that each total equals its questions, the sheet order and the version letters.

**Installing it.** The repository is private, so it cannot yet be installed from a public URL. For now:

```bash
npm install --save-dev C:/Dev/openstage-core/packages/pstat
```

This is a file dependency, for tests on this PC. A tool with a no-runtime-dependency rule, such as OpenAssess, keeps
its own writer and uses this package only in its tests. Once the repository is public, each release will carry
`npm pack` tarballs, installable as
`npm install https://github.com/jasonswrench-beep/openstage-core/releases/download/<tag>/openstage-pstat-<version>.tgz`.

## The item-analysis test set (C3)

Folder `testsets/item-analysis`; [its README](testsets/item-analysis/README.md) defines every figure.

- **Seven cases.** Each is a class's scored sheets (`scores.csv` and `case.json`), the `.pstat` file OpenAssess would
  send for them, and R's figures in `reference.json` (base R, from the case files alone).
- **The figures differ on purpose**, so each tool must label its own:
  - OpenAssess's point-biserial includes the question in the total: label it **Point-biserial (total includes the
    question)**.
  - PrismStatistics's corrected item-total r leaves it out: label it **Corrected item-total r (total leaves the item
    out)**.
  - OpenAssess's SD divides by *n*; PrismStatistics's by *n* − 1.
  - A question that does not count on every sheet: OpenAssess leaves the question out of KR-20, while PrismStatistics
    leaves the sheets out (listwise).
- **Tolerances.** OpenAssess within 0.00005 (it keeps four places). PrismStatistics within 1e−9, or 1e−8 for Feldt's
  limits. An undefined figure must be shown as no figure.
- **Running it:**

  ```bash
  node testsets/item-analysis/check/check_set.mjs
  node testsets/item-analysis/check/check_openassess.mjs --assess <OpenAssess clone>
  node testsets/item-analysis/check/check_prismstatistics.mjs --prism <prism.exe or prismstatistics-app.exe>
  ```

- **How the PrismStatistics checker works.** It needs no change to the program: it writes a script (`open_project`,
  `reliability`, `descriptives`), runs it with the batch runner, and reads the figures from the saved project.
- **Today's results.**
  - OpenAssess at a4c7097: 349 of 349.
  - PrismStatistics `prism.exe` from the 0.1.1 tree: 176 of 176.
  - Against a copy of `reference.json` with six figures changed, each checker reported every change that concerned it
    and failed.

## For the OpenAssess session

1. **Export the item results as a `.pstat` file**, following profile 7.1 exactly. `app_version` is
   `OpenAssess <RELEASE>`, using the same release constant as Check for updates. Write the file with OpenAssess's own
   code (its no-runtime-dependency rule).
2. **Test the export against the set.** For each case, score its sheets, export them, and compare the `project.json` you
   write with the case's `.pstat` file. Both decode with `readPstat`; compare everything except `app_version`, which in
   the set is `OpenAssess item-analysis test set 1.0.0`. `checkPstat` on your file must return no problems. Use
   `@openstage/pstat` as a dev dependency, or a copy of `testsets/item-analysis` at set 1.0.0 with `check_set.mjs`
   passing.
3. **Label the point-biserial** as above, and say where the SD is shown that it describes this class.
4. **Run `check_openassess.mjs` in the release checks.** It loads `packages/assess/src/sheets/stats.ts` directly.
5. Alpha 27 is committed locally (a4c7097) and held on the author's word. The export can join it or come in the next
   release.

## For the PrismStatistics session

1. **In `crates/prism-engine/src/project.rs`, the extension is no longer provisional.** Cite PSTAT-1 revision 1.0. No
   change in behaviour is needed: the conformance check passes 30 of 30.
2. **Add both checks to the release checks.** The C3 check (`check_prismstatistics.mjs --prism <the build>`) and the
   reader conformance check (`specs/pstat/conformance/check_reader.mjs --prism <the build>`) run against a build
   without changing it. Or port them into the Rust reference tests, reading `reference.json`.
3. **Label the Item statistics column** **Corrected item-total r (total leaves the item out)**.
4. **Wording.** The message for a file from a newer version puts "PrismStatistics" before `app_version`, which reads
   wrongly when another program wrote the file.
5. **Possible later.**
   - Recognise `profile: "OpenAssess item results 1"` when opening, and offer Reliability on the question variables
     and Descriptives on `total`.
   - Keep the `profile` member when saving. Today it is dropped, which the spec allows.
   - Store unrounded item means and SDs as fields (`item.<i>.mean`, `.sd`) so the test set can check them. Today they
     exist only in the rounded table.

## Rules every session keeps

- No shared item-math code between OpenAssess and PrismStatistics. They share the test set, not a library.
- Accessibility findings warn and never block. A project may turn chosen rules into blockers, off by default.
- No tool is described as an alternative to a named product. Naming a product where it helps is fine.
- A format or test-set change starts here, with a new revision, and both tools run it before it is merged.

## Checks in this repository

```bash
node tools/check_all.mjs
```

This runs each package's tests, the test set's own check and `readPstat` against the conformance files. It needs
nothing outside the repository.

## Changes

- **2026-11-15.** First version: .pstat format 1 (spec 1.0), the item-analysis test set 1.0.0, `@openstage/pstat` 1.0.0.
