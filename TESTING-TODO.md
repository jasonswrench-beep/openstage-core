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
