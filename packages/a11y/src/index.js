// @openstage/a11y: the parts of the OpenStage accessibility rules (A11Y-1, specs/a11y/A11Y-1.md) that a tool's own
// editor needs while someone works: the rule catalogue and its words, the status words and symbols, contrast as WCAG
// 2.1 works it out, findings in the shape of a report, and a project's settings (ignored rules and findings, and the
// rules it made blockers, which are none unless the author chooses). No dependencies.
//
// Checking a finished file (a web page, an EPUB, a Word or PowerPoint file, captions) is the openstage-a11y engine's
// work (crates/openstage-a11y). Both read the same catalogue and agree on the contrast cases in
// specs/a11y/conformance/contrast.json.

import CATALOGUE from "./rules.js";

export { CATALOGUE };
export const SPEC = CATALOGUE.catalogue;
export const REVISION = CATALOGUE.revision;
export const TEXT_MIN = 4.5;
export const LARGE_TEXT_MIN = 3;
export const GRAPHIC_MIN = 3;
export const SETTINGS_MEMBER = "accessibilityChecks";

/** The rule with this id, or `undefined`. */
export const rule = (id) => CATALOGUE.rules.find((r) => r.id === id);

/** The word for a status: Pass, Fail, Needs review, Not tested, Not applicable. */
export const statusWord = (status) => CATALOGUE.statuses.find((s) => s.id === status)?.word ?? "";

/** The symbol for a status: ✓ ✗ ? ○ –. Show it with the word, never a colour alone. */
export const statusSymbol = (status) => CATALOGUE.statuses.find((s) => s.id === status)?.symbol ?? "";

/** Fills `{name}` in a template; a name with no value stays as it is. */
export function fill(template, params = {}) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (all, name) => (params[name] === undefined ? all : String(params[name])));
}

// Colours.

const NAMED = {
  aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4, azure: 0xf0ffff, beige: 0xf5f5dc, bisque: 0xffe4c4,
  black: 0x000000, blanchedalmond: 0xffebcd, blue: 0x0000ff, blueviolet: 0x8a2be2, brown: 0xa52a2a, burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0, chartreuse: 0x7fff00, chocolate: 0xd2691e, coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc,
  crimson: 0xdc143c, cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b, darkgray: 0xa9a9a9,
  darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b, darkmagenta: 0x8b008b, darkolivegreen: 0x556b2f, darkorange: 0xff8c00,
  darkorchid: 0x9932cc, darkred: 0x8b0000, darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f, darkslateblue: 0x483d8b, darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1, darkviolet: 0x9400d3, deeppink: 0xff1493, deepskyblue: 0x00bfff, dimgray: 0x696969,
  dimgrey: 0x696969, dodgerblue: 0x1e90ff, firebrick: 0xb22222, floralwhite: 0xfffaf0, forestgreen: 0x228b22, fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc, ghostwhite: 0xf8f8ff, gold: 0xffd700, goldenrod: 0xdaa520, gray: 0x808080, green: 0x008000, greenyellow: 0xadff2f,
  grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4, indianred: 0xcd5c5c, indigo: 0x4b0082, ivory: 0xfffff0, khaki: 0xf0e68c,
  lavender: 0xe6e6fa, lavenderblush: 0xfff0f5, lawngreen: 0x7cfc00, lemonchiffon: 0xfffacd, lightblue: 0xadd8e6, lightcoral: 0xf08080,
  lightcyan: 0xe0ffff, lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3, lightgreen: 0x90ee90, lightgrey: 0xd3d3d3, lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a, lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa, lightslategray: 0x778899, lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0, lime: 0x00ff00, limegreen: 0x32cd32, linen: 0xfaf0e6, magenta: 0xff00ff,
  maroon: 0x800000, mediumaquamarine: 0x66cdaa, mediumblue: 0x0000cd, mediumorchid: 0xba55d3, mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371, mediumslateblue: 0x7b68ee, mediumspringgreen: 0x00fa9a, mediumturquoise: 0x48d1cc, mediumvioletred: 0xc71585,
  midnightblue: 0x191970, mintcream: 0xf5fffa, mistyrose: 0xffe4e1, moccasin: 0xffe4b5, navajowhite: 0xffdead, navy: 0x000080,
  oldlace: 0xfdf5e6, olive: 0x808000, olivedrab: 0x6b8e23, orange: 0xffa500, orangered: 0xff4500, orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa, palegreen: 0x98fb98, paleturquoise: 0xafeeee, palevioletred: 0xdb7093, papayawhip: 0xffefd5,
  peachpuff: 0xffdab9, peru: 0xcd853f, pink: 0xffc0cb, plum: 0xdda0dd, powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399,
  red: 0xff0000, rosybrown: 0xbc8f8f, royalblue: 0x4169e1, saddlebrown: 0x8b4513, salmon: 0xfa8072, sandybrown: 0xf4a460,
  seagreen: 0x2e8b57, seashell: 0xfff5ee, sienna: 0xa0522d, silver: 0xc0c0c0, skyblue: 0x87ceeb, slateblue: 0x6a5acd,
  slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa, springgreen: 0x00ff7f, steelblue: 0x4682b4, tan: 0xd2b48c, teal: 0x008080,
  thistle: 0xd8bfd8, tomato: 0xff6347, turquoise: 0x40e0d0, violet: 0xee82ee, wheat: 0xf5deb3, white: 0xffffff, whitesmoke: 0xf5f5f5,
  yellow: 0xffff00, yellowgreen: 0x9acd32,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * A colour as CSS writes it (#rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(), a named colour,
 * `transparent`), as `{ rgb: [r, g, b], alpha }`, or `null`.
 */
export function parseColor(text) {
  if (Array.isArray(text) && text.length === 3) return { rgb: text.map((v) => clamp(Math.round(v), 0, 255)), alpha: 1 };
  if (typeof text !== "string") return null;
  const t = text.trim().toLowerCase();
  if (t.startsWith("#")) {
    const h = t.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    const d = (i) => parseInt(h[i] + h[i], 16);
    const p = (i) => parseInt(h.slice(i, i + 2), 16);
    if (h.length === 3) return { rgb: [d(0), d(1), d(2)], alpha: 1 };
    if (h.length === 4) return { rgb: [d(0), d(1), d(2)], alpha: d(3) / 255 };
    if (h.length === 6) return { rgb: [p(0), p(2), p(4)], alpha: 1 };
    if (h.length === 8) return { rgb: [p(0), p(2), p(4)], alpha: p(6) / 255 };
    return null;
  }
  if (t === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  const fn = /^(rgba?|hsla?)\s*\((.*)\)$/.exec(t);
  if (fn) {
    let [main, alphaText] = fn[2].split("/");
    let parts = main.includes(",") ? main.split(",").map((s) => s.trim()).filter(Boolean) : main.trim().split(/\s+/);
    if (alphaText === undefined && parts.length === 4) alphaText = parts.pop();
    if (parts.length !== 3) return null;
    let alpha = 1;
    if (alphaText !== undefined) {
      const a = alphaText.trim();
      alpha = a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
      if (!Number.isFinite(alpha)) return null;
    }
    alpha = clamp(alpha, 0, 1);
    if (fn[1].startsWith("rgb")) {
      const rgb = parts.map((s) => (s.endsWith("%") ? parseFloat(s) * 2.55 : parseFloat(s)));
      if (rgb.some((v) => !Number.isFinite(v))) return null;
      return { rgb: rgb.map((v) => clamp(Math.round(v), 0, 255)), alpha };
    }
    const h = parseFloat(parts[0]);
    const s = clamp(parseFloat(parts[1]) / 100, 0, 1);
    const l = clamp(parseFloat(parts[2]) / 100, 0, 1);
    if (![h, s, l].every(Number.isFinite)) return null;
    return { rgb: hslToRgb(h, s, l), alpha };
  }
  if (Object.hasOwn(NAMED, t)) {
    const v = NAMED[t];
    return { rgb: [(v >> 16) & 255, (v >> 8) & 255, v & 255], alpha: 1 };
  }
  return null;
}

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return clamp(Math.round(v * 255), 0, 255);
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

const rgbOf = (c) => {
  const p = parseColor(c);
  if (!p) throw new TypeError(`not a colour: ${c}`);
  return p.rgb;
};

/** `#RRGGBB` in capitals. */
export const hex = (c) => `#${rgbOf(c).map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("")}`;

/** Relative luminance, 0 (black) to 1 (white); the 0.04045 knee (the same as 0.03928 for every 8-bit value). */
export function luminance(c) {
  const [r, g, b] = rgbOf(c).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two colours, 1 to 21, unrounded. */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A colour (with its alpha) laid over another; each channel rounded to the nearest whole value. Returns `#RRGGBB`. */
export function blend(top, under) {
  const t = parseColor(top);
  if (!t) throw new TypeError(`not a colour: ${top}`);
  const u = rgbOf(under);
  const a = clamp(t.alpha, 0, 1);
  return hex(t.rgb.map((v, i) => clamp(Math.round(a * v + (1 - a) * u[i]), 0, 255)));
}

/** Large text: at least 18 points, or 14 points and bold. A CSS pixel is 0.75 points. */
export const isLarge = (sizePt, bold) => sizePt >= 18 || (bold && sizePt >= 14);

/**
 * The contrast of text. `size` is `{ sizePt }` or `{ sizePx }`; `weight` is "bold" (700 or more), "normal" or
 * "unknown" (counts as normal, except that 14 to 18 point text between 3 and 4.5 to 1 needs review).
 * Returns `{ ratio, minimum, large, status, variant? }`.
 */
export function textContrast(foreground, background, { sizePt, sizePx, weight = "normal" } = {}) {
  const pt = sizePt ?? (sizePx !== undefined ? sizePx * 0.75 : 12);
  const ratio = contrastRatio(foreground, background);
  if (weight === "unknown" && pt >= 14 && pt < 18 && ratio >= LARGE_TEXT_MIN && ratio < TEXT_MIN) {
    return { ratio, minimum: TEXT_MIN, large: false, status: "needs-review", variant: "uncertain-bold" };
  }
  const large = isLarge(pt, weight === "bold");
  const minimum = large ? LARGE_TEXT_MIN : TEXT_MIN;
  return { ratio, minimum, large, status: ratio >= minimum ? "pass" : "fail" };
}

/** The contrast of a mark or a control's edge against what is behind it (1.4.11), 3 to 1. */
export function graphicContrast(foreground, background) {
  const ratio = contrastRatio(foreground, background);
  return { ratio, minimum: GRAPHIC_MIN, status: ratio >= GRAPHIC_MIN ? "pass" : "fail" };
}

/** A ratio in words, rounded down to one decimal place ("4.4", never "4.5" for 4.49). */
export const ratioWords = (r) => (Math.floor(r * 10 + 1e-9) / 10).toFixed(1);

/** A minimum in words: "4.5", "3". */
export const minimumWords = (m) => String(m);

// Findings.

/** The location part of a finding's key (A11Y-1 section 4.2). */
export function whereKey(where = {}) {
  let k = where.file ?? "";
  const place =
    where.id !== undefined ? `id=${where.id}`
    : where.element !== undefined ? where.element
    : where.page !== undefined ? `page=${where.page}`
    : where.slide !== undefined ? `slide=${where.slide}`
    : where.object !== undefined ? `object=${where.object}`
    : where.line !== undefined ? `line=${where.line}`
    : null;
  if (place !== null) k += `#${place}`;
  if (where.scheme) k += `@${where.scheme}`;
  return k;
}

/**
 * A finding of a rule, its words filled from the catalogue: `{ rule, status, wcag, basis, variant?, where, key,
 * message, fix, params, count }`. For a tool's checks of its own project (where: `{ object }` with its own id).
 */
export function finding(ruleId, status, where = {}, params = {}, variant) {
  const r = rule(ruleId);
  if (!r) throw new RangeError(`no rule ${ruleId} in the catalogue`);
  if (!CATALOGUE.statuses.some((s) => s.id === status)) throw new RangeError(`no status ${status}`);
  const strings = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const template = (variant && r.variants?.[variant]) || r.message;
  const out = { rule: r.id, status, wcag: [...r.wcag], basis: r.basis };
  if (variant) out.variant = variant;
  Object.assign(out, { where: { ...where }, key: `${r.id} ${whereKey(where)}`, message: fill(template, strings), fix: r.fix ? fill(r.fix, strings) : "", params: strings, count: 1 });
  return out;
}

/** The rule results and summary of a report made from findings (A11Y-1 section 4.3), for the rules of `format`. */
export function summarize(findings, { format = "source", checked = {}, notTested = {} } = {}) {
  const rules = [];
  const summary = { fail: 0, needsReview: 0, rulesFailed: 0, rulesNeedReview: 0, rulesPassed: 0, rulesNotTested: 0, rulesNotApplicable: 0, checklist: 0, ignored: 0 };
  for (const r of CATALOGUE.rules.filter((x) => x.kind === "machine" && x.checks.includes(format))) {
    const mine = findings.filter((f) => f.rule === r.id);
    const fail = mine.filter((f) => f.status === "fail").reduce((s, f) => s + (f.count ?? 1), 0);
    const review = mine.filter((f) => f.status === "needs-review").reduce((s, f) => s + (f.count ?? 1), 0);
    const n = checked[r.id] ?? 0;
    const status = fail ? "fail" : review ? "needs-review" : notTested[r.id] ? "not-tested" : n > 0 ? "pass" : "not-applicable";
    const key = { fail: "rulesFailed", "needs-review": "rulesNeedReview", pass: "rulesPassed", "not-tested": "rulesNotTested", "not-applicable": "rulesNotApplicable" }[status];
    summary[key]++;
    summary.fail += fail;
    summary.needsReview += review;
    const row = { rule: r.id, title: r.title, status, wcag: [...r.wcag], basis: r.basis, checked: n, fail, needsReview: review };
    if (status === "not-tested") row.reason = notTested[r.id];
    rules.push(row);
  }
  return { rules, summary };
}

/** One line for an export's report: "Web page: 0 failures, 2 to review, 3 checks for a person". */
export function summaryLine(report, label) {
  const s = report.summary;
  const fails = s.fail === 1 ? "1 failure" : `${s.fail} failures`;
  const person = s.checklist === 1 ? "1 check for a person" : `${s.checklist} checks for a person`;
  return `${label}: ${fails}, ${s.needsReview} to review, ${person}`;
}

// Settings.

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

/** A project's settings from its JSON (`accessibilityChecks`): `{ ignored, ignoredFindings, blockers }`, all empty when missing. */
export function readSettings(project) {
  const s = project && typeof project === "object" ? project[SETTINGS_MEMBER] : undefined;
  if (!s || typeof s !== "object") return { ignored: [], ignoredFindings: [], blockers: [] };
  return { ignored: strings(s.ignored), ignoredFindings: strings(s.ignoredFindings), blockers: strings(s.blockers) };
}

/** Whether a finding is left out: its key is ignored, or its rule is ignored and is not a blocker. */
export function hides(settings, f) {
  return settings.ignoredFindings.includes(f.key) || (!settings.blockers.includes(f.rule) && settings.ignored.includes(f.rule));
}

/** The findings that stop publishing: they fail, and their rule is one the project made a blocker. */
export const blockingFindings = (findings, settings) => findings.filter((f) => f.status === "fail" && settings.blockers.includes(f.rule) && !settings.ignoredFindings.includes(f.key));

/** A report with the project's settings applied: ignored findings left out and counted, and `blocking` listed. */
export function applySettings(report, settings) {
  const kept = [];
  const summary = { ...report.summary };
  for (const f of report.findings) {
    if (hides(settings, f)) {
      summary.ignored += f.count ?? 1;
      if (f.status === "fail") summary.fail -= f.count ?? 1;
      if (f.status === "needs-review") summary.needsReview -= f.count ?? 1;
    } else kept.push(f);
  }
  return { ...report, summary, findings: kept, blocking: blockingFindings(kept, settings).map((f) => f.key) };
}
