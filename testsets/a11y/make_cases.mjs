// Writes the A11Y-1 conformance set: each case's input in cases/<id>/ and what a checker must report for it in
// cases/<id>/expected.json. The expected findings were worked out by hand from the rules (A11Y-1 sections 3 and 6),
// not taken from any checker's output; the ratios are worked out in README.md. Run from anywhere:
//   node testsets/a11y/make_cases.mjs
// The Word, PowerPoint and EPUB files are built here from their parts, so the set has no binary file that cannot be
// read. SHA256SUMS.txt is rewritten.

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { writeArchive } from "../../packages/pstat/src/zip.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, "cases");
const enc = (s) => new TextEncoder().encode(s);

// A finding the checker must report: rule, status, key (A11Y-1 section 4.2), and optionally variant, count and params.
const f = (rule, status, key, more = {}) => ({ rule, status, key, ...more });

const PAGE = (title, body, { lang = ' lang="en"', head = "" } = {}) =>
  `<!doctype html>\n<html${lang}>\n<head>\n<meta charset="utf-8">\n<title>${title}</title>${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

const cases = [];

cases.push({
  id: "html-clean",
  about: "A page with nothing to find: language, title, a main part, a skip link, headings in order, described and decorative pictures, a labelled field, a table with headers, a video with captions and descriptions, a sound with a transcript, and colours that pass in both schemes.",
  files: {
    "clean.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Changing the printer</title>
<style>
:root { color-scheme: light dark; --fg: #1a1a1a; --bg: #ffffff; --link: #0b57d0; }
@media (prefers-color-scheme: dark) { :root { --fg: #f0f0f0; --bg: #121212; --link: #a8c7fa; } }
body { color: var(--fg); background: var(--bg); font: 16px/1.5 sans-serif; }
a { color: var(--link); }
a:focus-visible { outline: 3px solid var(--link); }
</style>
</head>
<body>
<a href="#main" id="skip">Skip to the content</a>
<nav aria-label="Topics"><ul><li><a href="other.html">Printing a page</a></li></ul></nav>
<main id="main">
<h1>Changing the printer</h1>
<p>Choose the printer before you print.</p>
<img src="dialog.png" alt="The Print window, with the Printer list open">
<img src="divider.png" alt="">
<h2>Steps</h2>
<form><label for="copies">Copies</label> <input id="copies" type="number" value="1"> <button type="button">Print</button></form>
<table><tr><th scope="col">Key</th><th scope="col">Does</th></tr><tr><td>Ctrl+P</td><td>Opens Print</td></tr></table>
<video controls src="steps.mp4"><track kind="captions" src="steps.vtt" srclang="en" label="English"><track kind="descriptions" src="steps-ad.vtt" srclang="en"></video>
<p><audio controls src="intro.mp3"></audio> <a href="intro.html">Transcript of the introduction</a></p>
</main>
</body>
</html>
`,
  },
  input: "clean.html",
  expected: {
    findings: [],
    rules: { "page-lang": "pass", "page-title": "pass", "alt-missing": "pass", "heading-order": "pass", "heading-start": "pass", "contrast-text": "pass", "captions-missing": "pass", "audio-description": "pass", "table-headers": "pass", "bypass-blocks": "pass", "landmark-main": "pass", "control-name": "pass", "link-name": "pass", "timed-content": "not-applicable", "focus-visible": "not-applicable" },
    checklist: ["reading-order", "alt-meaning", "color-only", "keyboard-trial", "captions-accuracy", "flashing"],
  },
});

cases.push({
  id: "html-pictures",
  about: "Pictures: no description, placeholder descriptions (a word, a file name, the file's stem), a decorative picture that has a description, an image button and an SVG with no name. A picture hidden from screen readers and a decorative one with an empty description are fine.",
  files: {
    "pictures.html": PAGE("Pictures", `<main>
<h1>Pictures</h1>
<img id="none" src="a.png">
<img id="word" src="b.png" alt="image">
<img id="file" src="c.png" alt="photo-01.png">
<img id="stem" src="img/step_3.png" alt="step_3">
<img id="good" src="d.png" alt="The Save button, circled">
<img id="deco" src="e.png" alt="">
<img id="both" src="f.png" role="presentation" alt="A swirl">
<img id="hid" src="g.png" aria-hidden="true">
<input id="go" type="image" src="go.png">
<svg id="chart" role="img" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>
<svg id="named" role="img" aria-label="A bar chart of sales"><rect width="10" height="10"/></svg>
</main>`),
  },
  input: "pictures.html",
  expected: {
    findings: [
      f("alt-missing", "fail", "alt-missing pictures.html#id=none"),
      f("alt-missing", "fail", "alt-missing pictures.html#id=go"),
      f("alt-missing", "fail", "alt-missing pictures.html#id=chart"),
      f("alt-weak", "fail", "alt-weak pictures.html#id=word", { params: { alt: "image" } }),
      f("alt-weak", "fail", "alt-weak pictures.html#id=file"),
      f("alt-weak", "fail", "alt-weak pictures.html#id=stem"),
      f("alt-decorative-text", "fail", "alt-decorative-text pictures.html#id=both"),
    ],
    rules: { "alt-missing": "fail", "alt-weak": "fail", "alt-decorative-text": "fail", "page-lang": "pass" },
  },
});

cases.push({
  id: "html-headings",
  about: "Headings: the first is level 2, a level is skipped, one is empty. A role=heading with aria-level and a heading whose only content is a described picture are fine.",
  files: {
    "headings.html": PAGE("Headings", `<main>
<h2 id="first">Getting started</h2>
<h4 id="skip">Before you begin</h4>
<h3 id="empty"></h3>
<div id="aria" role="heading" aria-level="3">Installing</div>
<h3 id="img"><img src="logo.png" alt="OpenStage"></h3>
</main>`),
  },
  input: "headings.html",
  expected: {
    findings: [
      f("heading-start", "fail", "heading-start headings.html#id=first", { params: { level: "2" } }),
      f("heading-order", "fail", "heading-order headings.html#id=skip", { params: { level: "4", previous: "2", expected: "3" } }),
      f("heading-empty", "fail", "heading-empty headings.html#id=empty"),
    ],
    rules: { "heading-start": "fail", "heading-order": "fail", "heading-empty": "fail", "role-unknown": "pass" },
  },
});

cases.push({
  id: "html-names",
  about: "Names, links and the keyboard: an empty button, a field with no label, an empty link, two vague links, a div button with no key handler, a span that only reacts to a click, a link taken out of the Tab order, a positive tabindex and a misspelt role.",
  files: {
    "names.html": PAGE("Names", `<main>
<h1>Names</h1>
<button id="b-empty"></button>
<button id="b-label" aria-label="Close"><svg aria-hidden="true" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg></button>
<input id="i-none" type="text">
<label for="i-for">Your name</label><input id="i-for" type="text">
<label>Colour <select id="s-wrap"><option>Red</option></select></label>
<a id="l-empty" href="/"><span></span></a>
<a id="l-here" href="/help">click here</a>
<a id="l-more" href="/more">Read more…</a>
<a id="l-good" href="/print">How to print</a>
<div id="d-btn" role="button" tabindex="0" onclick="go()">Save</div>
<span id="s-click" onclick="go()">Open</span>
<a id="l-out" href="/x" tabindex="-1">Hidden from Tab</a>
<a id="l-pos" href="/y" tabindex="3">Jumps ahead</a>
<div id="r-bad" role="buton">Send</div>
</main>`),
  },
  input: "names.html",
  expected: {
    findings: [
      f("control-name", "fail", "control-name names.html#id=b-empty", { params: { role: "button" } }),
      f("control-name", "fail", "control-name names.html#id=i-none", { params: { role: "text field" } }),
      f("link-name", "fail", "link-name names.html#id=l-empty"),
      f("link-vague", "needs-review", "link-vague names.html#id=l-here", { params: { text: "click here" } }),
      f("link-vague", "needs-review", "link-vague names.html#id=l-more", { params: { text: "Read more…" } }),
      f("keyboard-operate", "needs-review", "keyboard-operate names.html#id=d-btn"),
      f("keyboard-reach", "fail", "keyboard-reach names.html#id=s-click", { params: { what: "span element" } }),
      f("keyboard-reach", "needs-review", "keyboard-reach names.html#id=l-out", { variant: "removed", params: { what: "link" } }),
      f("focus-order", "needs-review", "focus-order names.html#id=l-pos", { params: { tabindex: "3" } }),
      f("role-unknown", "fail", "role-unknown names.html#id=r-bad", { params: { role: "buton" } }),
    ],
    rules: { "control-name": "fail", "link-name": "fail", "link-vague": "needs-review", "keyboard-reach": "fail", "keyboard-operate": "needs-review", "focus-order": "needs-review", "role-unknown": "fail", "id-reference": "pass" },
  },
});

cases.push({
  id: "html-ids",
  about: "Ids: one used twice, an aria-labelledby that names an id that is not there (so the field also has no name), and a label for nothing.",
  files: {
    "ids.html": PAGE("Ids", `<main>
<h1 id="top">Ids</h1>
<p id="dup">One</p>
<p id="dup">Two</p>
<input id="q" type="text" aria-labelledby="missing-label">
<label id="lab" for="nowhere">Search</label>
<p id="desc">Help text</p>
<input id="r" type="text" aria-label="Find" aria-describedby="desc">
</main>`),
  },
  input: "ids.html",
  expected: {
    findings: [
      f("id-duplicate", "fail", "id-duplicate ids.html#html/body/main[1]/p[1]", { params: { id: "dup", count: "2" } }),
      f("id-reference", "fail", "id-reference ids.html#id=q", { params: { attribute: "aria-labelledby", id: "missing-label" } }),
      f("id-reference", "fail", "id-reference ids.html#id=lab", { params: { attribute: "The label's for attribute", id: "nowhere" } }),
      f("control-name", "fail", "control-name ids.html#id=q"),
    ],
    rules: { "id-duplicate": "fail", "id-reference": "fail" },
  },
});

cases.push({
  id: "html-contrast",
  about: "Colours in the light and the dark scheme: grey text under 4.5 to 1 (twice, so counted twice), large and large bold text that pass at 3 to 1, bold text just under 14 points that fails, text on a picture (needs review), a half-black tint that passes on white and fails on the dark background, a print-only rule that is left out without a word, and a narrow-screen rule that is not followed and is listed in the limits.",
  files: {
    "colours.html": PAGE("Colours", `<main>
<p id="grey">Grey text, 4.48 to 1.</p>
<p>More grey text.</p>
<p id="large" class="large">Large light text</p>
<p id="boldish" class="boldish">Bold text of 14.25 points</p>
<p id="smallbold" class="smallbold">Bold text of 13.5 points</p>
<p id="photo" class="photo">Text on a picture</p>
<p id="tint" class="tint">Black on a half-black tint</p>
<p id="ok" class="ok">Dark grey text, 7 to 1</p>
</main>`, {
      head: `
<style>
body { color: #777777; background: #ffffff; }
.large { font-size: 24px; color: #949494; }
.boldish { font-size: 19px; font-weight: bold; color: #949494; }
.smallbold { font-size: 18px; font-weight: 700; color: #949494; }
.photo { background: url(sky.jpg); color: #333333; }
.tint { background-color: rgba(0, 0, 0, 0.5); color: #000000; }
.ok { color: #595959; }
@media (prefers-color-scheme: dark) { body { color: #555555; background: #222222; } .ok { color: #cccccc; } }
@media print { body { color: #cccccc; } }
@media (max-width: 600px) { body { color: #000000; } }
</style>`,
    }),
  },
  input: "colours.html",
  expected: {
    findings: [
      f("contrast-text", "fail", "contrast-text colours.html#id=grey", { count: 2, params: { foreground: "#777777", background: "#FFFFFF", ratio: "4.4", minimum: "4.5", size: "normal" } }),
      f("contrast-text", "fail", "contrast-text colours.html#id=smallbold", { params: { foreground: "#949494", background: "#FFFFFF", ratio: "3.0", minimum: "4.5", size: "normal" } }),
      f("contrast-text", "needs-review", "contrast-text colours.html#id=photo", { variant: "unknown-background", params: { foreground: "#333333" } }),
      f("contrast-text", "fail", "contrast-text colours.html#id=grey@dark", { count: 2, params: { foreground: "#555555", background: "#222222", ratio: "2.1", minimum: "4.5" } }),
      f("contrast-text", "needs-review", "contrast-text colours.html#id=photo@dark", { variant: "unknown-background" }),
      f("contrast-text", "fail", "contrast-text colours.html#id=tint@dark", { params: { foreground: "#000000", background: "#111111", ratio: "1.1" } }),
    ],
    rules: { "contrast-text": "fail" },
    summary: { fail: 6, needsReview: 2 },
    limits: ["Rules inside @media (max-width: 600px) were not followed."],
  },
});

cases.push({
  id: "html-media",
  about: "Media and time: a video with no captions, videos with no description track (needs review), sound that plays by itself, sound with no transcript near it, an embedded video whose captions cannot be checked, a page that moves on after 30 seconds and a marquee.",
  files: {
    "media.html": PAGE("Media", `<main><h1>Media</h1>
<video id="v-bare" src="a.mp4" controls></video>
<video id="v-cap" src="b.mp4" controls><track kind="captions" src="b.vtt"></video>
<audio id="a-auto" src="c.mp3" autoplay></audio>
<p><audio id="a-plain" src="d.mp3" controls></audio></p>
<iframe id="yt" src="https://www.youtube-nocookie.com/embed/abc" title="A talk"></iframe>
<marquee id="mq">News</marquee>
</main>`, { head: `\n<meta http-equiv="refresh" content="30; url=next.html" id="refresh">` }),
  },
  input: "media.html",
  expected: {
    findings: [
      f("captions-missing", "fail", "captions-missing media.html#id=v-bare"),
      f("captions-missing", "needs-review", "captions-missing media.html#id=yt", { variant: "embedded" }),
      f("audio-description", "needs-review", "audio-description media.html#id=v-bare"),
      f("audio-description", "needs-review", "audio-description media.html#id=v-cap"),
      f("media-autoplay", "fail", "media-autoplay media.html#id=a-auto", { params: { what: "sound" } }),
      f("transcript-missing", "needs-review", "transcript-missing media.html#id=a-auto"),
      f("transcript-missing", "needs-review", "transcript-missing media.html#id=a-plain"),
      f("timed-content", "fail", "timed-content media.html#id=refresh", { variant: "refresh", params: { seconds: "30" } }),
      f("timed-content", "fail", "timed-content media.html#id=mq", { variant: "moving", params: { element: "marquee" } }),
    ],
    rules: { "captions-missing": "fail", "audio-description": "needs-review", "media-autoplay": "fail", "transcript-missing": "needs-review", "timed-content": "fail" },
    checklist: ["reading-order", "color-only", "captions-accuracy", "flashing"],
  },
});

cases.push({
  id: "html-tables",
  about: "Tables: one with no header cells fails; one with th, one with scope, a layout table (role=presentation) and a table of one row are fine or not checked.",
  files: {
    "tables.html": PAGE("Tables", `<main><h1>Tables</h1>
<table id="bare"><tr><td>Key</td><td>Does</td></tr><tr><td>Ctrl+P</td><td>Print</td></tr></table>
<table id="good"><thead><tr><th>Key</th><th>Does</th></tr></thead><tbody><tr><td>Ctrl+S</td><td>Save</td></tr></tbody></table>
<table id="layout" role="presentation"><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>
<table id="one"><tr><td>Only</td><td>one row</td></tr></table>
<table id="scoped"><tr><td scope="row">Name</td><td>Ana</td></tr><tr><td scope="row">Role</td><td>Editor</td></tr></table>
</main>`),
  },
  input: "tables.html",
  expected: {
    findings: [f("table-headers", "fail", "table-headers tables.html#id=bare")],
    rules: { "table-headers": "fail" },
  },
});

cases.push({
  id: "html-lang-title",
  about: "A language written with an underscore (en_US) and a placeholder title.",
  files: { "lang.html": PAGE("Untitled", `<main><h1>Hello</h1></main>`, { lang: ' lang="en_US"' }) },
  input: "lang.html",
  expected: {
    findings: [
      f("page-lang", "fail", "page-lang lang.html#html", { variant: "invalid", params: { lang: "en_US", what: "page" } }),
      f("page-title", "fail", "page-title lang.html#html", { variant: "placeholder", params: { title: "Untitled" } }),
    ],
    rules: { "page-lang": "fail", "page-title": "fail" },
  },
});

cases.push({
  id: "html-no-lang",
  about: "A page that does not say its language at all.",
  files: { "nolang.html": PAGE("Printing a page", `<main><h1>Printing a page</h1></main>`, { lang: "" }) },
  input: "nolang.html",
  expected: {
    findings: [f("page-lang", "fail", "page-lang nolang.html#html", { params: { what: "page" } })],
    rules: { "page-lang": "fail", "page-title": "pass" },
  },
});

cases.push({
  id: "site",
  about: "A help site (a folder): a shared style sheet in css/, read from the top page and from a page in a sub-folder (../css/site.css), with a colour that fails and a focus rule that takes the outline away (reported once, not once a page), and a search field whose own ring is taken away but whose box shows focus with :focus-within (not reported); a page with navigation and no way past it; a page whose skip link goes nowhere; a page with no title.",
  files: {
    "site/css/site.css": `.muted { color: #999999; }\na:focus { outline: none; }\nbutton:focus { outline: 0; box-shadow: 0 0 0 3px #000000; }\n.box input:focus-visible { outline: none; box-shadow: none; }\n.box:focus-within { outline: 3px solid #000000; }\n`,
    "site/index.html": PAGE("Help: contents", `<main><h1>Contents</h1><p id="muted" class="muted">Last changed in May.</p><p><a href="skip.html">The page with a broken skip link</a></p><button type="button">Print this page</button><div class="box"><input type="search" aria-label="Search the help"></div></main>`, { head: `\n<link rel="stylesheet" href="css/site.css">` }),
    "site/no-way.html": PAGE("No way past", `<nav><a href="a.html">One</a> <a href="b.html">Two</a> <a href="c.html">Three</a></nav>\n<div><p>The content.</p></div>`),
    "site/skip.html": PAGE("Broken skip link", `<a id="skip" href="#content">Skip to the content</a>\n<nav><a href="index.html">Contents</a></nav>\n<main id="main"><h1>Page</h1><p>Text.</p></main>`),
    "site/topics/printing.html": `<!doctype html>\n<html lang="en">\n<head>\n<link rel="stylesheet" href="../css/site.css">\n</head>\n<body>\n<main><h1>Printing</h1><p id="p2" class="muted">Choose Print from the File menu.</p><a href="../index.html">Back to the contents</a></main>\n</body>\n</html>\n`,
  },
  input: "site",
  expected: {
    kind: "site",
    files: 4,
    findings: [
      f("contrast-text", "fail", "contrast-text index.html#id=muted", { params: { foreground: "#999999", background: "#FFFFFF", ratio: "2.8" } }),
      f("focus-visible", "needs-review", "focus-visible css/site.css#line=2", { params: { selector: "a:focus" } }),
      f("landmark-main", "fail", "landmark-main no-way.html#html/body"),
      f("bypass-blocks", "fail", "bypass-blocks no-way.html#html/body"),
      f("bypass-blocks", "fail", "bypass-blocks skip.html#id=skip", { variant: "skip-target", params: { id: "content" } }),
      f("page-title", "fail", "page-title topics/printing.html#html"),
      f("contrast-text", "fail", "contrast-text topics/printing.html#id=p2"),
    ],
    rules: { "contrast-text": "fail", "focus-visible": "needs-review", "landmark-main": "fail", "bypass-blocks": "fail", "page-title": "fail" },
  },
});

// EPUB 3.
const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`;
const XHTML = (title, body, lang = ' xml:lang="en" lang="en"', head = "") =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${lang}>\n<head><title>${title}</title>${head}</head>\n<body>\n${body}\n</body>\n</html>\n`;
const epub = (parts) => writeArchive([{ name: "mimetype", data: enc("application/epub+zip"), method: 0 }, { name: "META-INF/container.xml", data: enc(CONTAINER) }, ...Object.entries(parts).map(([name, text]) => ({ name, data: enc(text) }))]);

cases.push({
  id: "epub-clean",
  about: "An EPUB with nothing to find: title, language, the four accessibility details, a contents list, and two chapters whose headings run 1, 2, 1.",
  build: {
    "clean.epub": () =>
      epub({
        "OEBPS/content.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:7c1e2a3b-0000-4000-8000-000000000001</dc:identifier>
<dc:title>A Short Guide to Printing</dc:title>
<dc:language>en</dc:language>
<meta property="dcterms:modified">2026-11-16T00:00:00Z</meta>
<meta property="schema:accessMode">textual</meta>
<meta property="schema:accessMode">visual</meta>
<meta property="schema:accessibilityFeature">structuralNavigation</meta>
<meta property="schema:accessibilityFeature">alternativeText</meta>
<meta property="schema:accessibilityHazard">none</meta>
<meta property="schema:accessibilitySummary">Headings, a contents list and a description of every picture.</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>
</package>
`,
        "OEBPS/nav.xhtml": XHTML("Contents", `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="text/ch1.xhtml">Choosing a printer</a></li><li><a href="text/ch2.xhtml">Printing</a></li></ol></nav>`),
        "OEBPS/text/ch1.xhtml": XHTML("Choosing a printer", `<section epub:type="chapter" role="doc-chapter"><h1>Choosing a printer</h1><p>Open the list.</p><img src="../images/list.png" alt="The Printer list, open"/><h2>Network printers</h2><p>They show their room.</p></section>`),
        "OEBPS/text/ch2.xhtml": XHTML("Printing", `<section epub:type="chapter" role="doc-chapter"><h1>Printing</h1><p>Press Print.</p></section>`),
      }),
  },
  input: "clean.epub",
  expected: {
    kind: "epub",
    files: 3,
    findings: [],
    rules: { "page-title": "pass", "page-lang": "pass", "ebook-metadata": "pass", "bookmarks": "pass", "heading-order": "pass", "heading-start": "pass", "alt-missing": "pass", "role-unknown": "pass" },
  },
});

cases.push({
  id: "epub-problems",
  about: "An EPUB with no accessibility details and no contents list; chapter 1 has a picture with no description and faint text from the book's style sheet; chapter 2 does not say its language and its first heading is level 3, after chapter 1's level 1 (the book's headings are one outline).",
  build: {
    "problems.epub": () =>
      epub({
        "OEBPS/content.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:7c1e2a3b-0000-4000-8000-000000000002</dc:identifier>
<dc:title>A Short Guide</dc:title>
<dc:language>en</dc:language>
<meta property="dcterms:modified">2026-11-16T00:00:00Z</meta>
</metadata>
<manifest>
<item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
<item id="css" href="css/book.css" media-type="text/css"/>
</manifest>
<spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>
</package>
`,
        "OEBPS/css/book.css": `.faint { color: #aaaaaa; }\n`,
        "OEBPS/text/ch1.xhtml": XHTML("Chapter 1", `<section><h1>Chapter 1</h1><p class="faint" id="faint">Faint words.</p><img id="pic" src="../images/a.png"/></section>`, ' xml:lang="en" lang="en"', `<link rel="stylesheet" type="text/css" href="../css/book.css"/>`),
        "OEBPS/text/ch2.xhtml": XHTML("Chapter 2", `<section><h3 id="deep">Going deeper</h3><p>Text.</p></section>`, ""),
      }),
  },
  input: "problems.epub",
  expected: {
    kind: "epub",
    findings: [
      f("ebook-metadata", "fail", "ebook-metadata OEBPS/content.opf", { params: { missing: "access mode, features, hazards, summary" } }),
      f("bookmarks", "fail", "bookmarks OEBPS/content.opf"),
      f("alt-missing", "fail", "alt-missing OEBPS/text/ch1.xhtml#id=pic"),
      f("contrast-text", "fail", "contrast-text OEBPS/text/ch1.xhtml#id=faint", { params: { foreground: "#AAAAAA", background: "#FFFFFF", ratio: "2.3" } }),
      f("page-lang", "fail", "page-lang OEBPS/text/ch2.xhtml#html"),
      f("heading-order", "fail", "heading-order OEBPS/text/ch2.xhtml#id=deep", { params: { level: "3", previous: "1", expected: "2" } }),
    ],
    rules: { "ebook-metadata": "fail", "bookmarks": "fail", "page-title": "pass", "heading-start": "pass" },
  },
});

// Word.
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const drawing = (id, name, descr, uri = "http://schemas.openxmlformats.org/drawingml/2006/picture") =>
  `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="${id}" name="${name}"${descr === null ? "" : ` descr="${descr}"`}/><a:graphic><a:graphicData uri="${uri}"><pic:pic/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
const para = (text, style = null, rpr = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${text === null ? "" : `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`}</w:p>`;
const docx = (body, { title }) =>
  writeArchive([
    { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>\n`) },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>\n`) },
    { name: "docProps/core.xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${title ? `<dc:title>${title}</dc:title>` : ""}<dc:creator>OpenStage test set</dc:creator></cp:coreProperties>\n`) },
    { name: "word/styles.xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style><w:style w:type="character" w:styleId="Subtle"><w:name w:val="Subtle"/><w:rPr><w:color w:val="767676"/></w:rPr></w:style></w:styles>\n`) },
    { name: "word/document.xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>\n`) },
  ]);
const table = (header) =>
  `<w:tbl><w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}<w:tc><w:p><w:r><w:t>Key</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Does</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Ctrl+P</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Print</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;

cases.push({
  id: "docx-clean",
  about: "A Word file with nothing to find: a title, a language, headings 1, 2, 1, a described picture, a table whose first row repeats as a header, a link that says where it goes, and grey text (the Subtle style, #767676) that just passes at 4.54 to 1.",
  build: {
    "clean.docx": () =>
      docx(
        para("Printing", "Heading1") +
          para("Choose the printer first.") +
          drawing(1, "Picture 1", "The Print window, with the Printer list open") +
          para("Network printers", "Heading2") +
          `<w:p><w:r><w:rPr><w:rStyle w:val="Subtle"/></w:rPr><w:t>They show the room they are in.</w:t></w:r></w:p>` +
          table(true) +
          `<w:p><w:hyperlink r:id="rId9"><w:r><w:t>The printing help pages</w:t></w:r></w:hyperlink></w:p>` +
          para("Questions", "Heading1"),
        { title: "Printing a page" },
      ),
  },
  input: "clean.docx",
  expected: {
    kind: "docx",
    findings: [],
    rules: { "page-title": "pass", "page-lang": "pass", "heading-order": "pass", "heading-start": "pass", "alt-missing": "pass", "table-headers": "pass", "link-vague": "pass", "contrast-text": "pass" },
  },
});

cases.push({
  id: "docx-problems",
  about: "A Word file with no title; a level 3 heading after a level 1; light grey text; a picture with no description and one whose description is its name; a link that says click here; a table with no header row; an empty heading.",
  build: {
    "problems.docx": () =>
      docx(
        para("Setting up", "Heading1") +
          para("Choosing a printer", "Heading3") +
          para("Light grey words", null, `<w:color w:val="999999"/>`) +
          drawing(1, "Picture 1", null) +
          drawing(2, "Picture 2", "Picture 2") +
          drawing(3, "Chart 1", "A line chart of sign-ups by month", "http://schemas.openxmlformats.org/drawingml/2006/chart") +
          `<w:p><w:hyperlink r:id="rId9"><w:r><w:t>click here</w:t></w:r></w:hyperlink></w:p>` +
          table(false) +
          para(null, "Heading1"),
        { title: null },
      ),
  },
  input: "problems.docx",
  expected: {
    kind: "docx",
    findings: [
      f("page-title", "fail", "page-title docProps/core.xml", { params: { what: "Word file" } }),
      f("heading-order", "fail", "heading-order word/document.xml#object=paragraph 2", { params: { level: "3", previous: "1", expected: "2" } }),
      f("contrast-text", "fail", "contrast-text word/document.xml#object=paragraph 3", { params: { foreground: "#999999", background: "#FFFFFF", ratio: "2.8", size: "normal" } }),
      f("alt-missing", "fail", "alt-missing word/document.xml#id=1"),
      f("alt-weak", "fail", "alt-weak word/document.xml#id=2", { params: { alt: "Picture 2" } }),
      f("link-vague", "needs-review", "link-vague word/document.xml#object=link 1"),
      f("table-headers", "fail", "table-headers word/document.xml#object=table 1"),
      f("heading-empty", "fail", "heading-empty word/document.xml#object=paragraph 12"),
    ],
    rules: { "page-lang": "pass", "heading-start": "pass" },
  },
});

// PowerPoint.
const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const sp = (id, { title = false, text, fill = null, color = null, size = null, link = false }) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr>${title ? '<p:ph type="title"/>' : ""}</p:nvPr></p:nvSpPr><p:spPr>${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : ""}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"${size ? ` sz="${size}"` : ""}>${color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : ""}${link ? '<a:hlinkClick r:id="rId9"/>' : ""}</a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const slide = (shapes) => `<?xml version="1.0" encoding="UTF-8"?>\n<p:sld ${P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>\n`;
const pptx = (slides, title) =>
  writeArchive([
    { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>\n`) },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>\n`) },
    { name: "docProps/core.xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></cp:coreProperties>\n`) },
    { name: "ppt/presentation.xml", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<p:presentation ${P}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst></p:presentation>\n`) },
    { name: "ppt/_rels/presentation.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>\n`) },
    ...slides.map((s, i) => ({ name: `ppt/slides/slide${i + 1}.xml`, data: enc(s) })),
  ]);
const pic = (id, descr) => `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"${descr === null ? "" : ` descr="${descr}"`}/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>`;
const tbl = (id, firstRow) =>
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${firstRow ? ' firstRow="1"' : ""}/><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Key</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Does</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Ctrl+P</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Print</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;

cases.push({
  id: "pptx-problems",
  about: "A presentation: slide 1 has a title, a picture with no description and large grey text on a near-black shape (2.39 to 1, under 3 to 1); slide 2 has no title, a table with no header row and a link that says click here.",
  build: {
    "problems.pptx": () =>
      pptx(
        [
          slide(sp(2, { title: true, text: "Printing" }) + pic(4, "") + sp(5, { text: "Choose a printer", fill: "1F1F1F", color: "5A5A5A", size: 2400 })),
          slide(tbl(6, false) + sp(7, { text: "click here", link: true })),
        ],
        "Printing in three steps",
      ),
  },
  input: "problems.pptx",
  expected: {
    kind: "pptx",
    files: 2,
    findings: [
      f("alt-missing", "fail", "alt-missing ppt/slides/slide1.xml#id=4"),
      f("contrast-text", "fail", "contrast-text ppt/slides/slide1.xml#id=5", { params: { foreground: "#5A5A5A", background: "#1F1F1F", ratio: "2.3", minimum: "3", size: "large" } }),
      f("slide-title", "fail", "slide-title ppt/slides/slide2.xml#slide=2", { params: { slide: "2" } }),
      f("table-headers", "fail", "table-headers ppt/slides/slide2.xml#id=6"),
      f("link-vague", "needs-review", "link-vague ppt/slides/slide2.xml#id=7"),
    ],
    rules: { "page-title": "pass", "page-lang": "pass", "slide-title": "fail" },
  },
});

// WebVTT.
cases.push({
  id: "vtt-clean",
  about: "A captions file with nothing to find.",
  files: { "clean.vtt": "WEBVTT\n\n00:00.000 --> 00:03.000\nOpen the File menu.\n\n00:03.500 --> 00:07.000\n<v Ana>Choose Print.</v>\n" },
  input: "clean.vtt",
  expected: { kind: "vtt", findings: [], rules: { "captions-format": "pass", "captions-reading": "pass" }, checklist: ["captions-accuracy"] },
});

cases.push({
  id: "vtt-reading",
  about: "Captions that are hard to read in time: a line of 59 characters, a caption of three lines, 34 characters in one second, and a caption that starts before the one before it ends.",
  files: {
    "reading.vtt": "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nThis caption line is much longer than forty-two characters.\n\n2\n00:00:02.000 --> 00:00:04.000\nOne\nTwo\nThree\n\n3\n00:00:04.000 --> 00:00:05.000\nFar too many words for one second.\n\n4\n00:00:04.500 --> 00:00:07.000\nOverlaps the one before.\n",
  },
  input: "reading.vtt",
  expected: {
    kind: "vtt",
    findings: [
      f("captions-reading", "needs-review", "captions-reading reading.vtt#line=4", { variant: "line", params: { length: "59", limit: "42" } }),
      f("captions-reading", "needs-review", "captions-reading reading.vtt#line=8", { variant: "lines", params: { lines: "3", limit: "2" } }),
      f("captions-reading", "needs-review", "captions-reading reading.vtt#line=14", { params: { rate: "34.0", limit: "20" } }),
      f("captions-reading", "needs-review", "captions-reading reading.vtt#line=18", { variant: "overlap" }),
    ],
    rules: { "captions-format": "pass", "captions-reading": "needs-review" },
  },
});

cases.push({
  id: "vtt-broken",
  about: "A captions file that does not start with WEBVTT.",
  files: { "broken.vtt": "WEBVT\n\n00:00.000 --> 00:01.000\nHello.\n" },
  input: "broken.vtt",
  expected: { kind: "vtt", findings: [f("captions-format", "fail", "captions-format broken.vtt#line=1", { params: { detail: "it does not start with WEBVTT" } })], rules: { "captions-format": "fail" } },
});

cases.push({
  id: "pdf-not-yet",
  about: "A PDF: this revision's engine does not read PDFs, so every PDF rule is not tested and the report says why.",
  files: { "tiny.pdf": "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n" },
  input: "tiny.pdf",
  expected: {
    kind: "pdf",
    findings: [],
    rules: { "pdf-tagged": "not-tested", "pdf-title-shown": "not-tested", "alt-missing": "not-tested", "page-lang": "not-tested", "page-title": "not-tested", "bookmarks": "not-tested" },
  },
});

// Write everything.
rmSync(CASES, { recursive: true, force: true });
for (const c of cases) {
  const dir = join(CASES, c.id);
  for (const [name, text] of Object.entries(c.files ?? {})) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  for (const [name, make] of Object.entries(c.build ?? {})) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), make());
  }
  writeFileSync(join(dir, "expected.json"), JSON.stringify({ id: c.id, about: c.about, input: c.input, ...c.expected }, null, 2) + "\n");
}
writeFileSync(join(HERE, "cases.json"), JSON.stringify(cases.map((c) => c.id), null, 2) + "\n");

const all = [];
const walk = (d) => {
  for (const e of readdirSync(d).sort()) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else all.push(p);
  }
};
walk(HERE);
const sums = all
  .filter((p) => !p.endsWith("SHA256SUMS.txt"))
  .map((p) => `${createHash("sha256").update(readFileSync(p)).digest("hex")}  ${relative(HERE, p).split("\\").join("/")}`)
  .join("\n");
writeFileSync(join(HERE, "SHA256SUMS.txt"), sums + "\n");
console.log(`${cases.length} cases written`);
