# Core notes

**Updated 2026-11-16 (priority 3, second part: the accessibility rules, A11Y-1).** Repository
`jasonswrench-beep/openstage-core`, **public since 2026-11-15**. Working folder on the author's PC:
`C:\Dev\openstage-core`.

This repository holds what more than one tool depends on: file formats, small packages, shared code where two tools
in the same language agreed to share it, and the test sets that keep two tools' figures the same. Per-tool sessions
build on what is published here. A change to a format, a test set or a shared crate is made here first, with a new
revision, and only then in the tools. These notes are kept current with every change.

## Where things stand

| Piece | Version | State |
|---|---|---|
| [.pstat format](specs/pstat/PSTAT-1.md) | format 1, spec revision **1.2** | **Locked.** New in 1.1: profile parts, `OpenAssess item results 2`, `PrismQDA case table 1`, and the `q` numbering settled. New in 1.2: profile 2 may carry students' ids and names. PrismStatistics opens and refuses all 33 conformance files as the spec says. |
| [Item-analysis test set](testsets/item-analysis/README.md) (C3) | set **1.1.0** | **Ready.** OpenAssess matches 512 of 512 figures (commit ca56055), PrismStatistics 1,497 of 1,497 (a build of commit 10cee4b). |
| [`@openstage/pstat`](packages/pstat) | **1.2.0** | **Ready.** Reads, writes and checks `.pstat` files, the profiles and their parts. |
| [`prismqda-stats`](crates/prismqda-stats) (R5) | **1.0.0**, tag `prismqda-stats-v1.0.0` | **Ready.** The statistics crate, moved here from PrismQDA commit 56a161e unchanged apart from its `Cargo.toml`; its 92 tests (71 against R) pass here. |
| [Capture format](specs/capture/README.md) (C1) | schema 0.2.5; crates 0.1.0, tag `capture-v0.1.0` | **Rust code and format documents moved here** (priority 3, first part); 724 tests pass. The TypeScript editing code has two drifted copies and moves here after they are merged, in the Recorder round. |
| [Accessibility rules](specs/a11y/A11Y-1.md) (C2) | A11Y-1 revision **1.0**; engine `openstage-a11y` 0.1.0, tag `a11y-v0.1.0`; `@openstage/a11y` 0.1.0 | **Ready** (priority 3, second part). One catalogue of 36 machine rules and 6 checks for a person, mapped to WCAG 2.1 AA; PDF Remediator's status words; one contrast arithmetic; the report; the project setting for ignored rules and opt-in blockers (empty unless the author chooses). The engine (Rust, and a command-line program) checks web pages, help sites, EPUB, Word, PowerPoint and WebVTT; PDFs not yet. A test set of 20 cases worked out by hand. |
| Package for the bank reader (C4) | | Not started (priority 3, last part). |
| Author's validator: warn, never block, with opt-in blockers | | Not started (priority 4), in the Author repository. |
| Releases | `pstat-v1.2.0`, `item-analysis-v1.1.0`, `prismqda-stats-v1.0.0` | **Published.** The package as an `npm pack` file, the test set as a zip, the crate as a tag. Each tag also fixes the spec and the conformance files as they were. |
| C7 source ledger, C8 local AI runtime and assistant server | | On the [roadmap](ROADMAP.md), the author's word: agreed, not scheduled. |

## The .pstat format, in short

The full text is [specs/pstat/PSTAT-1.md](specs/pstat/PSTAT-1.md); its section 8 numbers every rule.

- A `.pstat` file is a ZIP archive holding `project.json` (stored or deflated, not encrypted). A reader ignores any
  other entry.
- `project.json` is UTF-8 JSON with no byte-order mark. Integers are written as integers: `3`, never `3.0`.
- Top level: `format` = `PrismStatistics project`, `version` = `1`, `app_version`, `dataset`, `operations`, `results`,
  and optionally `source`, `profile`, and PrismStatistics's own `report` and `data_settings`.
- `app_version`: PrismStatistics writes its bare version (`0.1.1`). Any other writer writes its name first.
- `dataset`: `name`, `variables`, `columns` and `next_id` (required, greater than every variable ID). Names start with
  a letter, then letters, digits or `_`, up to 64 characters, distinct ignoring case.
- `operations`, `results`, `report` and `data_settings` belong to PrismStatistics. Any other writer writes empty
  `operations` and `results` and leaves the other two out.
- **New in 1.1: a profile may add a part**, one more entry beside `project.json` (`assessment.json`,
  `case-table.json`). It is JSON under the same rules, starts with `part` and `version`, and names variables only by
  their `id`. A reader that keeps `profile` when it saves should carry the part over byte for byte (rule Z4).

### The profiles

| Profile | Section | What it carries |
|---|---|---|
| `OpenAssess item results 1` | 7.1 | `sheet`, `version`, the points per question (`q01` ...), `total`. |
| `OpenAssess item results 2` | 7.2 | Profile 1, then the letters marked (`r01` ...), the students' ids (`student_id`) and names (`student_name`) when the writer holds them; and `assessment.json`: the test (id, date given, source, versions), and for every question on version A its bank id, revision, type, options and the bank's option ids, the key (per version when it differs) and its details (objective, chapter, section, page, Bloom level, difficulty, tags). |
| `PrismQDA case table 1` | 7.3 | `case_id`, `case_name` (unless names are left out), one variable per case attribute, and `code_<id>_present` and `code_<id>_count` per code; and `case-table.json`: the project, the export time, the codebook version, whether sub-codes count with their parent, and where each column came from. |

**The `q` numbering (settled in 1.1).** A `q` variable's name and label carry the question's number on version A, with
the digits that version A's number of questions needs. A question left out leaves its number unused, so the names may
skip (`q01`, `q02`, `q04`). The 1.0 checker wrongly demanded `q01`, `q02` in a row; the text always said version A's
number, and 1.1's checker follows the text.

**Profile 2's letters** are in version A's lettering (the first option as version A prints it is `A`), capital
letters in alphabetical order (`AC`); `""` is a blank and `null` is where the question does not count. The key
reproduces every point cell by the rule in section 7.2, which is OpenAssess's scoring: one answer earns the points when
exactly one letter is marked and it is accepted; select-all needs exactly the key's letters, or with partial credit
earns points × max(0, right − wrong) ÷ the key's letters, to the millionth; `credit_all` earns the points, `dropped`
leaves the cell empty. Question text, option text, feedback, the questions' authors and scanned pictures are never
written. Students' ids and names may be (revision 1.2, the author's decision: the files stay on the instructor's
computer).

## Packages

### `@openstage/pstat` 1.2.0

Folder `packages/pstat`. ES module, no dependencies, Node 22.2 or later. Types in `src/index.d.ts`.

| Export | What it does |
|---|---|
| `readPstat(bytes)` | Opens a file as PrismStatistics does and returns `project.json` parsed. It throws `PstatError` (with `.rule`) for anything PrismStatistics would refuse. |
| `readPart(bytes)` | The part of the profile the file follows, parsed, or `null`. |
| `writePstat(project, part?)` | Checks a project (and its part) against the writer rules, then returns the file's bytes: `project.json`, then the part, deflated with a fixed date, so the same input always makes the same bytes. |
| `checkPstat(bytes)` | Every problem a writer must not make, as `{rule, path, message}`, including the profile's layout and its part. Empty when the file is sound. **For a writer's tests.** |
| `checkProject(project, {as, part})` | The same checks on a parsed `project.json`. `as: "reader"` applies only the rules a reader enforces. |
| `pointsFor`, `entryFor`, `isAnswer` | Profile 2's scoring rule, the key entry for a version, and the form of an answer cell. |
| `attributeName`, `attributeNames` | The case table's variable names for its attributes. |
| `PROFILE_ITEM_RESULTS`, `PROFILE_ITEM_RESULTS_2`, `PROFILE_CASE_TABLE`, `PARTS`, `FORMAT`, `VERSION`, `SPEC_REVISION`, `EXTENSION` | The constants. |

**Installing it**, from its release (no sign-in needed):

```bash
npm install --save-dev https://github.com/jasonswrench-beep/openstage-core/releases/download/pstat-v1.2.0/openstage-pstat-1.2.0.tgz
```

A tool with a no-runtime-dependency rule, such as OpenAssess, keeps its own writer and uses this package only in its
tests. On this PC a file dependency (`npm install --save-dev C:/Dev/openstage-core/packages/pstat`) also works, but it
follows the working folder rather than a release.

### `prismqda-stats` 1.0.0 (Rust)

Folder `crates/prismqda-stats`; tag `prismqda-stats-v1.0.0`. The statistics PrismQDA and PrismStatistics report
(distributions, descriptives, t tests, ANOVA, regression, logistic regression, correlation, nonparametric and discrete
tests, contingency tables, ranks, p-value adjustment, the random number generator, the formula language, chart
numbers, agreement, bootstrap and the rest), written from published definitions and checked against R. It kept its
name so that neither app changes a line of code: `use prismqda_stats::...` works as before.

```toml
prismqda-stats = { git = "https://github.com/jasonswrench-beep/openstage-core", tag = "prismqda-stats-v1.0.0" }
```

- The repository is public, so cargo fetches it with no credentials, on any machine and on GitHub Actions. The
  `git-fetch-with-cli` setting the private repository needed is no longer necessary (it does no harm).
- **The rule.** A change to the crate is made here first, with its R reference test, and gets a new tag. Each app moves
  its pin to the new tag only with its own reference tests passing. Neither app edits its own copy.
- Its tests: `cargo test` in `crates/prismqda-stats` (also run by `node tools/check_all.mjs`). The R scripts that made
  its reference values are in `tests/reference/`.

### The capture code (Rust), tag `capture-v0.1.0`

Folder `capture`: the Rust workspace of six crates that record the screen and read, write and render a recording's
folder (`openstage-capture-protocol`, `-project`, the engine `openstage-capture`, `-render`, `-windows` and `-cli`),
and its format documents in [specs/capture](specs/capture/README.md). Moved from OpenStage Author commit 3c47a83, where
it is the same code Capture Express pins (Author commit 4c8d23f) and OpenStage Recorder holds. Its tests read the
shared `edit.json` examples in `capture-edit/fixtures`, which moved too.

```toml
openstage-capture-project = { git = "https://github.com/jasonswrench-beep/openstage-core", tag = "capture-v0.1.0" }
```

The same line, with the crate's name, for `-render`, `-windows` and the others. The rule is the statistics crate's: a
change is made here first and gets a new tag, and each app moves its pin only with its own tests passing.

## The accessibility rules (C2), A11Y-1 revision 1.0

[A11Y-1](specs/a11y/A11Y-1.md) is one set of rules for every tool: stable rule ids (`alt-missing`, `contrast-text`,
...), each mapped to the WCAG 2.1 AA success criteria it serves, with its words (title, message, what to do) in
[`specs/a11y/rules.json`](specs/a11y/rules.json); the statuses pass, fail, needs review, not tested and not
applicable, always shown with a word or a word and a symbol; one contrast arithmetic (section 3); one report (section
4); and one project setting (section 5).

**Warn, never block.** A project file keeps `accessibilityChecks: { ignored, ignoredFindings, blockers }`. Every list
is empty unless the author fills it; with it missing or empty nothing blocks. Only a finding that fails blocks, and
only for a rule the author made a blocker; `needs-review` never blocks.

Each tool checks two kinds of thing:

- **Its own project** (objects, pictures, steps): with its own code, using the catalogue's ids and words.
  `@openstage/a11y` (JavaScript, no dependencies) has the catalogue, the status words, contrast, `finding()`, the
  settings and the summary line for an editor.
- **What it made**: the engine `openstage-a11y` (Rust library and command-line program) checks a web page, a folder of
  pages, an EPUB, a Word or PowerPoint file and a WebVTT file. PDFs are reported not tested for now (section 6.6).

```toml
openstage-a11y = { git = "https://github.com/jasonswrench-beep/openstage-core", tag = "a11y-v0.1.0" }
```

```bash
openstage-a11y check guide.html --project project.json     # in words; --json for the report
```

The test set ([`testsets/a11y`](testsets/a11y/README.md)) has 20 cases with the findings worked out by hand;
`node testsets/a11y/check/check_engine.mjs --engine <program>` checks any program that prints an A11Y-1 report. The
engine was also run, read-only, on files the tools have made (a PowerPoint and two Word files in the Author and Guide
folders, OpenExplainer's and the Recorder's web pages): no crash, each in a fraction of a second. What that run
showed was fixed: a focus rule was flagged although the box around the field shows focus with `:focus-within` (now
not reported, and a case in the set), and print and forced-colours rules were listed as limits (now left out). A page
whose content a script builds is judged on the file as it is, and the report now says so in its limits.

## The item-analysis test set (C3), set 1.1.0

Folder `testsets/item-analysis`; [its README](testsets/item-analysis/README.md) defines every figure.

- **Nine cases.** Each is a class's scored sheets (`scores.csv`, `case.json`), the `.pstat` file OpenAssess would send
  for them, and R's figures in `reference.json` (base R, from the case files alone). New in 1.1.0:
  - `omitted-25`: a question dropped on every version, so the file leaves it out and the names skip it.
  - `letters-60`: the letters marked (`answers.csv`) and a key, in profile 2: one-answer questions, an answer also
    accepted, select-all, true/false, a credited and a dropped question, blanks, and two letters marked on a
    one-answer question.
- **New figures for every case:** `item_analysis_listwise` (PrismStatistics's Item Analysis on the points: KR-20 or
  alpha, KR-21, the standard error of measurement, each group's share and D), each 27 percent group's own share in
  `item.<q>`, and for `letters-60` the counts of each answer by score group (PrismStatistics's) and of each letter's
  marks (OpenAssess's). No 1.0.0 figure changed.
- **The figures that differ on purpose**, so each tool must label its own:
  - OpenAssess's point-biserial includes the question in the total: **Point-biserial (total includes the question)**.
  - PrismStatistics's corrected item-total r leaves it out: **Corrected item-total r (total leaves the item out)**.
  - OpenAssess's SD divides by *n*; PrismStatistics's by *n* − 1.
  - A question that does not count on every sheet: OpenAssess leaves the question out of KR-20, PrismStatistics the
    sheets (listwise), in Reliability and in Item Analysis alike.
  - Option counts: OpenAssess counts each option's marks, PrismStatistics each whole answer by score group.
  - A credited question left blank: OpenAssess calls the sheet credited, PrismStatistics blank. No case holds one yet.
- **Tolerances.** OpenAssess within 0.00005. PrismStatistics within 1e−9, or 1e−8 for Feldt's limits. A count must be
  equal, and an undefined figure must be shown as no figure.
- **Running it:**

  ```bash
  node testsets/item-analysis/check/check_set.mjs
  node testsets/item-analysis/check/check_openassess.mjs --assess <OpenAssess clone>
  node testsets/item-analysis/check/check_prismstatistics.mjs --prism <prism.exe or prismstatistics-app.exe>
  ```

- **A copy of the set** (copied whole, marked `-text`) passes `check_set.mjs` on its own now: in a copy it checks every
  file against `SHA256SUMS`, which covers the whole folder, and says that the rebuild and the PSTAT-1 checks run here.
- **Today's results.** OpenAssess at ca56055: 512 of 512. PrismStatistics `prism.exe` built from commit 10cee4b:
  1,497 of 1,497 (Reliability with item means and SDs, Descriptives, Item Analysis on the points for every case and on
  the letters for `letters-60`). Against a reference with eight figures changed, each checker reported every change
  that concerned it and failed.

## For the OpenAssess session

Read against your handoff of 2026-11-15 and `CORE-REQUESTS.md` (as changed after it).

1. **Go back to version A's numbers for the `q` names** (your first behaviour: `q01`, `q03`, labels `Question 1`,
   `Question 3`). The spec's text was right and my 1.0 checker was wrong; revision 1.1's checker accepts names that
   skip and refuses a name whose number differs from its label's. Renumbering in a row with a note is now refused.
   `omitted-25` is the case: your export of it must equal its `.pstat` file (everything but `app_version`). Your
   original test at `pstat-export.test.ts` (q01, q03) is the right one.
2. **Profile 2 (your request 1) is in PSTAT-1 section 7.2**, with an example (`specs/pstat/examples/item-results-2.pstat`)
   and a case (`letters-60`). Writing it, from what your code already holds:
   - the `q` variables and `total` exactly as profile 1;
   - the letters: `SettledSheet` places, through `answerAt(record, version, qid, letter)` and then
     `letterFor(record, "A", qid, ...)`, so every sheet's letters are version A's; `""` for blank, `null` where the
     `q` cell is `null`;
   - `assessment.json` from the record's frozen copies (`record.questions[]`: id, version, type, the options' ids in
     version A's order, metadata), the adjustments (`drop` is `dropped`, `credit` is `credit_all`, `alsoRight` adds a
     letter to `correct` for a one-answer question and a letter to the key's string for select-all, `points` changes
     `points`; an adjustment for some versions makes a key entry per set of versions), and the test (`id`, `name`, the
     date the person gives, `scanned sheets` or `learning system report`, `versions`, `sheets_left_out`);
   - a learning system's report: no `r` variables, types `other` where the report has no letters;
   - **Students' ids and names: the author says yes** (revision 1.2). After the `r` variables, `student_id` and then
     `student_name`, each text and each optional: write them when OpenAssess holds them (today it holds neither: the
     scores file refuses names, and a learning system's report has its personal columns counted and dropped), and you
     may let the person leave them out. Whether OpenAssess starts keeping them, from a learning system's report or a
     roster the instructor imports, is yours to build; nothing in the core stands in the way.
   - Test with `checkPstat` (a profile 2 file without its part, or with a point the key does not give, is refused) and
     compare your file for `letters-60` with the set's.
3. **Set 1.1.0** passes at ca56055 (512 of 512) with no change. Two things you may add:
   - report each 27 percent group's own share (`upper_27`, `lower_27` in the set); the checker checks them as soon
     as `discrimination` has `upper` and `lower`;
   - decide what a credited question left blank counts as (you say credited, PrismStatistics blank). Tell the core,
     and a case will hold one.
4. **Your requests 3 and 4 (C7 source ledger, C8 local AI runtime) are on the [roadmap](ROADMAP.md)**, the author's
   word: agreed, not scheduled, nothing to build yet. Your rules for C8 (a model never sets a key, a suggestion is
   accepted by a person, nothing leaves the machine unless the person turned it on) are written there and will be in
   its spec.
   **Item 9: the author says build the short-answer boxes now**, before C8: the new sheet layout with a box per short
   answer, the box cut out upright, and a person scoring it against the rubric. The model's reading of handwriting
   waits on C8.
5. Alpha 27 stays held on the author's word.

## For the PrismStatistics session

Read against your handoff of 2026-11-15 (`CORE-HANDOFF.md`, `CORE-REQUESTS.md`).

1. **Confirmed on a build of your commit 10cee4b** (built here from `git archive`, in a separate folder; your
   working folder was not touched): the reader conformance check passes 33 of 33 (the 30 old files and three new ones
   with parts), set 1.1.0 passes 1,497 of 1,497, and the newer-file message reads "saved by OpenAssess 0.2.0".
2. **R3 is done.** Your copy of the set can now run `node check/check_set.mjs` in the copied folder; it checks
   `SHA256SUMS`, which covers every file of the folder.
3. **R1 is done: profile 2** (PSTAT-1 section 7.2, `letters-60`). To read it:
   - recognise `OpenAssess item results 2` as you recognise profile 1, and offer Item Analysis on the `r` variables
     with the file's key: `correct` is your alternatives, `dropped` is `-`, `credit_all` is `*`;
   - a key that differs by version, or `partial_credit`, has no equivalent in your typed key: analyse that question
     from its points, as the spec says;
   - item details are in `assessment.json`, by variable `id` (`points_variable`, `answer_variable`). The spec does
     not put them in labels; group by them as you like;
   - keep `assessment.json` byte for byte when you keep `profile` (rule Z4, a SHOULD). Today you drop every entry but
     `project.json`;
   - a profile 2 file may carry `student_id` and `student_name` (revision 1.2), text, after the `r` variables:
     `student_id` is what your item 7 (each student's before and after) can match on.
4. **R2 is done: set 1.1.0.** Copy the whole folder again (still `-text`) and extend `c3_reference.rs` to
   `item_analysis_listwise` (on the points, `scored: true`, with each question's points in the key) and to
   `answers.<q>` for `letters-60` (letter mode with the file's key). The definitions are yours (`item_analysis.rs`),
   written out in the set's README. `check_prismstatistics.mjs` shows the script lines that match.
5. **R5 is done: `prismqda-stats` 1.0.0** is in `crates/prismqda-stats`, tag `prismqda-stats-v1.0.0`, identical to
   PrismQDA's copy at 56a161e apart from `Cargo.toml`. Swap your dependency to the line under Packages above (and
   `git-fetch-with-cli`), run `python tools/validate.py`, and retire `tools/check_shared_stats.py` or point it here.
6. **R6 is done: profile `PrismQDA case table 1`** (PSTAT-1 section 7.3, `specs/pstat/examples/case-table.pstat`). One
   correction to the request: PrismQDA's per-case values come from its `stats.table` command (`stats.variables` lists
   the variables and their summaries). Recognise the profile on opening as you planned; `case_id` is the key to match
   on, and `case-table.json` says where each column came from.
7. **R4 is done: the core is public and tagged.** A release check can fetch the conformance and test-set files by tag,
   with no clone at a known path: the source archive `https://github.com/jasonswrench-beep/openstage-core/archive/refs/tags/pstat-v1.2.0.tar.gz`
   (unpack, then `node specs/pstat/conformance/check_reader.mjs --prism <build>`), or the set alone,
   `https://github.com/jasonswrench-beep/openstage-core/releases/download/item-analysis-v1.1.0/item-analysis-1.1.0.zip`.
   **Your public copy (`prism_statistics`) can now use the core's tag** `prismqda-stats-v1.0.0`, the same line as the
   private one; anyone can build it.
8. In your copy's `check_prismstatistics.mjs`, the note that item means, SDs and difficulty are not computed is out
   of date; the set 1.1.0 checker checks them.

## For the PrismQDA session

1. **The statistics crate moved here** (`crates/prismqda-stats`, tag `prismqda-stats-v1.0.0`), at your commit 56a161e.
   From now on a change to it is made here first. **This repository is public now, so switch to the tag**:
   `prismqda-stats = { git = "https://github.com/jasonswrench-beep/openstage-core", tag = "prismqda-stats-v1.0.0" }`
   in place of the `path` to your own copy, run your reference tests, and then remove `crates/prismqda-stats` from
   PrismQDA. The crate kept its name, so no code changes.
2. **Your case table has a `.pstat` profile** (PSTAT-1 section 7.3) for when you build an export to PrismStatistics:
   `case_id`, `case_name`, the attributes (names made by `attributeName`), `code_<id>_present` and `code_<id>_count`
   with the path as label (` > ` between levels), and `case-table.json`. Write it from `stats.table` plus `data.get`
   (for the value labels and missing codes) and `project.info`. Check it with `checkPstat` from `@openstage/pstat`.
3. **Ids can be given again, which the case table relies on not happening.** As read at PrismQDA commit 69b7ef1:
   `code.id` is an `INTEGER PRIMARY KEY` without `AUTOINCREMENT` (`schema/v1.sql`, the `code` table), and undoing a
   code's creation deletes the row (`crates/prismqda-engine/src/undo.rs`, `DELETE FROM code`), so SQLite may give that
   id to the next new code. Cases are the same (`research_case.id`; undoing a case's creation, also in `undo.rs`). The
   case table names its columns `code_<id>_present` and `code_<id>_count` and is matched on `case_id`, so a reused id
   makes a column in a later export mean a different code, or a row a different case, with nothing to show it.
   - PSTAT-1 section 7.3 only warns of this today.
   - The fix is PrismQDA's to choose: `AUTOINCREMENT` (a schema change with a migration), or an undo that never frees
     an id (keeping the row as retired, or a stored high-water mark that new ids start above).
   - Once ids are never given again, tell the core, and the warning comes out of 7.3 in a new revision.
4. **One wrong sentence in the developer docs.** `docs/API.md` says `stats.variables` gives one row per case. It
   returns the variables and their summaries (`StatVariables`, `crates/prismqda-engine/src/statistics.rs`,
   `stat_variables`). The per-case values come from `stats.table` (`stat_table`), which `docs/API.md` also describes.
   Correct the sentence.
5. **The case table has no test set yet.** The core has the spec (7.3), one example file
   (`specs/pstat/examples/case-table.pstat`) and the layout checks in `checkPstat` (`packages/pstat/src/profiles.js`).
   When you build the export, ask the core for a small set of case files to hold it and PrismStatistics's reader to.
   Planned cases: sub-codes counted with their parent and not, a case with no documents, attributes whose names must
   be changed, missing codes, names left out, and a code that was retired or merged.

## For the OpenStage Recorder session (the next round)

1. **The capture code has a home here now** (`capture`, tag `capture-v0.1.0`), the same as your `capture` folder at
   93e2bb8. In your round: depend on the tag instead of your own copy, run your capture checks, and then remove your
   copy. Until then, a change to it is made here first.
2. **The editing code has drifted from Author's.** [specs/capture/README.md](specs/capture/README.md) lists the 13
   files that differ and the webcam placement built on both sides (Author's `capture-edit/src/webcamPlace.ts`, yours
   `capture-timeline/src/webcam-place.ts`). In your round the two copies are merged here, file by file, with the
   Author session, and become one package both use.
3. **The `repository` line in your `capture/Cargo.toml` names an old test repository** whose name includes an
   assistant's name, in a public repository. The core's copy names `openstage-core`; yours goes when you switch.
4. **The accessibility rules (C2) are ready** for your round: [A11Y-1](specs/a11y/A11Y-1.md) and the engine at tag
   `a11y-v0.1.0`. What fits the Recorder: run `openstage-a11y` on the WebVTT file beside each MP4 (`captions-format`,
   `captions-reading`: more than 42 characters a line, more than 2 lines, more than 20 characters a second, overlaps)
   and show the summary line in the export; report a video with no captions as `captions-missing` and one with no
   description track as `audio-description` (needs review), with the catalogue's words. Keep `accessibilityChecks` in
   the recording project if you offer blockers (empty by default).

## For the OpenExplainer session (the next round)

1. **The accessibility rules (C2) are what your `CORE-REQUESTS.md` item 2 asked for**: A11Y-1, the engine at tag
   `a11y-v0.1.0`, and `@openstage/a11y` 0.1.0. Answers, point by point:
   - A package with no runtime dependencies that takes an output and returns findings: the engine is a Rust crate
     (dependencies `serde`, `serde_json`, `flate2`, which your `src-tauri` already has) and a program; it checks your
     help site (a folder), EPUB 3 and Word file. The tagged PDF is not read yet (section 6.6). `@openstage/a11y` is
     the no-dependency JavaScript part for the editor.
   - A finding with a stable rule id, the WCAG 2.1 AA criterion, a status in PDF Remediator's words, where it is, a
     plain sentence and what to do: section 4.2, with a key for ignoring one place.
   - Warn, never block, and opt-in blockers for the author's own project: section 5 fixes the member,
     `accessibilityChecks: { ignored, ignoredFindings, blockers }`, empty by default. Your project's ignored kinds
     move into `ignored` with the A11Y-1 ids (section 8 maps them), in a format version with a migration.
   - The rules you named are all in the catalogue (alt text present and not weak, heading order, focus order and
     keyboard, captions, contrast, link text, timed content, page language, title, names on controls, the skip link,
     landmarks, ids used once); reading order and what descriptions say are checks for a person (the checklist).
   - A conformance set: `testsets/a11y`, 20 cases; send the core a small help site and EPUB of your own if you want
     cases made from them.
2. Section 8 lists how your book check's accessibility kinds map to the A11Y-1 ids. Your other kinds (empty topics,
   missing files, variables) stay yours.
3. Two things the engine leaves to you: the skip link's working (that the first Tab reaches it and it moves the
   keyboard) and the Tab stops' visible focus are browser checks; keep your `tools/a11y` machine checks for those
   until the engine has a browser part, and report them with the catalogue's ids (`bypass-blocks`, `focus-visible`).

## For the OpenStage Author session

1. **The capture code and its three format documents** (`docs/capture/capture-project-format.md`,
   `capture-edit-format.md`, `capture-protocol-spec.md`) **were copied here from your commit 3c47a83**, and from now on
   the core's copies are the ones to change. Move to the tag when you next work on recording, and then remove your
   copies; until then, make no change to `capture/` or those documents without making it here first.
2. The same old `repository` line is in your `capture/Cargo.toml`.
3. The editing code (`capture-edit`, `capture-timeline`) is merged with the Recorder's in its round; see the Recorder
   section.
4. Priority 4 (your validator: warn, never block, with opt-in blockers) is the core's next piece of work in your
   repository. It now has its rules: A11Y-1 section 5 is the setting (`accessibilityChecks`, empty by default) and
   section 8 maps your validator's accessibility ids to the shared ones (`alt-text-missing` to `alt-missing`,
   `click-without-key` to `keyboard-operate`, `tab-order-duplicate` to `focus-order`, and so on). One difference to
   settle in that round: your large-text cut-off is 18.66px bold, A11Y-1's is 14 points (18.67px).

## For the Capture Express session

1. You pin three capture crates to OpenStage Author's repository (commit 4c8d23f). The same code is in the core at tag
   `capture-v0.1.0`: change the three `git` lines to the core with that tag (same crate names, no code changes), run
   your checks, and from then on take capture fixes from the core.
2. **The accessibility rules (C2) answer your `CORE-REQUESTS.md` item 2**: a Rust crate, `openstage-a11y` at tag
   `a11y-v0.1.0` (dependencies `serde`, `serde_json`, `flate2`, all already in your lock file; no Node, no network).
   It reads your single-page web page (pictures as `data:` addresses are fine), the `.docx` and the `.pptx`, and
   returns the findings you listed (rule, WCAG 2.1 AA criterion, PDF Remediator's status words, where, a sentence and
   what to do). `Report::summary_line("Web page")` gives "Web page: 0 failures, 2 to review, 3 checks for a person".
   The tagged PDF is reported not tested for now (A11Y-1 section 6.6); keep your PDF audit until it is read.
   Blockers: `Settings` reads `accessibilityChecks` from a project's JSON; empty by default.
3. Send the core the demo guide's web page, PDF and Word file when you want them made into cases of the test set.

## Rules every session keeps

- No shared item-math code between OpenAssess and PrismStatistics. They share the test set, not a library.
  (PrismStatistics and PrismQDA, both in Rust, share `prismqda-stats`.)
- Accessibility findings warn and never block. A project may turn chosen rules into blockers, off by default.
- No tool is described as an alternative to a named product. Naming a product where it helps is fine.
- A format, test-set or shared-crate change starts here, with a new revision, and both tools run it before it is
  merged.

## Checks in this repository

```bash
node tools/check_all.mjs
```

This runs each package's tests, the test set's own check, `readPstat` against the conformance files, the spec's
example files, the A11Y-1 catalogue's copies and the accessibility test set's checksums, and `cargo test` for each
crate (the accessibility engine's run of its 20 cases among them; skipped when cargo is not on the PATH, or with
`--no-rust`). It needs nothing outside the repository.

## Changes

- **2026-11-16, accessibility rules (priority 3, second part).** A11Y-1 revision 1.0 (`specs/a11y`): the catalogue
  (36 machine rules, 6 checks for a person), statuses, contrast, the report and the project setting
  (`accessibilityChecks`, empty by default, so nothing blocks unless the author chooses). The engine `openstage-a11y`
  0.1.0 (tag `a11y-v0.1.0`) for web pages, help sites, EPUB, Word, PowerPoint and WebVTT; `@openstage/a11y` 0.1.0 for
  editors; the test set of 20 cases and the shared contrast cases. Notes for OpenExplainer, the Recorder, Capture
  Express and Author.

- **2026-11-15, capture (priority 3, first part).** The capture code (six Rust crates, schema 0.2.5) and its format
  documents moved here from OpenStage Author, with the shared `edit.json` examples; tag `capture-v0.1.0`; 724 tests
  pass. The TypeScript editing code's two copies have drifted (13 files, and webcam placement built twice), listed in
  `specs/capture/README.md` for the merge in the Recorder round. Notes for the Recorder, Author and Capture Express.
- **2026-11-15, public.** The author made the repository public. First releases: `pstat-v1.2.0` (the package as a
  download) and `item-analysis-v1.1.0` (the test set as a zip). PrismQDA and PrismStatistics's public copy can now
  depend on the crate's tag; R4 is done.
- **2026-11-15, for PrismQDA.** Its section gains the reused-id risk, the `docs/API.md` sentence and the case table's
  missing test set, so the hand-off carries what was found while writing profile 7.3.
- **2026-11-15, the author's answers.** PSTAT-1 revision 1.2 and `@openstage/pstat` 1.2.0: profile 2 may carry
  students' ids and names. C7 and C8 on the new [ROADMAP.md](ROADMAP.md). OpenAssess builds the short-answer boxes
  now.
- **2026-11-15, second round.** PSTAT-1 revision 1.1 (parts, profiles 7.2 and 7.3, the `q` numbering); test set 1.1.0
  (two cases, new figures); `@openstage/pstat` 1.1.0; `prismqda-stats` 1.0.0 moved here; `check_set.mjs` runs in a
  copy. Answers the OpenAssess requests 1 and 2 (3 and 4 recorded) and the PrismStatistics requests R1, R2, R3, R5 and
  R6 (R4 waits on the repository going public).
- **2026-11-15.** First version: .pstat format 1 (spec 1.0), the item-analysis test set 1.0.0, `@openstage/pstat` 1.0.0.
