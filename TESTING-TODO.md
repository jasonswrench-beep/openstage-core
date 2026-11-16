# Checks only the author can make

Everything else is checked by the scripts (`node tools/check_all.mjs`, and the two tool checkers in CORE-NOTES.md).

## The .pstat format and the item-analysis test set (2026-11-15)

- [ ] **Open one of the test set's files in the PrismStatistics window.** Double-click
  `testsets\item-analysis\cases\small-ties\small-ties.pstat` (or use File, Open project). Data View should show `sheet`,
  `version` (A and B), `q01` to `q06` labelled Question 1 to Question 6, and `total`. Then run Analyze, Scale,
  Reliability on q01 to q06: alpha should be .47 (0.4724 in `reference.json`, `reliability_listwise.alpha`). The files
  have been opened only through the batch runner (`prism.exe run`), not in the window.
- [ ] **Decide the two labels.** The test set asks OpenAssess to show "Point-biserial (total includes the question)" and
  PrismStatistics "Corrected item-total r (total leaves the item out)". Change the wording here first if you want
  other words.
- [ ] **Decide when this repository goes public.** It is private, so Scroll (a public repository) and others cannot yet
  install its packages from a URL. Making it public is a GitHub setting only you change.
- [ ] **Optional: a second, independent check of the figures.** The reference values come from R 4.6.1 on this PC. If
  you have another statistics program at hand, its reliability output for one case (`class-40`: alpha 0.6131,
  `reliability_listwise.alpha` in `reference.json`) would confirm them from outside R.

## Second round: profile 2, the case table and set 1.1.0 (2026-11-15)

- [x] **Whether profile 2 may carry a student id.** Answered 2026-11-15: ids and names are both fine, since the files
  stay on the instructor's computer. Revision 1.2 adds `student_name` beside `student_id`.
- [ ] **Optional: open `testsets\item-analysis\cases\letters-60\letters-60.pstat` in the PrismStatistics window.**
  Data View should show `q01` to `q11`, `total`, then `r01` to `r11` holding letters such as `C` and `AC` (some
  empty). It has been opened only through the batch runner.
- [x] **OpenAssess item 9 (short answers).** Answered 2026-11-15: build the boxes now, scored by a person against the
  rubric; reading handwriting with a model waits on C8.
- [x] **When to take C7 (source ledger) and C8 (local AI runtime).** Answered 2026-11-15: on the roadmap, not
  pressing. They are in ROADMAP.md.
- [ ] **PrismQDA keeps its own copy of the statistics crate** until this repository is public, because its own
  repository is public and cannot depend on a private one. Going public settles this, R4 (tagged releases) and
  installing `@openstage/pstat` by URL.
