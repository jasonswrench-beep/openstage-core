# The bank reader's test set

Banks, each with what a reader of OpenAssess banks ([BANK-1](../../specs/bank/BANK-1.md)) must give for it. Two are
banks OpenAssess's own code wrote, so the reader is held to the real writer, not to a reading of its documents.

| Case | Bank | What it is about |
|---|---|---|
| `gift-import` | written by OpenAssess's importer from [`sources/printing.gift`](sources/printing.gift) (alpha 29) | Eight question types, feedback on options, GIFT's categories as tags, no folders, the importer's history entry. |
| `course` | written by OpenAssess's bank code, [`sources/make_course_bank.ts`](sources/make_course_bank.ts) | Folders inside folders; full details; a picture and its bytes; an equation; an edit by a second author (version 2, back to draft); a retired question; one in no folder; a test, and a class's figures for it on 2026-11-14. |
| `damaged` | hand-made | Folders that are not JSON; a question file that is not JSON; an unknown type; no stem; one id in two files; a file named for another id; a status format 1 does not have; a missing picture; HTML outside the subset; plain-text feedback. |
| `damaged-zip` | hand-made | A question whose packed bytes no longer match their check value. |
| `newer-format`, `not-a-bank`, `no-manifest`, `no-version`, `not-a-zip` | hand-made | Files that are refused, each with its error code. |

Each case is a folder in `cases/` with the bank and `expected.json`: `error` (the code readBank must raise), or `bank`
(top-level fields that must match), `questions` (exactly these ids in this order, each with the listed fields
matching), `media` (picture files with their size and SHA-256, or `null` for none) and `problems` (exactly these, each
by file, question id, whether it was skipped and a piece of its message). A listed object is matched on its listed
members only; a listed list must have exactly that many entries.

The expected values were written from the sources (the GIFT file, the script, and the parts in `make_cases.mjs`), not
from a reader's output.

```bash
node testsets/bank/check/check_reader.mjs                      # the core's @openstage/bank
node testsets/bank/check/check_reader.mjs --module <file.mjs>  # any module that exports readBank
```

`node testsets/bank/make_cases.mjs` writes the hand-made banks, every `expected.json` and `SHA256SUMS.txt` again; it
does not touch the two banks OpenAssess wrote. Making those again (with an OpenAssess clone) gives new ids, so the
expected files would need the new ids.

## Changes

- **1.0** (2026-11-16): the first 9 cases.
