# Roadmap

Later work for the shared core: agreed in principle, not scheduled. The current work is in [CORE-NOTES.md](CORE-NOTES.md)
("Where things stand"): priority 3, packaging the capture format (C1), the accessibility rules (C2) and the bank
reader (C4); then priority 4, Author's validator warning instead of blocking. An item moves from here into
CORE-NOTES when the author schedules it.

## The order of the rounds (the author's word, 2026-11-15)

1. **Now:** OpenAssess and PrismStatistics finish their rounds on what the core published (PSTAT-1 1.2, set 1.1.0,
   `prismqda-stats`). Meanwhile the core does priority 3, so the next round has packages to move onto.
2. **Next, together:** OpenExplainer, OpenStage Recorder and PrismQDA.
   - Recorder (with Author): move to the core's capture code (tag `capture-v0.1.0`), and merge the two drifted
     copies of the editing code into one core package (the list is in `specs/capture/README.md`). Capture Express
     moves its three pins to the same tag.
   - OpenExplainer and Recorder: the accessibility rules (C2) as a core package, once priority 3 has it. OpenExplainer
     uses none of the capture code today.
   - PrismQDA: its section of CORE-NOTES.md (the shared statistics crate, the case-table profile, the reused ids, the
     docs sentence, and a test set for the case table).

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

## OpenStage Recorder: captions, Send to and audio description (C5 and C1)

Asked by OpenStage Recorder (its development list of 2026-11-15, items 2, 3 and 4); moved here by the author the same
day. The Recorder builds none of the three until the core has the pieces. What it needs from each is written in
`CORE-REQUESTS.md` in the Recorder's repository.

- **Captions.** C5, the speech engine (built inside OpenStage Author today), lifted out so the tools share one install
  of the speech models: captions made from a recording's speech on the computer, with times, for the editor to check
  and correct. And C1: what a caption track holds in the capture format, and the WebVTT file the video maker writes
  beside the MP4.
- **Send to.** C1's "send to" path: one recording opened in OpenExplainer, OpenStage Studio or OpenStage Author,
  without exporting it by hand. Today only Author reads the Recorder's recording folder.
- **Audio description.** C5's text-to-speech, on the computer, and C1: what a description track holds, and how a
  spoken description goes into the video's sound or a second sound file.

## OpenAssess: what is left after alpha 29

Put here by the author on 2026-11-15, after OpenAssess alpha 29 (boxes for short answers) was published. Alpha 29 was
installed by hand and shows its release; nothing past that has been tried in it yet. The full lists are in OpenAssess's
`TESTING-TODO.md` (what only a person can check), `CORE-REQUESTS.md` and `CORE-HANDOFF.md` (what waits on the core) and
`docs/review-findings.md` (known faults).

**Waiting on the core**

- **C7, the source ledger** (OpenAssess item 7): see the C7 section above.
- **C8, the AI runtime** (OpenAssess item 8, and the model's suggested score for a short-answer box in item 9): see
  the C8 section above.
- **Two rulings in PSTAT-1 section 7.2.** A short answer written in a box and scored by a person has no letters, and
  a credited question whose marks were never settled has no letters either. The checker wants an `r` cell for each,
  so OpenAssess writes `""`, which the spec keeps for "left blank", and says so in the file's notes. Either leaving out
  the `r` variable for type `other` or naming a value for "no letters" would settle both (`CORE-HANDOFF.md` 2b and 2c).
- **For PrismStatistics:** keep the `profile` member when saving, recognise `OpenAssess item results 1` and 2 when
  opening, label its item column "Corrected item-total r (total leaves the item out)", count a credited question left
  blank as credited, and fix the newer-file message that says "PrismStatistics OpenAssess" (`CORE-HANDOFF.md` 3).

**OpenAssess's own work, not yet done**

- Report each 27 percent group's own share (`upper_27`, `lower_27`), which the item-analysis checker still says it
  does not check.
- Reading files that were not used to write the rules: the acceptance test is three publisher chapters the rules were
  never fitted to, and a blind run of 16 files read few of their questions. The PDF banks read 129 of 157 (77.7
  percent), under the 95 percent target.
- Limits not yet held by a test: one huge token in a PDF content stream, the peak memory of a zip (about three times
  its largest entry), a character map's lookup over every range, and a table cell that says `colspan="999"`.
- Two copies of the app open on one library can lose each other's edits; whether to lock the library is the author's
  decision.

**Needs a person**

- Use the installed alpha 29 end to end: import a Word bank, save, export, print a student copy and a key, and print a
  sheet with boxes.
- Answer sheets on real paper: volunteers' filled sheets, scanned and photographed, to set the fill lines (`assess
  sheets calibrate`) and to try the boxes (is a 26 mm box tall enough, can pencil be read in the cut-out, does a
  slanted phone photo still cut each box out whole).
- A real import of each export into a learning system: only the Brightspace question CSV has been tried. Moodle XML,
  QTI 1.2, 2.1 and 3.0, Common Cartridge, GIFT and the Blackboard upload file have not, and no file written by
  Blackboard itself has been read.
- A real results report from Canvas, Brightspace and Blackboard: the three layouts were written from documentation.
- A `.pstat` from OpenAssess opened in PrismStatistics by double-click.
- A screen reader and Windows high contrast in the window, including the Review card for a box.
- The decisions OpenAssess made without asking, listed in its `TESTING-TODO.md` under "Decisions that are mine until
  you say otherwise", each kept or reversed.

## Done when the repository went public (2026-11-15)

- Tagged core releases with the conformance and test-set files, so a release check fetches them by tag (asked by
  PrismStatistics, R4): `pstat-v1.2.0`, `item-analysis-v1.1.0`.
- `npm pack` files of each package on the releases, installable by URL (Scroll and others).
- Still to do in the tools: PrismQDA moves from its own copy of `prismqda-stats` to the shared tag, and so does
  PrismStatistics's public copy (`prism_statistics`). Both are in CORE-NOTES.
