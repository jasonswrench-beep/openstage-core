# OpenStage core

The shared core of the OpenStage tools: the file formats, packages and test sets that more than one tool depends on.
Each tool keeps its own code; what is here is the contract between them.

- [CORE-NOTES.md](CORE-NOTES.md): what each piece offers, its version, how to use it, and what each tool must do.
- [ROADMAP.md](ROADMAP.md): later work, agreed but not scheduled.
- [specs/pstat/PSTAT-1.md](specs/pstat/PSTAT-1.md): the `.pstat` project file, format 1, revision 1.2 (locked), and its profiles.
- [testsets/item-analysis](testsets/item-analysis/README.md): the item-analysis test set that OpenAssess and
  PrismStatistics must both match.
- [packages/pstat](packages/pstat): `@openstage/pstat`, to read, write and check `.pstat` files.
- [crates/prismqda-stats](crates/prismqda-stats): the statistics crate PrismQDA and PrismStatistics share (Rust).
- [specs/capture](specs/capture/README.md) and [capture](capture): the capture format (how a screen recording is
  kept) and the Rust code that records and reads it, shared by OpenStage Author, OpenStage Recorder and Capture
  Express.
- [specs/a11y/A11Y-1.md](specs/a11y/A11Y-1.md): the accessibility rules every tool uses (rule ids mapped to WCAG 2.1
  AA, the status words, contrast, the report, and the project setting for opt-in blockers, empty by default), with
  [crates/openstage-a11y](crates/openstage-a11y) (the engine that checks web pages, help sites, EPUB, Word, PowerPoint
  and captions files), [packages/a11y](packages/a11y) (`@openstage/a11y`, for editors) and
  [testsets/a11y](testsets/a11y/README.md) (the cases every checker must match).
- [specs/bank/BANK-1.md](specs/bank/BANK-1.md): OpenAssess's question bank file (`.openassess`, format 1) as other tools
  read it, with [packages/bank](packages/bank) (`@openstage/bank`, the reader, for Node and the browser) and
  [testsets/bank](testsets/bank/README.md) (banks, two written by OpenAssess itself, and what a reader must give).

Run every check that needs nothing outside this repository with `node tools/check_all.mjs` (Node 22.2 or later, and
cargo for the crate). The reference values are made with R (`Rscript make_reference.R` in the test set's folder), base
R only.

Licensed under the Apache License 2.0 (see LICENSE).
