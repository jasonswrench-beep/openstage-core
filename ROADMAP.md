# Roadmap

Later work for the shared core: agreed in principle, not scheduled. The current work is in [CORE-NOTES.md](CORE-NOTES.md)
("Where things stand"): priority 3, packaging the capture format (C1), the accessibility rules (C2) and the bank
reader (C4); then priority 4, Author's validator warning instead of blocking. An item moves from here into
CORE-NOTES when the author schedules it.

## C7: the source ledger (textbook passages)

Asked by OpenAssess (its development list, item 7), 2026-11-15. Each question is linked to the passage of the textbook
it was written from, so that a new edition flags exactly the questions to check.

- A **passage reference** format with a spec, like PSTAT-1: the source document and its edition, a place in it that
  survives re-pagination, and the passage's text or a fingerprint of it.
- The **comparison of two editions** of a source (.docx and PDF): for each reference, unchanged, changed (with the old
  and the new text), or gone.
- A **test set** of two editions with the expected result for each reference.

OpenAssess will store the references on a question, show them in its editor and bank, and run the comparison when a
new edition is chosen. It builds nothing until the format exists.

## C8: the local AI runtime and assistant server

Asked by OpenAssess (items 8 and 9), 2026-11-15; other tools have AI parts of their own to bring under it.

- One model download and runtime per machine, and how a tool asks whether a local model or a key is there and calls
  it. With no model, every feature still works.
- One settings page for bring-your-own keys, so no tool keeps keys of its own.
- One pattern for each tool's assistant server: transport, tool descriptions, how a person approves a call.
- OpenAssess's rules, which C8 keeps: a model never sets an answer key, an AI suggestion is something a person accepts
  or dismisses, and nothing leaves the machine unless the person turned that on.
- OpenAssess item 9 (handwritten short answers read by a model and offered as suggestions) waits on it. The boxes
  themselves, cut out and scored by a person, do not, and OpenAssess builds them now.

## When the repository is public

- Tagged core releases with the conformance and test-set files, so a release check fetches them by tag (asked by
  PrismStatistics, R4).
- `npm pack` tarballs of each package on the releases, installable by URL (Scroll and others).
- PrismQDA moves from its own copy of `prismqda-stats` to the shared tag (its repository is public and cannot depend on
  a private one).
