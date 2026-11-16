# The capture format (C1)

How OpenStage keeps a screen recording: a folder named `something.capture` beside the course, holding the manifest
(`capture.json`), the edit decisions (`edit.json`) and one folder per take (the video, the microphone and the computer's
sound, and a log of markers, clicks and keys). Schema version **0.2.5**.

| Document | What it fixes |
|---|---|
| [capture-project-format.md](capture-project-format.md) | The folder, the manifest, each take and the event log; which older versions still open. |
| [capture-edit-format.md](capture-edit-format.md) | `edit.json`: trims, splits, where clips sit, zooms, callouts and the other edit decisions. |
| [capture-protocol-spec.md](capture-protocol-spec.md) | How an app talks to the capture engine while it records. |

These came from OpenStage Author (`docs/capture`, commit 3c47a83) unchanged, and from 2026-11-15 the copies here are
the ones to change. The code that follows them is in [`../../capture`](../../capture): the Rust workspace of six
crates (protocol, project, the engine, render, the Windows capture and a command-line tool), moved from the same
Author commit. It is the code OpenStage Recorder holds and Capture Express pins (Author commit 4c8d23f), with two
differences: the workspace's `repository` line named an old repository and now names this one, and the files are kept
here with the repository's plain line endings (the `.bat` and `.ps1` files keep Windows ones). The shared examples of
`edit.json` that its tests read are in [`../../capture-edit/fixtures`](../../capture-edit/fixtures), where the merged
editing code will also go. Its 724 tests pass here (`cargo test --workspace` in `capture`).

## Who uses it

| Tool | What it uses today | Where it gets it |
|---|---|---|
| OpenStage Author | all six crates, and the editing code (`capture-edit`, `capture-timeline`) | its own copy |
| OpenStage Recorder | all six crates, and the editing code | its own copy, kept in step with Author's by hand |
| Capture Express | `openstage-capture-project`, `-render`, `-windows` | a git dependency on Author's repository, commit 4c8d23f |
| OpenExplainer | none (it has a capture helper of its own) | |

## The editing code has drifted (2026-11-15)

The TypeScript editing code is not in the core yet, because its two copies are no longer the same and need a choice
for each file. Author's copy is `capture-edit` and `capture-timeline` at commit 3c47a83; the Recorder's at commit
93e2bb8. "Lines" counts the lines that differ.

| File | Lines | Author's last change | Recorder's last change |
|---|---|---|---|
| `capture-edit/src/fromTakes.ts` | 21 | 2026-10-28 | 2026-10-25 |
| `capture-edit/src/index.ts` | 1 | 2026-11-01 | 2026-11-01 |
| `capture-edit/test/fromTakes.test.ts` | 39 | 2026-10-28 | 2026-10-25 |
| `capture-timeline/src/callout-panel.ts` | 6 | 2026-11-01 | 2026-11-01 |
| `capture-timeline/src/editor.ts` | 4 | 2026-10-18 | 2026-10-24 |
| `capture-timeline/src/index.ts` | 1 | 2026-10-17 | 2026-10-24 |
| `capture-timeline/src/panel.ts` | 59 | 2026-10-28 | 2026-10-24 |
| `capture-timeline/src/preview-panel.ts` | 4 | 2026-10-28 | 2026-10-26 |
| `capture-timeline/src/project.ts` | 17 | 2026-10-28 | 2026-10-25 |
| `capture-timeline/src/session.ts` | 123 | 2026-11-01 | 2026-11-01 |
| `capture-timeline/test/balance.test.ts` | 223 | 2026-10-28 | 2026-10-25 |
| `capture-timeline/test/project.test.ts` | 45 | 2026-10-28 | 2026-10-23 |
| `capture-timeline/test/session.test.ts` | 3 | 2026-11-01 | 2026-11-01 |

**Webcam placement was built twice:** Author's `capture-edit/src/webcamPlace.ts` (2026-10-28, with the loudness boxes
and the sound balance) and the Recorder's `capture-timeline/src/webcam-place.ts` (2026-11-01, using Author's sizes:
18, 22 and 32 percent of the width). Each file exists on one side only.

Neither copy is simply the newer one, so the merge is made in the Recorder round with the Author and Recorder
sessions, file by file, and the merged code then moves here as one package that both use.
