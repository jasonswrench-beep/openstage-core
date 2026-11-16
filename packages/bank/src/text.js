// A bank's rich text (BANK-1 section 5.2): a closed subset of HTML, with pictures and equations as placeholders. A
// bank can come from anyone, so its HTML is cleaned to the subset as it is read, and given as plain text too.

/** The tags of the subset and the attributes each may carry. */
export const ALLOWED_TAGS = {
  p: [], br: [], strong: [], em: [], u: [], s: [], sub: [], sup: [], code: [], pre: [], ul: [], ol: ["start"], li: [], blockquote: [],
  table: [], thead: [], tbody: [], tr: [], th: ["colspan", "rowspan", "scope"], td: ["colspan", "rowspan"], "oa-media": ["ref"], "oa-math": ["ref"],
};

const VOID = new Set(["br"]);
/** Content inside these is dropped with the tag, not unwrapped. */
const DROP_CONTENT = new Set(["script", "style", "head", "title", "iframe", "object", "embed", "template", "noscript", "textarea", "svg", "math"]);

const ATTRIBUTE_OK = {
  start: (v) => /^\d{1,6}$/.test(v),
  colspan: (v) => /^\d{1,3}$/.test(v),
  rowspan: (v) => /^\d{1,3}$/.test(v),
  scope: (v) => /^(row|col|rowgroup|colgroup)$/.test(v),
  ref: (v) => /^[A-Za-z0-9_-]{1,64}$/.test(v),
};

export const escapeHtml = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Character references made characters: the named ones of XML and `nbsp`, and numeric ones that name a character. */
export function decodeEntities(text) {
  return String(text).replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(NAMED, body.toLowerCase()) ? NAMED[body.toLowerCase()] : whole;
  });
}

function parseAttributes(text) {
  const out = [];
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push([m[1].toLowerCase(), decodeEntities(m[2] ?? m[3] ?? m[4] ?? "")]);
  return out;
}

/**
 * HTML cleaned to the subset: allowed tags kept with their allowed attributes (values checked and escaped), other tags
 * taken out with their content kept, the content of script, style and the like taken out, comments taken out, and any
 * `<` or `&` that does not start a tag or a reference escaped. Returns `{ html, removed }`, `removed` counting what was
 * taken out.
 */
export function cleanHtml(input) {
  const s = String(input ?? "");
  let out = "";
  let removed = 0;
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    const chunk = lt < 0 ? s.slice(i) : s.slice(i, lt);
    out += chunk.replace(/&(?!(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,8});)/g, "&amp;").replaceAll(">", "&gt;");
    if (lt < 0) break;
    if (s.startsWith("<!--", lt)) {
      const e = s.indexOf("-->", lt + 4);
      i = e < 0 ? s.length : e + 3;
      removed++;
      continue;
    }
    const m = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(s.slice(lt));
    if (!m) {
      out += "&lt;";
      i = lt + 1;
      continue;
    }
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    i = lt + m[0].length;
    if (!closing && DROP_CONTENT.has(name) && !/\/\s*$/.test(m[3])) {
      const close = new RegExp(`</${name}\\s*>`, "i").exec(s.slice(i));
      i = close ? i + close.index + close[0].length : s.length;
      removed++;
      continue;
    }
    const allowed = ALLOWED_TAGS[name];
    if (!allowed) {
      removed++;
      continue;
    }
    if (closing) {
      if (!VOID.has(name)) out += `</${name}>`;
      continue;
    }
    let tag = `<${name}`;
    for (const [k, v] of parseAttributes(m[3])) {
      if (allowed.includes(k) && ATTRIBUTE_OK[k](v)) tag += ` ${k}="${escapeHtml(v)}"`;
      else removed++;
    }
    out += `${tag}>`;
  }
  return { html: out, removed };
}

/** Plain text as the subset's HTML: paragraphs at blank lines, line breaks at single ones. */
export function plainToHtml(text) {
  return String(text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * The subset's HTML as plain text: a line for each paragraph, line break, list item, table row and block quote; table
 * cells apart by a space; a picture as "[Picture: its description]" (or "[Picture]") and an equation as
 * "[Equation: its LaTeX]", found in `pictures` and `equations` by their `ref`.
 */
export function htmlToText(html, { pictures = [], equations = [] } = {}) {
  const picture = (ref) => {
    const p = pictures.find((x) => x.id === ref);
    return p && p.alt && !p.decorative ? ` [Picture: ${p.alt}] ` : p && p.decorative ? " " : " [Picture] ";
  };
  const equation = (ref) => {
    const e = equations.find((x) => x.id === ref);
    return e && e.latex ? ` [Equation: ${e.latex}] ` : " [Equation] ";
  };
  const t = String(html ?? "")
    .replace(/<oa-media\s+ref="([^"]*)"\s*>(?:<\/oa-media>)?/gi, (_, ref) => picture(ref))
    .replace(/<oa-math\s+ref="([^"]*)"\s*>(?:<\/oa-math>)?/gi, (_, ref) => equation(ref))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|tr|blockquote|pre|ul|ol|table|thead|tbody)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(t)
    .split(/\n/)
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * A stored rich text (`{ format: "rich" | "plain", content }`) as `{ html, text }`, cleaned. `null` for a value that is
 * not one. `removed` counts what cleaning took out.
 */
export function readText(value, sidecars) {
  if (!value || typeof value !== "object" || typeof value.content !== "string") return null;
  if (value.format === "plain") {
    const html = plainToHtml(value.content);
    return { text: { html, text: htmlToText(html, sidecars) }, removed: 0 };
  }
  if (value.format !== "rich") return null;
  const { html, removed } = cleanHtml(value.content);
  return { text: { html, text: htmlToText(html, sidecars) }, removed };
}
