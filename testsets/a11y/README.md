# The A11Y-1 conformance set

Small inputs, each with the report a checker of the OpenStage accessibility rules
([A11Y-1](../../specs/a11y/A11Y-1.md)) must give for it. The expected findings were worked out by hand from the rules,
not copied from any checker's output.

| Case | Input | What it is about |
|---|---|---|
| `html-clean` | a page | Nothing to find, in the light and the dark scheme. |
| `html-pictures` | a page | Missing, placeholder and file-name descriptions; a decorative picture with a description; an image button and an SVG with no name. |
| `html-headings` | a page | A first heading of level 2, a skipped level, an empty heading. |
| `html-names` | a page | Buttons, fields and links with no name; vague links; the keyboard; a positive tabindex; a misspelt role. |
| `html-ids` | a page | An id used twice; references to ids that are not there. |
| `html-contrast` | a page | Colours in both schemes, large and bold text, text on a picture, a see-through tint. |
| `html-media` | a page | Captions, descriptions, transcripts, sound that starts by itself, an embedded video, a refresh and a marquee. |
| `html-tables` | a page | Header cells. |
| `html-lang-title`, `html-no-lang` | a page | A language tag with an underscore, a placeholder title, no language. |
| `site` | a folder | Pages in a folder and a sub-folder sharing a style sheet; a focus rule reported once; focus shown on a surrounding box (not reported); navigation with no way past; a broken skip link; a page with no title. |
| `epub-clean`, `epub-problems` | EPUB 3 | The package's details and contents list; chapters as pages; one outline for the whole book. |
| `docx-clean`, `docx-problems` | Word | Title, language, headings from styles, pictures, a header row, links, colours from styles. |
| `pptx-problems` | PowerPoint | Slide titles, pictures, a table, a link, large text on a dark shape. |
| `vtt-clean`, `vtt-reading`, `vtt-broken` | WebVTT | Reading in time; a file that does not start with WEBVTT. |
| `pdf-not-yet` | PDF | Engine 0.1 reads no PDFs, so every PDF rule is not tested. |

Each case is a folder in `cases/` with its input and `expected.json`:

| Member | |
|---|---|
| `input` | The file (or folder) to check, inside the case's folder. |
| `findings` | Every finding the report must have, by `key`, with its `rule` and `status`, and its `variant`, `count` and `params` where given. A report with one more or one fewer fails. |
| `rules` | Rule statuses the report must have. |
| `summary`, `checklist`, `limits`, `kind`, `files` | Where given: summary numbers, the person rules on the checklist (exactly), limits that must be listed, the input's kind and how many files were read. |

## Checking a checker

```bash
node testsets/a11y/check/check_engine.mjs --engine crates/openstage-a11y/target/debug/openstage-a11y
```

Any program that takes `check <input> --json` and prints an A11Y-1 report can be checked this way. The engine's own
tests (`cargo test` in `crates/openstage-a11y`) make the same comparison.

The Word, PowerPoint and EPUB files are made from their parts by `make_cases.mjs`, so nothing here is a binary file that
cannot be read; `node testsets/a11y/make_cases.mjs` writes every case again and `SHA256SUMS.txt`.

## The ratios, worked out

Luminance by A11Y-1 section 3.1, to five places (`L(v)` is one channel's linear value; a grey's luminance is that
value):

| Colour | L |
|---|---|
| `#FFFFFF` | 1 |
| `#949494` (148) | 0.29614 |
| `#999999` (153) | 0.31855 |
| `#AAAAAA` (170) | 0.40198 |
| `#777777` (119) | 0.18447 |
| `#767676` (118) | 0.18116 |
| `#595959` (89) | 0.09990 |
| `#808080` (128) | 0.21586 |
| `#555555` (85) | 0.09084 |
| `#5A5A5A` (90) | 0.10224 |
| `#222222` (34) | 0.01600 |
| `#1F1F1F` (31) | 0.01370 |
| `#111111` (17) | 0.00561 |
| `#000000` | 0 |

| Case | Pair | Ratio | In words | Minimum | Result |
|---|---|---|---|---|---|
| `html-contrast` `#grey` | #777777 on #FFFFFF | 1.05 / 0.23447 = 4.478 | 4.4 | 4.5 | fail (twice) |
| `html-contrast` `#large` | #949494 on #FFFFFF, 24px (18pt) | 1.05 / 0.34614 = 3.033 | 3.0 | 3 | pass |
| `html-contrast` `#boldish` | #949494, 19px bold (14.25pt) | 3.033 | 3.0 | 3 | pass |
| `html-contrast` `#smallbold` | #949494, 18px bold (13.5pt, not large) | 3.033 | 3.0 | 4.5 | fail |
| `html-contrast` `#tint` | #000000 on rgba(0,0,0,.5) over #FFFFFF = #808080 (127.5 rounds to 128) | 0.26586 / 0.05 = 5.317 | 5.3 | 4.5 | pass |
| `html-contrast` `#ok` | #595959 on #FFFFFF | 1.05 / 0.14990 = 7.005 | 7.0 | 4.5 | pass |
| `html-contrast` `#grey`, dark | #555555 on #222222 | 0.14084 / 0.06600 = 2.134 | 2.1 | 4.5 | fail (twice) |
| `html-contrast` `#tint`, dark | #000000 on rgba(0,0,0,.5) over #222222 = #111111 | 0.05561 / 0.05 = 1.112 | 1.1 | 4.5 | fail |
| `html-contrast` `#large`, dark | #949494 on #222222 | 0.34614 / 0.06600 = 5.245 | 5.2 | 3 | pass |
| `site` `#muted`, `#p2` | #999999 on #FFFFFF | 1.05 / 0.36855 = 2.849 | 2.8 | 4.5 | fail |
| `epub-problems` `#faint` | #AAAAAA on #FFFFFF | 1.05 / 0.45198 = 2.323 | 2.3 | 4.5 | fail |
| `docx-clean` (Subtle style) | #767676 on #FFFFFF, 11pt | 1.05 / 0.23116 = 4.542 | 4.5 | 4.5 | pass |
| `docx-problems` paragraph 3 | #999999 on #FFFFFF, 11pt | 2.849 | 2.8 | 4.5 | fail |
| `pptx-problems` shape 5 | #5A5A5A on #1F1F1F, 24pt | 0.15224 / 0.06370 = 2.390 | 2.3 | 3 | fail |

## Changes

- **1.0** (2026-11-16): the first 20 cases.
