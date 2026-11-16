# @openstage/a11y

The OpenStage accessibility rules ([A11Y-1](https://github.com/jasonswrench-beep/openstage-core/blob/main/specs/a11y/A11Y-1.md))
for a tool's own editor: the rule catalogue and its words, the status words and symbols, contrast as WCAG 2.1 works it
out, findings in the report's shape, and a project's settings (ignored rules and findings, and blockers, which are
none unless the author chooses). No dependencies; plain JavaScript modules for Node 20 or later and any browser.

It does not read files. Checking what a tool made (a web page, a help site, an EPUB, a Word or PowerPoint file, a
captions file) is the engine's work: `openstage-a11y` in the same repository.

```js
import { textContrast, ratioWords, finding, readSettings, applySettings, statusWord, statusSymbol } from "@openstage/a11y";

const c = textContrast("#999999", "#FFFFFF", { sizePx: 16 });   // { ratio: 2.849..., minimum: 4.5, large: false, status: "fail" }
const f = finding("contrast-graphic", "fail", { object: "mark_7" }, { foreground: "#949494", background: "#FFFFFF", ratio: ratioWords(2.95) });
f.message;                                                     // "#949494 against #FFFFFF is 2.9 to 1; a mark or a control needs at least 3 to 1."
`${statusSymbol(f.status)} ${statusWord(f.status)}`;           // "✗ Fail"

const settings = readSettings(project);                        // { ignored: [], ignoredFindings: [], blockers: [] } unless the author chose
const shown = applySettings(report, settings);                 // shown.blocking is empty unless a blocker's finding fails
```

Install it from its release (no sign-in needed), once the package has one:

```bash
npm install --save-dev https://github.com/jasonswrench-beep/openstage-core/releases/download/a11y-v0.1.0/openstage-a11y-0.1.0.tgz
```
