//! Enough CSS to work out the colours, sizes and weights of text: style sheets and `style` attributes, selectors of
//! names, ids, classes, attributes and the common pseudo-classes joined by descendant and child combinators, the
//! cascade and inheritance, custom properties, and the light and dark colour schemes. Anything else is left out and
//! said so in the report's limits.

use crate::contrast::{blend, parse_css_color, Rgb, Rgba};
use crate::dom::Dom;
use std::collections::BTreeMap;
use std::rc::Rc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scheme {
    Any,
    Light,
    Dark,
}

#[derive(Debug, Clone)]
pub struct Decl {
    pub prop: String,
    pub value: String,
    pub important: bool,
}

#[derive(Debug, Clone)]
pub struct CssRule {
    pub selector: Selector,
    pub decls: Vec<Decl>,
    pub scheme: Scheme,
    pub order: usize,
    pub line: u32,
    pub file: String,
}

#[derive(Debug, Clone, Default)]
pub struct Sheet {
    pub rules: Vec<CssRule>,
    /// Things in the style sheets that were not followed, in plain words.
    pub notes: Vec<String>,
    /// Whether any rule applies only in the dark scheme, or the page says it supports a dark scheme.
    pub has_dark: bool,
    pub root_scheme_dark: bool,
}

impl Sheet {
    fn note(&mut self, s: &str) {
        if !self.notes.iter().any(|n| n == s) {
            self.notes.push(s.to_string());
        }
    }

    /// Adds a style sheet's rules.
    pub fn add(&mut self, text: &str, file: &str, first_line: u32) {
        let clean = strip_comments(text);
        self.parse_block(&clean, file, first_line, Scheme::Any);
    }

    fn parse_block(&mut self, text: &str, file: &str, first_line: u32, scheme: Scheme) {
        let b = text.as_bytes();
        let mut p = 0usize;
        while p < b.len() {
            while p < b.len() && (b[p].is_ascii_whitespace() || b[p] == b';') {
                p += 1;
            }
            if p >= b.len() {
                break;
            }
            let line = first_line + text[..p].matches('\n').count() as u32;
            let brace = find_top(text, p, b'{');
            let semi = find_top(text, p, b';');
            if b[p] == b'@' && semi.is_some() && brace.map_or(true, |br| semi.unwrap() < br) {
                let stmt = text[p..semi.unwrap()].trim().to_ascii_lowercase();
                if stmt.starts_with("@import") {
                    self.note("Style sheets brought in with @import were not read.");
                }
                p = semi.unwrap() + 1;
                continue;
            }
            let Some(open) = brace else { break };
            let close = matching_brace(text, open).unwrap_or(b.len());
            let prelude = text[p..open].trim();
            let body = &text[open + 1..close.min(b.len())];
            if let Some(at) = prelude.strip_prefix('@') {
                let lower = at.to_ascii_lowercase();
                if lower.starts_with("media") {
                    match media_scheme(&lower[5..]) {
                        Some(s) => {
                            let s = if s == Scheme::Any { scheme } else { s };
                            if s == Scheme::Dark {
                                self.has_dark = true;
                            }
                            self.parse_block(body, file, line, s);
                        }
                        None => {
                            // Print styles and the modes a person turns on (forced colours, more contrast) are not
                            // how the page looks by default, so leaving them out is not a limit worth saying.
                            let other_mode = ["print", "forced-colors", "prefers-contrast", "inverted-colors", "prefers-reduced-transparency", "speech"].iter().any(|m| lower.contains(m));
                            if !other_mode {
                                self.note(&format!("Rules inside @media {} were not followed.", lower[5..].trim()));
                            }
                        }
                    }
                } else if lower.starts_with("supports") || lower.starts_with("layer") || lower.starts_with("container") || lower.starts_with("scope") {
                    self.parse_block(body, file, line, scheme);
                }
            } else {
                let decls = parse_decls(body);
                for sel_text in split_top(prelude, b',') {
                    let selector = parse_selector(sel_text.trim());
                    if !selector.supported && decls.iter().any(|d| COLOUR_PROPS.contains(&d.prop.as_str())) {
                        self.note("Some style rules use selectors this check does not follow, so a colour they set may be missed.");
                    }
                    if selector.steps.len() == 1 && selector.steps[0].comp.root || selector.text.eq_ignore_ascii_case("html") {
                        if decls.iter().any(|d| d.prop == "color-scheme" && d.value.to_ascii_lowercase().contains("dark")) {
                            self.root_scheme_dark = true;
                            self.has_dark = true;
                        }
                    }
                    let order = self.rules.len();
                    self.rules.push(CssRule { selector, decls: decls.clone(), scheme, order, line, file: file.to_string() });
                }
            }
            p = close + 1;
        }
    }
}

const COLOUR_PROPS: &[&str] = &["color", "background", "background-color", "background-image"];

fn media_scheme(prelude: &str) -> Option<Scheme> {
    let p: String = prelude.chars().filter(|c| !c.is_whitespace()).collect();
    if p.contains("prefers-color-scheme:dark") {
        return Some(Scheme::Dark);
    }
    if p.contains("prefers-color-scheme:light") {
        return Some(Scheme::Light);
    }
    if p.is_empty() || p == "screen" || p == "all" || p == "onlyscreen" {
        return Some(Scheme::Any);
    }
    if p.contains("prefers-reduced-motion") {
        return Some(Scheme::Any);
    }
    None
}

pub fn strip_comments(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find("/*") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 2..];
        match after.find("*/") {
            Some(e) => {
                out.extend(after[..e].chars().filter(|&c| c == '\n'));
                rest = &after[e + 2..];
            }
            None => {
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// The next `ch` at brace depth 0 and outside strings, from `from`.
fn find_top(s: &str, from: usize, ch: u8) -> Option<usize> {
    let b = s.as_bytes();
    let (mut depth, mut paren, mut quote) = (0i32, 0i32, 0u8);
    for (i, &c) in b.iter().enumerate().skip(from) {
        if quote != 0 {
            if c == quote {
                quote = 0;
            }
            continue;
        }
        match c {
            b'"' | b'\'' => quote = c,
            b'(' => paren += 1,
            b')' => paren -= 1,
            _ if c == ch && depth == 0 && paren <= 0 => return Some(i),
            b'{' => depth += 1,
            b'}' => depth -= 1,
            _ => {}
        }
    }
    None
}

fn matching_brace(s: &str, open: usize) -> Option<usize> {
    let b = s.as_bytes();
    let (mut depth, mut quote) = (0i32, 0u8);
    for (i, &c) in b.iter().enumerate().skip(open) {
        if quote != 0 {
            if c == quote {
                quote = 0;
            }
            continue;
        }
        match c {
            b'"' | b'\'' => quote = c,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Splits at `ch` outside brackets, parentheses and strings.
fn split_top(s: &str, ch: u8) -> Vec<&str> {
    let b = s.as_bytes();
    let (mut depth, mut quote, mut start) = (0i32, 0u8, 0usize);
    let mut out = Vec::new();
    for (i, &c) in b.iter().enumerate() {
        if quote != 0 {
            if c == quote {
                quote = 0;
            }
            continue;
        }
        match c {
            b'"' | b'\'' => quote = c,
            b'(' | b'[' => depth += 1,
            b')' | b']' => depth -= 1,
            _ if c == ch && depth == 0 => {
                out.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    out.push(&s[start..]);
    out
}

/// Declarations, as in a rule's body or a `style` attribute.
pub fn parse_decls(body: &str) -> Vec<Decl> {
    let mut out = Vec::new();
    for part in split_top(body, b';') {
        let Some((prop, value)) = part.split_once(':') else { continue };
        let prop = prop.trim();
        let prop = if prop.starts_with("--") { prop.to_string() } else { prop.to_ascii_lowercase() };
        if prop.is_empty() || prop.contains('{') || prop.contains('}') {
            continue;
        }
        let mut value = value.trim().to_string();
        let mut important = false;
        if let Some(i) = value.to_ascii_lowercase().rfind("!important") {
            important = true;
            value.truncate(i);
            value = value.trim().to_string();
        }
        out.push(Decl { prop, value, important });
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Comb {
    First,
    Descendant,
    Child,
}

#[derive(Debug, Clone, Default)]
pub struct Compound {
    tag: Option<String>,
    id: Option<String>,
    classes: Vec<String>,
    attrs: Vec<(String, String, String)>,
    pub root: bool,
    first_child: bool,
    last_child: bool,
    link: bool,
    not: Vec<Compound>,
    any: Vec<Vec<Compound>>,
}

#[derive(Debug, Clone)]
struct Step {
    comb: Comb,
    comp: Compound,
}

#[derive(Debug, Clone)]
pub struct Selector {
    pub text: String,
    steps: Vec<Step>,
    pub specificity: (u32, u32, u32),
    /// Pseudo-classes of a state (`hover`, `focus`, ...): such a rule is not part of how the page looks at rest.
    pub states: Vec<String>,
    pub supported: bool,
}

impl Selector {
    pub fn has_state(&self, names: &[&str]) -> bool {
        self.states.iter().any(|s| names.contains(&s.as_str()))
    }
}

const STATES: &[&str] = &[
    "hover", "focus", "focus-visible", "focus-within", "active", "visited", "target", "checked", "disabled", "placeholder-shown",
    "invalid", "valid", "user-invalid", "required", "optional", "read-only", "read-write", "indeterminate", "default", "open", "modal",
    "popover-open", "fullscreen", "autofill", "playing", "paused",
];

fn ident_end(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'-' || b[i] == b'_' || b[i] >= 0x80 || b[i] == b'\\') {
        if b[i] == b'\\' {
            i += 1;
        }
        i += 1;
    }
    i.min(b.len())
}

fn unescape(s: &str) -> String {
    s.replace('\\', "")
}

pub fn parse_selector(text: &str) -> Selector {
    let mut sel = Selector { text: text.to_string(), steps: Vec::new(), specificity: (0, 0, 0), states: Vec::new(), supported: true };
    let b = text.as_bytes();
    let mut i = 0usize;
    let mut comb = Comb::First;
    while i < b.len() {
        let ws = i;
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= b.len() {
            break;
        }
        match b[i] {
            b'>' => {
                comb = Comb::Child;
                i += 1;
                continue;
            }
            b'+' | b'~' => {
                sel.supported = false;
                return sel;
            }
            _ => {}
        }
        if i > ws && comb == Comb::First && !sel.steps.is_empty() {
            comb = Comb::Descendant;
        }
        let (comp, next, ok) = parse_compound(text, i, &mut sel.specificity, &mut sel.states);
        if !ok || next == i {
            sel.supported = false;
            return sel;
        }
        let c = if sel.steps.is_empty() { Comb::First } else if comb == Comb::First { Comb::Descendant } else { comb };
        sel.steps.push(Step { comb: c, comp });
        comb = Comb::First;
        i = next;
    }
    if sel.steps.is_empty() {
        sel.supported = false;
    }
    sel
}

fn parse_compound(text: &str, mut i: usize, spec: &mut (u32, u32, u32), states: &mut Vec<String>) -> (Compound, usize, bool) {
    let b = text.as_bytes();
    let mut c = Compound::default();
    let start = i;
    while i < b.len() && !b[i].is_ascii_whitespace() && b[i] != b'>' && b[i] != b'+' && b[i] != b'~' && b[i] != b',' && b[i] != b')' {
        match b[i] {
            b'*' => i += 1,
            b'#' => {
                let e = ident_end(b, i + 1);
                c.id = Some(unescape(&text[i + 1..e]));
                spec.0 += 1;
                i = e;
            }
            b'.' => {
                let e = ident_end(b, i + 1);
                c.classes.push(unescape(&text[i + 1..e]));
                spec.1 += 1;
                i = e;
            }
            b'[' => {
                let Some(close) = text[i..].find(']').map(|e| i + e) else { return (c, i, false) };
                let inner = &text[i + 1..close];
                let ops = ["~=", "|=", "^=", "$=", "*=", "="];
                let mut found = None;
                for op in ops {
                    if let Some(k) = inner.find(op) {
                        found = Some((k, op));
                        break;
                    }
                }
                let (name, op, value) = match found {
                    Some((k, op)) => {
                        let raw = inner[k + op.len()..].trim();
                        // A quoted value, or the first word of an unquoted one (a case flag such as ` i` may follow).
                        let v = match raw.chars().next() {
                            Some(q @ ('"' | '\'')) => raw[1..].split(q).next().unwrap_or("").to_string(),
                            _ => raw.split_whitespace().next().unwrap_or("").to_string(),
                        };
                        (inner[..k].trim().to_ascii_lowercase(), op.to_string(), v)
                    }
                    None => (inner.trim().to_ascii_lowercase(), String::new(), String::new()),
                };
                c.attrs.push((name, op, value));
                spec.1 += 1;
                i = close + 1;
            }
            b':' => {
                if i + 1 < b.len() && b[i + 1] == b':' {
                    return (c, i, false);
                }
                let e = ident_end(b, i + 1);
                let name = text[i + 1..e].to_ascii_lowercase();
                let mut args = None;
                let mut next = e;
                if e < b.len() && b[e] == b'(' {
                    let mut depth = 0;
                    let mut j = e;
                    while j < b.len() {
                        if b[j] == b'(' {
                            depth += 1;
                        } else if b[j] == b')' {
                            depth -= 1;
                            if depth == 0 {
                                break;
                            }
                        }
                        j += 1;
                    }
                    args = Some(text[e + 1..j.min(b.len())].to_string());
                    next = (j + 1).min(b.len());
                }
                match (name.as_str(), &args) {
                    ("root", None) => {
                        c.root = true;
                        spec.1 += 1;
                    }
                    ("link" | "any-link", None) => {
                        c.link = true;
                        spec.1 += 1;
                    }
                    ("first-child", None) => {
                        c.first_child = true;
                        spec.1 += 1;
                    }
                    ("last-child", None) => {
                        c.last_child = true;
                        spec.1 += 1;
                    }
                    ("only-child", None) => {
                        c.first_child = true;
                        c.last_child = true;
                        spec.1 += 1;
                    }
                    ("enabled", None) => spec.1 += 1,
                    ("not" | "is" | "where" | "matches", Some(a)) => {
                        let mut best = (0, 0, 0);
                        let mut list = Vec::new();
                        for part in split_top(a, b',') {
                            let mut s = (0, 0, 0);
                            let (inner, end, ok) = parse_compound(part.trim(), 0, &mut s, states);
                            if !ok || end < part.trim().len() {
                                return (c, i, false);
                            }
                            if s > best {
                                best = s;
                            }
                            list.push(inner);
                        }
                        if name != "where" {
                            spec.0 += best.0;
                            spec.1 += best.1;
                            spec.2 += best.2;
                        }
                        if name == "not" {
                            c.not.extend(list);
                        } else {
                            c.any.push(list);
                        }
                    }
                    (n, None) if STATES.contains(&n) => {
                        states.push(n.to_string());
                        spec.1 += 1;
                    }
                    _ => return (c, i, false),
                }
                i = next;
            }
            ch if ch.is_ascii_alphabetic() || ch == b'_' || ch == b'-' || ch == b'\\' => {
                let e = ident_end(b, i);
                let mut name = unescape(&text[i..e]).to_ascii_lowercase();
                if e < b.len() && b[e] == b'|' {
                    let e2 = ident_end(b, e + 1);
                    name = unescape(&text[e + 1..e2]).to_ascii_lowercase();
                    i = e2;
                } else {
                    i = e;
                }
                c.tag = Some(name);
                spec.2 += 1;
            }
            _ => return (c, i, false),
        }
    }
    (c, i, i > start)
}

fn compound_matches(dom: &Dom, n: usize, c: &Compound) -> bool {
    let Some(name) = dom.name(n) else { return false };
    if let Some(t) = &c.tag {
        if t != name && dom.local(n) != Some(t.as_str()) {
            return false;
        }
    }
    if let Some(id) = &c.id {
        if dom.attr(n, "id") != Some(id.as_str()) {
            return false;
        }
    }
    if !c.classes.is_empty() {
        let cls = dom.attr(n, "class").unwrap_or("");
        if !c.classes.iter().all(|k| cls.split_whitespace().any(|x| x == k)) {
            return false;
        }
    }
    for (an, op, v) in &c.attrs {
        let Some(have) = dom.attr(n, an) else { return false };
        let ok = match op.as_str() {
            "" => true,
            "=" => have == v,
            "~=" => have.split_whitespace().any(|x| x == v),
            "|=" => have == v || have.starts_with(&format!("{v}-")),
            "^=" => !v.is_empty() && have.starts_with(v.as_str()),
            "$=" => !v.is_empty() && have.ends_with(v.as_str()),
            "*=" => !v.is_empty() && have.contains(v.as_str()),
            _ => false,
        };
        if !ok {
            return false;
        }
    }
    if c.root {
        let p = dom.parent(n).unwrap_or(0);
        if dom.name(p).is_some() {
            return false;
        }
    }
    if c.link && !((name == "a" || name == "area") && dom.has_attr(n, "href")) {
        return false;
    }
    if c.first_child || c.last_child {
        let p = dom.parent(n).unwrap_or(0);
        let kids: Vec<usize> = dom.element_children(p).collect();
        if c.first_child && kids.first() != Some(&n) {
            return false;
        }
        if c.last_child && kids.last() != Some(&n) {
            return false;
        }
    }
    if c.not.iter().any(|x| compound_matches(dom, n, x)) {
        return false;
    }
    for list in &c.any {
        if !list.iter().any(|x| compound_matches(dom, n, x)) {
            return false;
        }
    }
    true
}

fn matches_at(dom: &Dom, n: usize, steps: &[Step], idx: usize) -> bool {
    if !compound_matches(dom, n, &steps[idx].comp) {
        return false;
    }
    if idx == 0 {
        return true;
    }
    match steps[idx].comb {
        Comb::Child | Comb::First => dom.parent(n).filter(|&p| dom.name(p).is_some()).map_or(false, |p| matches_at(dom, p, steps, idx - 1)),
        Comb::Descendant => dom.ancestors(n).filter(|&a| dom.name(a).is_some()).any(|a| matches_at(dom, a, steps, idx - 1)),
    }
}

/// Whether the selector matches the element (state pseudo-classes are ignored here; see `Selector::states`).
pub fn matches(dom: &Dom, n: usize, s: &Selector) -> bool {
    s.supported && !s.steps.is_empty() && matches_at(dom, n, &s.steps, s.steps.len() - 1)
}

/// What is behind an element's text.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Backdrop {
    Known(Rgb),
    /// A picture or a gradient, which cannot be measured.
    Unknown,
}

/// The style of an element that the checks need.
#[derive(Debug, Clone)]
pub struct Style {
    pub color: Rgba,
    pub backdrop: Backdrop,
    pub font_px: f64,
    pub weight: u32,
    /// Not shown: `display: none` here or above, `visibility: hidden`, or hidden for the eye but kept for screen
    /// readers (a "visually hidden" pattern).
    pub hidden: bool,
    pub visually_hidden: bool,
    pub opacity: f64,
    /// Whether the page's own styles set this element's text colour or background (not only the browser's).
    pub author_colour: bool,
    vars: Rc<BTreeMap<String, String>>,
    visibility_hidden: bool,
    display_hidden: bool,
}

/// Works out the style of every element, for one colour scheme.
pub fn compute(dom: &Dom, sheet: &Sheet, dark: bool) -> Vec<Option<Style>> {
    let canvas: Rgb = if dark && sheet.root_scheme_dark { [0x12, 0x12, 0x12] } else { [255, 255, 255] };
    let text: Rgb = if dark && sheet.root_scheme_dark { [255, 255, 255] } else { [0, 0, 0] };
    let link: Rgb = if dark && sheet.root_scheme_dark { [0x9E, 0x9E, 0xFF] } else { [0, 0, 0xEE] };
    let mut out: Vec<Option<Style>> = vec![None; dom.nodes.len()];
    let rules: Vec<&CssRule> = sheet
        .rules
        .iter()
        .filter(|r| r.selector.supported && r.selector.states.is_empty())
        .filter(|r| match r.scheme {
            Scheme::Any => true,
            Scheme::Dark => dark,
            Scheme::Light => !dark,
        })
        .collect();
    let root_style = Style {
        color: Rgba { rgb: text, alpha: 1.0 },
        backdrop: Backdrop::Known(canvas),
        font_px: 16.0,
        weight: 400,
        hidden: false,
        visually_hidden: false,
        opacity: 1.0,
        author_colour: false,
        vars: Rc::new(BTreeMap::new()),
        visibility_hidden: false,
        display_hidden: false,
    };
    let mut root_font = 16.0;
    for n in dom.elements() {
        let parent = dom.parent(n).and_then(|p| out[p].clone()).unwrap_or_else(|| root_style.clone());
        let name = dom.name(n).unwrap_or("");
        // Declarations by priority: the browser's, presentational attributes, then the page's.
        let mut declared: Vec<((u8, (u32, u32, u32), usize), Decl, bool)> = Vec::new();
        for d in ua_decls(dom, n, name, link, dark && sheet.root_scheme_dark) {
            declared.push(((0, (0, 0, 0), 0), d, false));
        }
        if let Some(bg) = dom.attr(n, "bgcolor") {
            declared.push(((1, (0, 0, 0), 0), Decl { prop: "background-color".into(), value: bg.into(), important: false }, true));
        }
        if name == "font" {
            if let Some(c) = dom.attr(n, "color") {
                declared.push(((1, (0, 0, 0), 0), Decl { prop: "color".into(), value: c.into(), important: false }, true));
            }
        }
        for r in &rules {
            if matches(dom, n, &r.selector) {
                for d in &r.decls {
                    let level = if d.important { 4 } else { 2 };
                    declared.push(((level, r.selector.specificity, r.order), d.clone(), true));
                }
            }
        }
        if let Some(st) = dom.attr(n, "style") {
            for d in parse_decls(st) {
                let level = if d.important { 5 } else { 3 };
                declared.push(((level, (0, 0, 0), 0), d, true));
            }
        }
        declared.sort_by(|a, b| a.0.cmp(&b.0));
        let mut props: BTreeMap<String, (String, bool)> = BTreeMap::new();
        let mut vars = (*parent.vars).clone();
        let mut vars_changed = false;
        for (_, d, author) in declared {
            if d.prop.starts_with("--") {
                vars.insert(d.prop.clone(), d.value.clone());
                vars_changed = true;
            } else if d.prop == "background" {
                props.insert("background-color".into(), (background_colour(&d.value), author));
                props.insert("background-image".into(), (if has_image(&d.value) { "image".into() } else { "none".into() }, author));
            } else if d.prop == "font" {
                for (k, v) in font_shorthand(&d.value) {
                    props.insert(k, (v, author));
                }
            } else {
                props.insert(d.prop.clone(), (d.value.clone(), author));
            }
        }
        let vars = if vars_changed { Rc::new(vars) } else { parent.vars.clone() };
        let get = |k: &str| props.get(k).map(|(v, _)| resolve_vars(v, &vars, 0)).map(|v| v.trim().to_ascii_lowercase());
        let author_colour = props.get("color").map_or(false, |p| p.1) || props.get("background-color").map_or(false, |p| p.1);

        let color = match get("color").as_deref() {
            None | Some("inherit") | Some("unset") => parent.color,
            Some("initial") => Rgba { rgb: text, alpha: 1.0 },
            Some("currentcolor") => parent.color,
            Some(v) => parse_css_color(v).unwrap_or(parent.color),
        };
        let font_px = match get("font-size") {
            Some(v) => font_size(&v, parent.font_px, root_font).unwrap_or(parent.font_px),
            None => parent.font_px,
        };
        if name == "html" {
            root_font = font_px;
        }
        let weight = match get("font-weight").as_deref() {
            None | Some("inherit") => parent.weight,
            Some("bold") => 700,
            Some("bolder") => (parent.weight + 300).min(900).max(700),
            Some("normal") | Some("initial") => 400,
            Some("lighter") => if parent.weight > 500 { 400 } else { 100 },
            Some(v) => v.parse::<u32>().unwrap_or(parent.weight),
        };
        let display_none = get("display").as_deref() == Some("none");
        let visibility_hidden = match get("visibility").as_deref() {
            Some("hidden") | Some("collapse") => true,
            Some("visible") => false,
            _ => parent.visibility_hidden,
        };
        let opacity = get("opacity").and_then(|v| v.trim_end_matches('%').parse::<f64>().ok().map(|x| if v.ends_with('%') { x / 100.0 } else { x })).unwrap_or(1.0).clamp(0.0, 1.0)
            * parent.opacity;
        let clip_hidden = get("clip").map_or(false, |v| v.starts_with("rect(") && get("position").as_deref() == Some("absolute"))
            || get("clip-path").map_or(false, |v| v.contains("inset(50%") || v.contains("inset(100%") || v.contains("circle(0"));
        let class_hidden = dom.attr(n, "class").map_or(false, |c| {
            c.split_whitespace().any(|k| matches!(k, "sr-only" | "visually-hidden" | "visuallyhidden" | "screen-reader-text" | "screen-reader-only" | "a11y-hidden" | "sr-only-focusable"))
        });
        let bg_colour = get("background-color").and_then(|v| if v == "currentcolor" { Some(color) } else { parse_css_color(&v) });
        let bg_image = get("background-image").map_or(false, |v| v != "none" && !v.is_empty());
        let backdrop = match (bg_colour, bg_image) {
            (_, true) => Backdrop::Unknown,
            (Some(c), _) if c.alpha >= 1.0 => Backdrop::Known(c.rgb),
            (Some(c), false) if c.alpha > 0.0 => match parent.backdrop {
                Backdrop::Known(under) => Backdrop::Known(blend(c, under)),
                Backdrop::Unknown => Backdrop::Unknown,
            },
            _ => parent.backdrop,
        };
        out[n] = Some(Style {
            color,
            backdrop,
            font_px,
            weight,
            hidden: parent.display_hidden || display_none || visibility_hidden,
            display_hidden: parent.display_hidden || display_none,
            visually_hidden: parent.visually_hidden || clip_hidden || class_hidden,
            opacity,
            author_colour,
            vars,
            visibility_hidden,
        });
    }
    out
}

fn ua_decls(dom: &Dom, n: usize, name: &str, link: Rgb, dark: bool) -> Vec<Decl> {
    let d = |p: &str, v: &str| Decl { prop: p.into(), value: v.into(), important: false };
    let mut out = Vec::new();
    match name {
        "h1" => out.extend([d("font-size", "2em"), d("font-weight", "bold")]),
        "h2" => out.extend([d("font-size", "1.5em"), d("font-weight", "bold")]),
        "h3" => out.extend([d("font-size", "1.17em"), d("font-weight", "bold")]),
        "h4" => out.extend([d("font-size", "1em"), d("font-weight", "bold")]),
        "h5" => out.extend([d("font-size", "0.83em"), d("font-weight", "bold")]),
        "h6" => out.extend([d("font-size", "0.67em"), d("font-weight", "bold")]),
        "b" | "strong" | "th" => out.push(d("font-weight", "bold")),
        "small" | "sub" | "sup" => out.push(d("font-size", "0.83em")),
        "mark" => out.extend([d("background-color", "#FFFF00"), d("color", "#000000")]),
        "a" | "area" if dom.has_attr(n, "href") => out.push(d("color", &crate::contrast::hex(link))),
        "head" | "script" | "style" | "title" | "template" | "noscript" | "meta" | "link" | "base" | "datalist" | "param" => out.push(d("display", "none")),
        "button" => out.extend(button(dark)),
        "input" => {
            let ty = dom.attr(n, "type").unwrap_or("text").to_ascii_lowercase();
            if matches!(ty.as_str(), "button" | "submit" | "reset") {
                out.extend(button(dark));
            } else if ty == "hidden" {
                out.push(d("display", "none"));
            } else {
                out.extend(field(dark));
            }
        }
        "select" | "textarea" => out.extend(field(dark)),
        _ => {}
    }
    if dom.has_attr(n, "hidden") {
        out.push(d("display", "none"));
    }
    out
}

fn button(dark: bool) -> Vec<Decl> {
    let (c, b) = if dark { ("#FFFFFF", "#6B6B6B") } else { ("#000000", "#EFEFEF") };
    vec![Decl { prop: "color".into(), value: c.into(), important: false }, Decl { prop: "background-color".into(), value: b.into(), important: false }]
}

fn field(dark: bool) -> Vec<Decl> {
    let (c, b) = if dark { ("#FFFFFF", "#3B3B3B") } else { ("#000000", "#FFFFFF") };
    vec![Decl { prop: "color".into(), value: c.into(), important: false }, Decl { prop: "background-color".into(), value: b.into(), important: false }]
}

/// `var(--name, fallback)` replaced by the custom property's value, up to eight deep.
fn resolve_vars(v: &str, vars: &BTreeMap<String, String>, depth: u32) -> String {
    if depth > 8 || !v.contains("var(") {
        return v.to_string();
    }
    let Some(start) = v.find("var(") else { return v.to_string() };
    let inner_start = start + 4;
    let mut depth_p = 1;
    let mut end = inner_start;
    let b = v.as_bytes();
    while end < b.len() {
        match b[end] {
            b'(' => depth_p += 1,
            b')' => {
                depth_p -= 1;
                if depth_p == 0 {
                    break;
                }
            }
            _ => {}
        }
        end += 1;
    }
    let inner = &v[inner_start..end.min(v.len())];
    let (name, fallback) = match inner.split_once(',') {
        Some((n, f)) => (n.trim(), Some(f.trim())),
        None => (inner.trim(), None),
    };
    let value = vars.get(name).map(|s| s.as_str()).or(fallback).unwrap_or("");
    let replaced = format!("{}{}{}", &v[..start], value, &v[(end + 1).min(v.len())..]);
    resolve_vars(&replaced, vars, depth + 1)
}

fn has_image(v: &str) -> bool {
    let l = v.to_ascii_lowercase();
    l.contains("url(") || l.contains("gradient(") || l.contains("image(")
}

/// The colour in a `background` shorthand, or `transparent`.
fn background_colour(v: &str) -> String {
    let l = v.trim();
    if l.eq_ignore_ascii_case("none") {
        return "transparent".into();
    }
    // The colour is the last layer's colour: try the whole value, then each word and function from the end.
    if parse_css_color(l).is_some() {
        return l.to_string();
    }
    let mut tokens: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut depth = 0;
    for ch in l.chars() {
        match ch {
            '(' => {
                depth += 1;
                cur.push(ch);
            }
            ')' => {
                depth -= 1;
                cur.push(ch);
            }
            c if c.is_whitespace() && depth == 0 => {
                if !cur.is_empty() {
                    tokens.push(std::mem::take(&mut cur));
                }
            }
            ',' if depth == 0 => {
                if !cur.is_empty() {
                    tokens.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        tokens.push(cur);
    }
    for t in tokens.iter().rev() {
        if t.starts_with("var(") {
            return t.clone();
        }
        if parse_css_color(t).is_some() {
            return t.clone();
        }
    }
    "transparent".into()
}

fn font_shorthand(v: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for t in v.split_whitespace() {
        let t = t.split('/').next().unwrap_or(t).to_ascii_lowercase();
        if matches!(t.as_str(), "bold" | "bolder" | "lighter") || (t.len() == 3 && t.ends_with("00") && t.as_bytes()[0].is_ascii_digit()) {
            out.push(("font-weight".to_string(), t.clone()));
        } else if font_size(&t, 16.0, 16.0).is_some() {
            out.push(("font-size".to_string(), t.clone()));
            break;
        }
    }
    out
}

/// A font size in CSS pixels.
pub fn font_size(v: &str, parent: f64, root: f64) -> Option<f64> {
    let v = v.trim();
    let num = |s: &str| s.trim().parse::<f64>().ok();
    Some(if let Some(x) = v.strip_suffix("px") {
        num(x)?
    } else if let Some(x) = v.strip_suffix("pt") {
        num(x)? * 4.0 / 3.0
    } else if let Some(x) = v.strip_suffix("rem") {
        num(x)? * root
    } else if let Some(x) = v.strip_suffix("em") {
        num(x)? * parent
    } else if let Some(x) = v.strip_suffix('%') {
        num(x)? * parent / 100.0
    } else {
        match v {
            "xx-small" => 9.0,
            "x-small" => 10.0,
            "small" => 13.0,
            "medium" => 16.0,
            "large" => 18.0,
            "x-large" => 24.0,
            "xx-large" => 32.0,
            "xxx-large" => 48.0,
            "smaller" => parent / 1.2,
            "larger" => parent * 1.2,
            _ => return None,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn style_of(html: &str, css: &str, pick: &str, dark: bool) -> Style {
        let dom = Dom::parse_html(html);
        let mut sheet = Sheet::default();
        sheet.add(css, "t.css", 1);
        let styles = compute(&dom, &sheet, dark);
        let n = dom.elements().into_iter().find(|&i| dom.attr(i, "id") == Some(pick)).unwrap();
        styles[n].clone().unwrap()
    }

    #[test]
    fn cascade_specificity_and_inheritance() {
        let css = "p { color: #777 } .note { color: #333 } #x { color: red } body { background: #EEE url(a.png) } main { background-color: white }";
        let s = style_of("<body><main><p class=note id=y>a</p><p id=x class=note>b</p></main></body>", css, "y", false);
        assert_eq!(s.color.rgb, [0x33, 0x33, 0x33]);
        assert_eq!(s.backdrop, Backdrop::Known([255, 255, 255]));
        let s = style_of("<body><main><p class=note id=y>a</p><p id=x class=note>b</p></main></body>", css, "x", false);
        assert_eq!(s.color.rgb, [255, 0, 0]);
        let s = style_of("<body id=b><p id=p>x</p></body>", css, "p", false);
        assert_eq!(s.backdrop, Backdrop::Unknown, "a picture behind the body");
    }

    #[test]
    fn custom_properties_and_dark_scheme() {
        let css = ":root { --fg: #111; --bg: #fff } @media (prefers-color-scheme: dark) { :root { --fg: #eee; --bg: #222 } } body { color: var(--fg); background: var(--bg) }";
        let s = style_of("<html><body><p id=p>x</p></body></html>", css, "p", false);
        assert_eq!((s.color.rgb, s.backdrop), ([0x11; 3], Backdrop::Known([255; 3])));
        let s = style_of("<html><body><p id=p>x</p></body></html>", css, "p", true);
        assert_eq!((s.color.rgb, s.backdrop), ([0xEE; 3], Backdrop::Known([0x22; 3])));
    }

    #[test]
    fn sizes_weights_and_hidden() {
        let s = style_of("<h1 id=h>x</h1>", "", "h", false);
        assert_eq!((s.font_px, s.weight), (32.0, 700));
        let s = style_of("<div style='font: bold 1.25rem/1.4 serif'><span id=s>x</span></div>", "", "s", false);
        assert_eq!((s.font_px, s.weight), (20.0, 700));
        let s = style_of("<div hidden><span id=s>x</span></div>", "", "s", false);
        assert!(s.hidden);
        let s = style_of("<span class=sr-only id=s>x</span>", "", "s", false);
        assert!(s.visually_hidden && !s.hidden);
    }

    #[test]
    fn selectors() {
        let dom = Dom::parse_html("<nav><ul><li><a href=/ class='a b'>x</a></li></ul></nav><p><a>y</a></p>");
        let a = dom.find("a").unwrap();
        for (sel, want) in [("nav a", true), ("nav > a", false), ("ul > li > a.a.b", true), ("a:link", true), ("a[href^='/']", true), ("p a", false), ("a:not(.c)", true), (":is(nav, p) a", true), (":where(p) a", false)] {
            assert_eq!(matches(&dom, a, &parse_selector(sel)), want, "{sel}");
        }
        assert!(!parse_selector("a + b").supported);
        assert!(parse_selector("a:hover").has_state(&["hover"]));
    }
}
