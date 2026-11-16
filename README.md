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

Run every check that needs nothing outside this repository with `node tools/check_all.mjs` (Node 22.2 or later, and
cargo for the crate). The reference values are made with R (`Rscript make_reference.R` in the test set's folder), base
R only.

Licensed under the Apache License 2.0 (see LICENSE).
