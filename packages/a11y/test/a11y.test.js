// @openstage/a11y: the shared contrast cases (the engine passes the same file), the catalogue, findings and their
// keys, and a project's settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applySettings, blend, blockingFindings, CATALOGUE, contrastRatio, finding, graphicContrast, hex, hides, parseColor, ratioWords, readSettings,
  rule, statusSymbol, statusWord, summarize, summaryLine, textContrast, whereKey,
} from "../src/index.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const cases = read("../../../specs/a11y/conformance/contrast.json");

test("the shared contrast cases", () => {
  for (const c of cases.ratios) {
    const r = contrastRatio(c.foreground, c.background);
    assert.ok(Math.abs(r - c.ratio) < 0.005, `${c.foreground} on ${c.background}: ${r}`);
    assert.equal(ratioWords(r), c.words);
  }
  for (const c of cases.text) {
    const t = textContrast(c.foreground, c.background, { sizePt: c.sizePt, weight: c.weight });
    assert.equal(t.status, c.status, JSON.stringify(c));
    assert.equal(t.minimum, c.minimum);
    assert.equal(t.large, c.large);
    assert.equal(t.variant, c.variant);
  }
  for (const c of cases.blend) assert.equal(blend(c.top, c.under), c.result);
});

test("the two knees give the same luminance for every 8-bit value", () => {
  for (let v = 0; v < 256; v++) {
    const s = v / 255;
    const a = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    const b = s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    assert.equal(a, b, `value ${v}`);
  }
});

test("colours as CSS writes them", () => {
  assert.deepEqual(parseColor("#fd0").rgb, [255, 221, 0]);
  assert.deepEqual(parseColor("rgb(10 20 30 / 50%)"), { rgb: [10, 20, 30], alpha: 0.5 });
  assert.deepEqual(parseColor("hsl(0, 100%, 50%)").rgb, [255, 0, 0]);
  assert.deepEqual(parseColor("RebeccaPurple").rgb, [0x66, 0x33, 0x99]);
  assert.equal(parseColor("currentcolor"), null);
  assert.equal(parseColor("#12345"), null);
  assert.equal(hex("white"), "#FFFFFF");
  assert.equal(textContrast("#949494", "#fff", { sizePx: 24 }).status, "pass");
  assert.equal(textContrast("#949494", "#fff", { sizePx: 18.66, weight: "bold" }).status, "fail", "18.66px is just under 14pt");
  assert.equal(graphicContrast("#949494", "#fff").status, "pass");
});

test("the catalogue", () => {
  assert.equal(CATALOGUE.catalogue, "A11Y-1");
  assert.deepEqual(CATALOGUE.statuses.map((s) => s.id), ["pass", "fail", "needs-review", "not-tested", "not-applicable"]);
  assert.equal(statusWord("needs-review"), "Needs review");
  assert.equal(statusSymbol("fail"), "✗");
  const ids = CATALOGUE.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of CATALOGUE.rules) {
    for (const c of r.wcag) assert.ok(CATALOGUE.criteria[c], `${r.id}: ${c}`);
    assert.ok(r.kind === "person" || r.fix, `${r.id} has a fix`);
    assert.ok(!JSON.stringify(r).includes("—"), `${r.id}: no long dashes`);
  }
  assert.equal(rule("alt-missing").wcag[0], "1.1.1");
});

test("findings and their keys", () => {
  const f = finding("contrast-graphic", "fail", { object: "mark_7" }, { foreground: "#949494", background: "#FFFFFF", ratio: "3.0" });
  assert.equal(f.key, "contrast-graphic #object=mark_7");
  assert.match(f.message, /^#949494 against #FFFFFF is 3\.0 to 1/);
  assert.equal(whereKey({ file: "a.html", id: "x", element: "html/body/p[1]", scheme: "dark" }), "a.html#id=x@dark");
  assert.equal(whereKey({ file: "docProps/core.xml" }), "docProps/core.xml");
  const v = finding("page-lang", "fail", { file: "a.html", element: "html" }, { what: "page", lang: "en_US" }, "invalid");
  assert.equal(v.message, 'The page says its language is "en_US", which is not a language tag.');
  assert.throws(() => finding("no-such-rule", "fail"));
  assert.throws(() => finding("alt-missing", "bad"));
});

test("a report from findings, and the summary line", () => {
  const findings = [finding("alt-missing", "fail", { object: "a" }), finding("alt-missing", "fail", { object: "b" }), finding("focus-order", "needs-review", { object: "c" }, { tabindex: 2 })];
  const { rules, summary } = summarize(findings, { checked: { "alt-missing": 5, "focus-order": 3, "page-title": 1 }, notTested: { "captions-missing": "no media read" } });
  const status = Object.fromEntries(rules.map((r) => [r.rule, r.status]));
  assert.equal(status["alt-missing"], "fail");
  assert.equal(status["focus-order"], "needs-review");
  assert.equal(status["page-title"], "pass");
  assert.equal(status["captions-missing"], "not-tested");
  assert.equal(status["contrast-graphic"], "not-applicable");
  assert.equal(summary.fail, 2);
  assert.equal(summaryLine({ summary: { ...summary, checklist: 1 } }, "Course"), "Course: 2 failures, 1 to review, 1 check for a person");
});

test("settings: empty by default, never blocking unless chosen", () => {
  assert.deepEqual(readSettings({}), { ignored: [], ignoredFindings: [], blockers: [] });
  assert.deepEqual(readSettings({ accessibilityChecks: { ignored: ["link-vague", 3], blockers: ["alt-missing"], later: 1 } }), { ignored: ["link-vague"], ignoredFindings: [], blockers: ["alt-missing"] });
  const a = finding("alt-missing", "fail", { object: "a" });
  const b = finding("link-vague", "needs-review", { object: "b" }, { text: "here" });
  const report = { summary: { fail: 1, needsReview: 1, ignored: 0, checklist: 0 }, findings: [a, b], blocking: [] };
  assert.deepEqual(applySettings(report, readSettings({})).blocking, []);
  const s = readSettings({ accessibilityChecks: { ignored: ["link-vague", "alt-missing"], blockers: ["alt-missing"] } });
  assert.ok(!hides(s, a), "a blocker is not hidden by its rule");
  assert.ok(hides(s, b));
  const applied = applySettings(report, s);
  assert.deepEqual(applied.findings.map((f) => f.rule), ["alt-missing"]);
  assert.deepEqual(applied.blocking, [a.key]);
  assert.equal(applied.summary.ignored, 1);
  assert.equal(applied.summary.needsReview, 0);
  assert.deepEqual(blockingFindings([a], { ...s, ignoredFindings: [a.key] }), []);
});
