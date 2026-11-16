//! The checks of a web page (one HTML file, each page of a help site, each content document of an EPUB).

use crate::contrast::{blend, hex, minimum_words, ratio_words, text_contrast, Rgba, Weight};
use crate::css::{compute, parse_decls, Backdrop, Sheet, Style};
use crate::dom::{squash, Dom, Kind};
use crate::report::{Collector, Finding, Status, Where};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageKind {
    /// A web page: a single page or one page of a help site.
    Web,
    /// A content document of an e-book, whose headings are part of the book's outline.
    Ebook,
}

/// A heading, for the outline of a page or a book.
#[derive(Debug, Clone)]
pub struct Heading {
    pub level: u8,
    pub at: Where,
}

const WIDGET_ROLES: &[&str] = &[
    "button", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "slider", "spinbutton",
    "textbox", "combobox", "searchbox", "listbox", "treeitem",
];

const ROLES: &str = "alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox comment complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img image insertion link list listbox listitem log main mark marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript suggestion superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem graphics-document graphics-object graphics-symbol";

const DPUB_ROLES: &str = "abstract acknowledgments afterword appendix backlink biblioentry bibliography biblioref chapter colophon conclusion cover credit credits dedication endnote endnotes epigraph epilogue errata example footnote foreword glossary glossref index introduction noteref notice pagebreak pagefooter pageheader pagelist part preface prologue pullquote qna subtitle tip toc";

const VAGUE: &[&str] = &[
    "here", "click here", "click", "click this", "more", "read more", "learn more", "more info", "more information", "info", "link", "this link",
    "this", "details", "go", "this page", "page", "website", "web site", "see more", "continue reading",
];

/// Whether a picture's description is a placeholder: a word that names the kind of thing, a file name, or no letters.
pub fn placeholder_alt(alt: &str, src: Option<&str>) -> bool {
    let a = alt.trim().to_lowercase();
    if a.is_empty() {
        return false;
    }
    let words = ["image", "img", "figure", "picture", "pic", "photo", "photograph", "graphic", "illustration", "icon", "alt", "alt text", "alternative text", "todo", "tbd", "placeholder", "description", "description here", "untitled", "screenshot", "logo", "chart", "diagram"];
    let base = a.trim_end_matches(|c: char| c.is_ascii_digit() || c == ' ' || c == '_' || c == '-' || c == '.').trim();
    if words.contains(&base) {
        return true;
    }
    if [".png", ".jpg", ".jpeg", ".gif", ".tif", ".tiff", ".bmp", ".svg", ".webp", ".avif"].iter().any(|e| a.ends_with(e)) {
        return true;
    }
    if !a.chars().any(|c| c.is_alphabetic()) {
        return true;
    }
    if let Some(src) = src {
        let file = src.rsplit(['/', '\\']).next().unwrap_or(src).split(['?', '#']).next().unwrap_or("").to_lowercase();
        let stem = file.rsplit_once('.').map(|(s, _)| s.to_string()).unwrap_or(file.clone());
        if !file.is_empty() && !file.starts_with("data:") && (a == file || a == stem || a.replace(' ', "-") == stem || a.replace(' ', "_") == stem) {
            return true;
        }
    }
    false
}

/// Whether a title is a placeholder.
pub fn placeholder_title(title: &str) -> bool {
    let t = title.trim().to_lowercase();
    let t = t.trim_end_matches(".pdf").trim_end_matches(".html").trim_end_matches(".htm").trim_end_matches(".docx").trim_end_matches(".pptx").trim();
    matches!(t, "untitled" | "untitled document" | "untitled page" | "document" | "pdf" | "test" | "unknown" | "title" | "new document" | "new page" | "page" | "index" | "document1" | "presentation" | "presentation1" | "slide 1" | "home")
        || !t.chars().any(|c| c.is_alphabetic())
}

/// Whether a language tag is written as one: a language of two or three letters (or `x` or `i` and more parts),
/// then parts of one to eight letters and digits, joined by hyphens. Its shape only (BCP 47), not the registry.
pub fn lang_tag_ok(tag: &str) -> bool {
    let parts: Vec<&str> = tag.trim().split('-').collect();
    let first = parts[0];
    let first_ok = ((2..=3).contains(&first.len()) && first.chars().all(|c| c.is_ascii_alphabetic()))
        || (parts.len() > 1 && (first.eq_ignore_ascii_case("x") || first.eq_ignore_ascii_case("i")));
    first_ok && parts[1..].iter().all(|p| (1..=8).contains(&p.len()) && p.chars().all(|c| c.is_ascii_alphanumeric()))
}

struct Ctx<'a> {
    file: &'a str,
    dom: &'a Dom,
    light: Vec<Option<Style>>,
}

impl<'a> Ctx<'a> {
    fn at(&self, n: usize) -> Where {
        Where {
            file: Some(self.file.to_string()),
            id: self.dom.attr(n, "id").filter(|s| !s.is_empty()).map(str::to_string),
            element: Some(self.dom.path(n)),
            line: Some(self.dom.line(n)),
            ..Where::default()
        }
    }

    fn hidden(&self, n: usize) -> bool {
        self.light.get(n).and_then(|s| s.as_ref()).map_or(false, |s| s.hidden) || self.dom.has_ancestor(n, "template") || self.dom.has_ancestor(n, "head")
    }

    fn aria_hidden(&self, n: usize) -> bool {
        std::iter::once(n).chain(self.dom.ancestors(n)).any(|a| self.dom.attr(a, "aria-hidden").map_or(false, |v| v.trim() == "true"))
    }

    /// Hidden from everyone, or from screen readers.
    fn out_of_reach(&self, n: usize) -> bool {
        self.hidden(n) || self.aria_hidden(n)
    }

    fn by_id(&self) -> BTreeMap<String, usize> {
        let mut m = BTreeMap::new();
        for n in self.dom.elements() {
            if let Some(id) = self.dom.attr(n, "id") {
                m.entry(id.to_string()).or_insert(n);
            }
        }
        m
    }

    /// The text a screen reader would take from an element's content: text, pictures' descriptions, the names of
    /// children that have one; hidden and `aria-hidden` children are left out.
    fn content_text(&self, n: usize, depth: u32) -> String {
        if depth > 40 {
            return String::new();
        }
        let mut s = String::new();
        for &c in self.dom.children(n) {
            match &self.dom.nodes[c].kind {
                Kind::Text(t) => {
                    s.push_str(t);
                }
                Kind::Element { name, .. } => {
                    if self.out_of_reach(c) {
                        continue;
                    }
                    if let Some(l) = self.dom.attr(c, "aria-label").filter(|l| !l.trim().is_empty()) {
                        s.push(' ');
                        s.push_str(l);
                        s.push(' ');
                        continue;
                    }
                    match name.as_str() {
                        "img" | "area" => s.push_str(&format!(" {} ", self.dom.attr(c, "alt").unwrap_or(""))),
                        "svg" => s.push_str(&format!(" {} ", self.dom.find_in(c, "title").map(|t| self.dom.text(t)).unwrap_or_default())),
                        "input" => {
                            let ty = self.dom.attr(c, "type").unwrap_or("text").to_ascii_lowercase();
                            if matches!(ty.as_str(), "button" | "submit" | "reset") {
                                s.push_str(&format!(" {} ", self.dom.attr(c, "value").unwrap_or("")));
                            }
                        }
                        "script" | "style" | "template" => {}
                        _ => {
                            s.push(' ');
                            s.push_str(&self.content_text(c, depth + 1));
                            s.push(' ');
                        }
                    }
                }
                Kind::Document => {}
            }
        }
        squash(&s)
    }

    fn labels_of(&self, n: usize, ids: &BTreeMap<String, usize>) -> String {
        let mut parts = Vec::new();
        if let Some(id) = self.dom.attr(n, "id") {
            for l in self.dom.find_all("label") {
                if self.dom.attr(l, "for") == Some(id) {
                    parts.push(self.content_text(l, 0));
                }
            }
        }
        if let Some(l) = self.dom.ancestors(n).find(|&a| self.dom.is(a, "label")) {
            parts.push(self.content_text(l, 0));
        }
        let _ = ids;
        squash(&parts.join(" "))
    }

    /// An element's accessible name, by the main steps of the accessible name computation: `aria-labelledby`,
    /// `aria-label`, the element's own way (alt, label, legend, value), its content when its role takes the name from
    /// content, then `title` and `placeholder`.
    fn name(&self, n: usize, ids: &BTreeMap<String, usize>) -> String {
        let dom = self.dom;
        if let Some(refs) = dom.attr(n, "aria-labelledby") {
            let t: Vec<String> = refs.split_whitespace().filter_map(|r| ids.get(r)).map(|&e| self.content_text(e, 0)).collect();
            let t = squash(&t.join(" "));
            if !t.is_empty() {
                return t;
            }
        }
        if let Some(l) = dom.attr(n, "aria-label") {
            if !l.trim().is_empty() {
                return squash(l);
            }
        }
        let name = dom.name(n).unwrap_or("");
        let role = dom.attr(n, "role").and_then(|r| r.split_whitespace().next()).unwrap_or("");
        let own = match name {
            "img" | "area" => dom.attr(n, "alt").map(squash).unwrap_or_default(),
            "input" => {
                let ty = dom.attr(n, "type").unwrap_or("text").to_ascii_lowercase();
                match ty.as_str() {
                    "image" => dom.attr(n, "alt").map(squash).unwrap_or_default(),
                    "submit" => dom.attr(n, "value").map(squash).unwrap_or_else(|| "Submit".into()),
                    "reset" => dom.attr(n, "value").map(squash).unwrap_or_else(|| "Reset".into()),
                    "button" => dom.attr(n, "value").map(squash).unwrap_or_default(),
                    _ => self.labels_of(n, ids),
                }
            }
            "select" | "textarea" | "meter" | "progress" | "output" => self.labels_of(n, ids),
            "fieldset" => dom.element_children(n).find(|&c| dom.is(c, "legend")).map(|l| self.content_text(l, 0)).unwrap_or_default(),
            "table" => dom.element_children(n).find(|&c| dom.is(c, "caption")).map(|l| self.content_text(l, 0)).unwrap_or_default(),
            "svg" => dom.element_children(n).find(|&c| dom.is(c, "title")).map(|t| dom.text(t)).unwrap_or_default(),
            _ => String::new(),
        };
        if !own.is_empty() {
            return own;
        }
        let from_content = matches!(name, "a" | "button" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "summary" | "option" | "td" | "th" | "label" | "legend" | "caption")
            || matches!(role, "button" | "link" | "heading" | "tab" | "option" | "menuitem" | "menuitemcheckbox" | "menuitemradio" | "checkbox" | "radio" | "switch" | "treeitem" | "cell" | "columnheader" | "rowheader" | "tooltip");
        if from_content {
            let t = self.content_text(n, 0);
            if !t.is_empty() {
                return t;
            }
        }
        for a in ["title", "placeholder"] {
            if let Some(t) = dom.attr(n, a) {
                if !t.trim().is_empty() {
                    return squash(t);
                }
            }
        }
        String::new()
    }
}

/// What to call the thing a finding is about.
fn what_of(dom: &Dom, n: usize) -> String {
    let name = dom.name(n).unwrap_or("element");
    if let Some(role) = dom.attr(n, "role").and_then(|r| r.split_whitespace().next()) {
        return match role {
            "checkbox" => "check box".into(),
            "radio" => "radio button".into(),
            "textbox" | "searchbox" => "text field".into(),
            "combobox" | "listbox" => "list".into(),
            "menuitem" | "menuitemcheckbox" | "menuitemradio" => "menu item".into(),
            r => r.to_string(),
        };
    }
    match name {
        "input" => match dom.attr(n, "type").unwrap_or("text").to_ascii_lowercase().as_str() {
            "checkbox" => "check box".into(),
            "radio" => "radio button".into(),
            "button" | "submit" | "reset" | "image" => "button".into(),
            "range" => "slider".into(),
            _ => "text field".into(),
        },
        "select" => "list".into(),
        "textarea" => "text box".into(),
        "a" => "link".into(),
        "img" => "picture".into(),
        "div" | "span" | "li" | "p" | "td" => format!("{name} element"),
        other => other.to_string(),
    }
}

fn natively_focusable(dom: &Dom, n: usize) -> bool {
    let name = dom.name(n).unwrap_or("");
    match name {
        "a" | "area" => dom.has_attr(n, "href"),
        "button" | "select" | "textarea" | "iframe" => true,
        "input" => dom.attr(n, "type").map_or(true, |t| !t.eq_ignore_ascii_case("hidden")),
        "summary" => dom.parent(n).map_or(false, |p| dom.is(p, "details")),
        "audio" | "video" => dom.has_attr(n, "controls"),
        _ => dom.attr(n, "contenteditable").map_or(false, |v| !v.eq_ignore_ascii_case("false")),
    }
}

fn tabindex(dom: &Dom, n: usize) -> Option<i64> {
    dom.attr(n, "tabindex").and_then(|t| t.trim().parse::<i64>().ok())
}

/// Checks one page. Its headings are added to `outline`; for a web page the outline rules are run here, for an
/// e-book they are run on the whole book afterwards (see `outline_rules`).
pub fn check_page(file: &str, dom: &Dom, sheet: &Sheet, kind: PageKind, c: &mut Collector, outline: &mut Vec<Heading>) {
    let light = compute(dom, sheet, false);
    let cx = Ctx { file, dom, light };
    let ids = cx.by_id();
    let what_page = if kind == PageKind::Web { "page" } else { "page of the e-book" };

    // 3.1.1 and 2.4.2: the page's language and title.
    c.check("page-lang");
    let html = dom.find("html");
    let lang = html.and_then(|h| dom.attr(h, "lang").or_else(|| dom.attr(h, "xml:lang"))).map(str::trim).unwrap_or("");
    let page_at = html.map(|h| cx.at(h)).unwrap_or_else(|| Where::file(file));
    if lang.is_empty() {
        c.found(Finding::new("page-lang", Status::Fail, None, page_at.clone(), &[("what", what_page.into())]));
    } else if !lang_tag_ok(lang) {
        c.found(Finding::new("page-lang", Status::Fail, Some("invalid"), page_at.clone(), &[("what", what_page.into()), ("lang", lang.into())]));
    }
    c.check("page-title");
    let title = dom.find("title").map(|t| dom.text(t)).unwrap_or_default();
    if title.is_empty() {
        c.found(Finding::new("page-title", Status::Fail, None, page_at.clone(), &[("what", what_page.into())]));
    } else if placeholder_title(&title) {
        c.found(Finding::new("page-title", Status::Fail, Some("placeholder"), page_at.clone(), &[("what", what_page.into()), ("title", title.clone())]));
    }

    let elements = dom.elements();
    let mut pictures = false;
    let mut video = false;
    let mut interactive = false;

    // 2.2.1: a page that reloads or moves on by itself (its meta element is in the head, which is never shown).
    for &n in &elements {
        if dom.is(n, "meta") && dom.attr(n, "http-equiv").map_or(false, |h| h.eq_ignore_ascii_case("refresh")) {
            c.check("timed-content");
            let content = dom.attr(n, "content").unwrap_or("");
            let secs = content.split([';', ',']).next().unwrap_or("").trim().parse::<f64>().unwrap_or(0.0);
            if secs > 0.0 {
                c.found(Finding::new("timed-content", Status::Fail, Some("refresh"), cx.at(n), &[("seconds", format!("{secs}"))]));
            }
        }
    }

    for &n in &elements {
        let name = dom.name(n).unwrap_or("").to_string();
        if cx.hidden(n) {
            continue;
        }
        let aria_hidden = cx.aria_hidden(n);
        let role = dom.attr(n, "role").and_then(|r| r.split_whitespace().next()).unwrap_or("").to_ascii_lowercase();

        // 1.1.1: pictures.
        let is_picture = name == "img" || (name == "input" && dom.attr(n, "type").map_or(false, |t| t.eq_ignore_ascii_case("image"))) || (name == "area" && dom.has_attr(n, "href")) || (role == "img" && name != "img");
        if is_picture && !aria_hidden {
            let decorative = matches!(role.as_str(), "presentation" | "none");
            let alt = dom.attr(n, "alt");
            if decorative && name == "img" {
                c.check("alt-decorative-text");
                if alt.map_or(false, |a| !a.trim().is_empty()) {
                    c.found(Finding::new("alt-decorative-text", Status::Fail, None, cx.at(n), &[]));
                }
            } else {
                c.check("alt-missing");
                let label = cx.name(n, &ids);
                let missing = if name == "img" { alt.is_none() && label.is_empty() } else { label.is_empty() };
                if missing {
                    c.found(Finding::new("alt-missing", Status::Fail, None, cx.at(n), &[]));
                } else if !label.is_empty() {
                    pictures = true;
                    c.check("alt-weak");
                    if placeholder_alt(&label, dom.attr(n, "src")) {
                        c.found(Finding::new("alt-weak", Status::Fail, None, cx.at(n), &[("alt", label.clone())]));
                    }
                }
            }
        }

        // 1.3.1 and 2.4.6: headings.
        let level = if name.len() == 2 && name.starts_with('h') && (b'1'..=b'6').contains(&name.as_bytes()[1]) {
            Some(name.as_bytes()[1] - b'0')
        } else if role == "heading" {
            Some(dom.attr(n, "aria-level").and_then(|l| l.trim().parse::<u8>().ok()).unwrap_or(2).clamp(1, 9))
        } else {
            None
        };
        if let (Some(level), false) = (level, aria_hidden || matches!(role.as_str(), "presentation" | "none")) {
            c.check("heading-empty");
            if cx.name(n, &ids).is_empty() {
                c.found(Finding::new("heading-empty", Status::Fail, None, cx.at(n), &[]));
            }
            outline.push(Heading { level, at: cx.at(n) });
        }

        // 4.1.2: controls and links have names.
        let is_control = matches!(name.as_str(), "button" | "select" | "textarea")
            || (name == "input" && !matches!(dom.attr(n, "type").unwrap_or("text").to_ascii_lowercase().as_str(), "hidden" | "image"))
            || WIDGET_ROLES.contains(&role.as_str());
        if is_control && !aria_hidden {
            interactive = true;
            c.check("control-name");
            if cx.name(n, &ids).is_empty() {
                c.found(Finding::new("control-name", Status::Fail, None, cx.at(n), &[("role", what_of(dom, n))]));
            }
        }
        let is_link = (name == "a" && dom.has_attr(n, "href")) || role == "link";
        if is_link && !aria_hidden {
            interactive = true;
            c.check("link-name");
            let text = cx.name(n, &ids);
            if text.is_empty() {
                c.found(Finding::new("link-name", Status::Fail, None, cx.at(n), &[]));
            } else {
                c.check("link-vague");
                let plain: String = text.to_lowercase().chars().filter(|ch| ch.is_alphanumeric() || ch.is_whitespace()).collect();
                if VAGUE.contains(&squash(&plain).as_str()) {
                    c.found(Finding::new("link-vague", Status::NeedsReview, None, cx.at(n), &[("text", text.clone())]));
                }
            }
        }

        // 4.1.2: roles.
        if let Some(r) = dom.attr(n, "role") {
            if !r.trim().is_empty() {
                c.check("role-unknown");
                let known = r.split_whitespace().any(|t| {
                    let t = t.to_ascii_lowercase();
                    ROLES.split(' ').any(|k| k == t) || t.strip_prefix("doc-").map_or(false, |d| DPUB_ROLES.split(' ').any(|k| k == d))
                });
                if !known {
                    c.found(Finding::new("role-unknown", Status::Fail, None, cx.at(n), &[("role", r.trim().to_string())]));
                }
            }
        }

        // 2.1.1: keyboard.
        let clickable = ["onclick", "onmousedown", "onmouseup"].iter().any(|a| dom.has_attr(n, a));
        let ti = tabindex(dom, n);
        if clickable && !natively_focusable(dom, n) {
            interactive = true;
            c.check("keyboard-reach");
            if ti.map_or(true, |t| t < 0) {
                c.found(Finding::new("keyboard-reach", Status::Fail, None, cx.at(n), &[("what", what_of(dom, n))]));
            } else {
                c.check("keyboard-operate");
                if !["onkeydown", "onkeyup", "onkeypress"].iter().any(|a| dom.has_attr(n, a)) {
                    c.found(Finding::new("keyboard-operate", Status::NeedsReview, None, cx.at(n), &[("what", what_of(dom, n))]));
                }
            }
        } else if natively_focusable(dom, n) && ti.map_or(false, |t| t < 0) && !aria_hidden {
            c.check("keyboard-reach");
            c.found(Finding::new("keyboard-reach", Status::NeedsReview, Some("removed"), cx.at(n), &[("what", what_of(dom, n))]));
        }

        // 2.4.3: a positive tabindex.
        if let Some(t) = ti {
            c.check("focus-order");
            if t > 0 {
                c.found(Finding::new("focus-order", Status::NeedsReview, None, cx.at(n), &[("tabindex", t.to_string())]));
            }
        }

        // 1.2.1, 1.2.2, 1.2.5 and 1.4.2: media.
        if name == "video" || name == "audio" {
            c.check("media-autoplay");
            if dom.has_attr(n, "autoplay") && !dom.has_attr(n, "muted") && !dom.has_attr(n, "controls") {
                c.found(Finding::new("media-autoplay", Status::Fail, None, cx.at(n), &[("what", if name == "video" { "video".into() } else { "sound".into() })]));
            }
            let tracks: Vec<String> = dom.element_children(n).filter(|&t| dom.is(t, "track")).map(|t| dom.attr(t, "kind").unwrap_or("subtitles").to_ascii_lowercase()).collect();
            if name == "video" {
                video = true;
                c.check("captions-missing");
                if !tracks.iter().any(|k| k == "captions" || k == "subtitles") {
                    c.found(Finding::new("captions-missing", Status::Fail, None, cx.at(n), &[]));
                }
                c.check("audio-description");
                if !tracks.iter().any(|k| k == "descriptions") {
                    c.found(Finding::new("audio-description", Status::NeedsReview, None, cx.at(n), &[]));
                }
            } else {
                c.check("transcript-missing");
                let near = dom.parent(n).map(|p| dom.text(p).to_lowercase().contains("transcript")).unwrap_or(false)
                    || dom.parent(n).and_then(|p| dom.parent(p)).map(|g| dom.text(g).to_lowercase().contains("transcript")).unwrap_or(false);
                if !near {
                    c.found(Finding::new("transcript-missing", Status::NeedsReview, None, cx.at(n), &[]));
                }
            }
        }
        if name == "iframe" {
            let src = dom.attr(n, "src").unwrap_or("").to_ascii_lowercase();
            if ["youtube.com", "youtube-nocookie.com", "youtu.be", "vimeo.com", "player.", "/embed/", "kaltura", "wistia"].iter().any(|h| src.contains(h)) {
                video = true;
                c.check("captions-missing");
                c.found(Finding::new("captions-missing", Status::NeedsReview, Some("embedded"), cx.at(n), &[]));
            }
        }

        // 2.2.2: moving text.
        if name == "marquee" || name == "blink" {
            c.check("timed-content");
            c.found(Finding::new("timed-content", Status::Fail, Some("moving"), cx.at(n), &[("element", name.clone())]));
        }

        // 1.3.1: tables.
        if name == "table" && !matches!(role.as_str(), "presentation" | "none") {
            let rows: Vec<usize> = dom.descendants(n).into_iter().filter(|&r| dom.is(r, "tr") && dom.ancestors(r).find(|&a| dom.is(a, "table")) == Some(n)).collect();
            let cols = rows.iter().map(|&r| dom.element_children(r).filter(|&x| dom.is(x, "td") || dom.is(x, "th")).count()).max().unwrap_or(0);
            if rows.len() >= 2 && cols >= 2 {
                c.check("table-headers");
                let has_header = rows.iter().any(|&r| {
                    dom.element_children(r).any(|x| {
                        dom.is(x, "th") || dom.has_attr(x, "scope") || dom.attr(x, "role").map_or(false, |ro| ro == "columnheader" || ro == "rowheader")
                    })
                });
                if !has_header {
                    c.found(Finding::new("table-headers", Status::Fail, None, cx.at(n), &[]));
                }
            }
        }
    }

    // 4.1.1 and the references between elements.
    let mut seen: BTreeMap<String, (usize, u32)> = BTreeMap::new();
    for &n in &elements {
        if let Some(id) = dom.attr(n, "id") {
            if !id.is_empty() {
                let e = seen.entry(id.to_string()).or_insert((n, 0));
                e.1 += 1;
            }
        }
    }
    for (id, (n, count)) in &seen {
        c.check("id-duplicate");
        if *count > 1 {
            let mut at = cx.at(*n);
            at.id = None;
            c.found(Finding::new("id-duplicate", Status::Fail, None, at, &[("id", id.clone()), ("count", count.to_string())]));
        }
    }
    for &n in &elements {
        let mut refs: Vec<(String, String)> = Vec::new();
        for a in ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-flowto", "aria-details"] {
            if let Some(v) = dom.attr(n, a) {
                refs.extend(v.split_whitespace().map(|r| (a.to_string(), r.to_string())));
            }
        }
        for a in ["aria-activedescendant", "aria-errormessage"] {
            if let Some(v) = dom.attr(n, a).filter(|v| !v.trim().is_empty()) {
                refs.push((a.to_string(), v.trim().to_string()));
            }
        }
        if dom.is(n, "label") {
            if let Some(v) = dom.attr(n, "for").filter(|v| !v.trim().is_empty()) {
                refs.push(("The label's for attribute".to_string(), v.trim().to_string()));
            }
        }
        if dom.is(n, "td") || dom.is(n, "th") {
            if let Some(v) = dom.attr(n, "headers") {
                refs.extend(v.split_whitespace().map(|r| ("The cell's headers attribute".to_string(), r.to_string())));
            }
        }
        for (attr, id) in refs {
            c.check("id-reference");
            if !seen.contains_key(&id) {
                c.found(Finding::new("id-reference", Status::Fail, None, cx.at(n), &[("attribute", attr), ("id", id)]));
            }
        }
    }

    if kind == PageKind::Web {
        // 1.3.1 and 2.4.1: the main part, and a way past the navigation.
        let main = elements.iter().any(|&n| dom.is(n, "main") || dom.attr(n, "role") == Some("main"));
        let body_at = dom.find("body").map(|b| cx.at(b)).unwrap_or_else(|| page_at.clone());
        c.check("landmark-main");
        if !main {
            c.found(Finding::new("landmark-main", Status::Fail, None, body_at.clone(), &[]));
        }
        c.check("bypass-blocks");
        let focusables: Vec<usize> = elements.iter().copied().filter(|&n| natively_focusable(dom, n) && !cx.hidden(n)).take(3).collect();
        let mut skip_link = false;
        let mut broken = None;
        for &f in &focusables {
            if let Some(h) = dom.attr(f, "href").filter(|h| h.starts_with('#') && h.len() > 1) {
                skip_link = true;
                let target = &h[1..];
                let named = elements.iter().any(|&n| dom.is(n, "a") && dom.attr(n, "name") == Some(target));
                if !seen.contains_key(target) && !named {
                    broken = Some((f, target.to_string()));
                }
                break;
            }
        }
        let nav = elements.iter().any(|&n| dom.is(n, "nav") || dom.attr(n, "role") == Some("navigation"));
        if let Some((f, id)) = broken {
            c.found(Finding::new("bypass-blocks", Status::Fail, Some("skip-target"), cx.at(f), &[("id", id)]));
        } else if nav && !main && !skip_link && outline.is_empty() {
            c.found(Finding::new("bypass-blocks", Status::Fail, None, body_at, &[]));
        }
        outline_rules(outline, c);
    }

    // 2.4.7: style rules that take the focus outline away.
    focus_rules(sheet, &elements, dom, c);

    // 1.4.3: contrast, in the light scheme and, when the page has one, the dark scheme.
    contrast(&cx, sheet, &elements, c, false);
    if sheet.has_dark {
        contrast(&cx, sheet, &elements, c, true);
    }
    for note in &sheet.notes {
        c.limit(note);
    }
    if elements.iter().any(|&n| dom.is(n, "script") && (dom.has_attr(n, "src") || !dom.text(n).is_empty()) && dom.attr(n, "type").map_or(true, |t| t.contains("javascript") || t == "module")) {
        c.limit("The page runs scripts; anything they add or change after it opens was not checked.");
    }

    c.ask("reading-order");
    c.ask("color-only");
    if pictures {
        c.ask("alt-meaning");
    }
    if interactive {
        c.ask("keyboard-trial");
    }
    if video {
        c.ask("captions-accuracy");
        c.ask("flashing");
    }
}

/// The outline rules: headings that skip a level, and a first heading that is not level 1.
pub fn outline_rules(outline: &[Heading], c: &mut Collector) {
    if outline.is_empty() {
        return;
    }
    c.check("heading-start");
    if outline[0].level != 1 {
        c.found(Finding::new("heading-start", Status::Fail, None, outline[0].at.clone(), &[("level", outline[0].level.to_string())]));
    }
    for w in outline.windows(2) {
        c.check("heading-order");
        let (prev, h) = (w[0].level, w[1].level);
        if h > prev + 1 {
            c.found(Finding::new(
                "heading-order",
                Status::Fail,
                None,
                h_at(&w[1]),
                &[("level", h.to_string()), ("previous", prev.to_string()), ("expected", (prev + 1).to_string())],
            ));
        }
    }
}

fn h_at(h: &Heading) -> Where {
    h.at.clone()
}

fn focus_rules(sheet: &Sheet, elements: &[usize], dom: &Dom, c: &mut Collector) {
    let removes = |prop: &str, value: &str| {
        let v = value.trim().to_ascii_lowercase();
        (prop == "outline" && (v == "none" || v == "0" || v.starts_with("0 ") || v.starts_with("0px") || v.contains(" none") || v.starts_with("none ")))
            || (prop == "outline-style" && v == "none")
            || (prop == "outline-width" && (v == "0" || v == "0px"))
    };
    let shows = |prop: &str, value: &str| {
        let v = value.trim().to_ascii_lowercase();
        let p = prop;
        (p == "outline" || p == "outline-style" || p == "outline-width" || p == "outline-color") && !removes(p, &v)
            || (p == "box-shadow" && v != "none")
            || p.starts_with("border")
            || p.starts_with("background")
            || p.starts_with("text-decoration")
            || p == "color"
    };
    // A ring shown another way: a border, a shadow or an outline (a colour or a background alone is not counted).
    let rings = |r: &crate::css::CssRule| r.decls.iter().any(|d| shows(&d.prop, &d.value) && !d.prop.starts_with("background") && d.prop != "color");
    let focus_shows: Vec<&crate::css::CssRule> = sheet.rules.iter().filter(|r| r.selector.supported && r.selector.has_state(&["focus", "focus-visible"]) && rings(r)).collect();
    let within_shows: Vec<&crate::css::CssRule> = sheet.rules.iter().filter(|r| r.selector.supported && r.selector.has_state(&["focus-within"]) && rings(r)).collect();
    let focusable = |n: usize| natively_focusable(dom, n) || tabindex(dom, n).map_or(false, |t| t >= 0);
    let mut done = BTreeSet::new();
    for r in &sheet.rules {
        if !r.selector.supported || !r.decls.iter().any(|d| removes(&d.prop, &d.value)) {
            continue;
        }
        if r.selector.states.iter().any(|s| !matches!(s.as_str(), "focus" | "focus-visible")) {
            continue;
        }
        let focus_rule = r.selector.has_state(&["focus", "focus-visible"]);
        // The rule matters on this page only where it matches something that can take the focus. Taking the outline
        // away at rest (`a { outline: none }`) also takes the browser's focus ring away.
        let matched: Vec<usize> = elements.iter().copied().filter(|&n| focusable(n) && crate::css::matches(dom, n, &r.selector)).collect();
        if matched.is_empty() || !done.insert((r.file.clone(), r.line, r.selector.text.clone())) {
            continue;
        }
        c.check("focus-visible");
        if r.decls.iter().any(|d| shows(&d.prop, &d.value)) {
            continue;
        }
        // Focus shown again: by a later focus rule for the same element (for a rule at rest), or by a :focus-within
        // rule on the element or a box around it.
        let shown_again = |n: usize| {
            (!focus_rule && focus_shows.iter().any(|f| crate::css::matches(dom, n, &f.selector)))
                || std::iter::once(n).chain(dom.ancestors(n)).any(|a| dom.name(a).is_some() && within_shows.iter().any(|w| crate::css::matches(dom, a, &w.selector)))
        };
        if !matched.iter().all(|&n| shown_again(n)) {
            let at = Where { file: Some(r.file.clone()), line: Some(r.line), ..Where::default() };
            c.found(Finding::new("focus-visible", Status::NeedsReview, None, at, &[("selector", r.selector.text.clone())]));
        }
    }
}

fn contrast(cx: &Ctx, sheet: &Sheet, elements: &[usize], c: &mut Collector, dark: bool) {
    let dom = cx.dom;
    let styles: Vec<Option<Style>>;
    let styles = if dark {
        styles = compute(dom, sheet, true);
        &styles
    } else {
        &cx.light
    };
    let scheme = if dark { Some("dark".to_string()) } else { None };
    for &n in elements {
        let Some(st) = styles.get(n).and_then(|s| s.as_ref()) else { continue };
        if st.hidden || st.visually_hidden || cx.dom.has_ancestor(n, "svg") || dom.is(n, "option") || dom.is(n, "svg") {
            continue;
        }
        if std::iter::once(n).chain(dom.ancestors(n)).any(|a| dom.has_attr(a, "disabled")) {
            continue;
        }
        if dom.own_text(n).is_empty() {
            continue;
        }
        c.check("contrast-text");
        let fg = Rgba { rgb: st.color.rgb, alpha: st.color.alpha * st.opacity };
        let mut at = cx.at(n);
        at.scheme = scheme.clone();
        match st.backdrop {
            Backdrop::Unknown => {
                let fg_hex = hex(fg.rgb);
                let large = crate::contrast::is_large(st.font_px * 0.75, st.weight >= 700);
                let minimum = if large { crate::contrast::LARGE_TEXT_MIN } else { crate::contrast::TEXT_MIN };
                c.found_grouped(
                    format!("{} unknown {} {:?}", cx.file, fg_hex, scheme),
                    Finding::new(
                        "contrast-text",
                        Status::NeedsReview,
                        Some("unknown-background"),
                        at,
                        &[("foreground", fg_hex), ("minimum", minimum_words(minimum)), ("size", if large { "large" } else { "normal" }.to_string())],
                    ),
                );
            }
            Backdrop::Known(bg) => {
                let fg = blend(fg, bg);
                let size_pt = st.font_px * 0.75;
                let w = if st.weight >= 700 { Weight::Bold } else { Weight::Normal };
                let r = text_contrast(fg, bg, size_pt, w);
                if r.status != Status::Pass {
                    let size = if r.large { "large" } else { "normal" };
                    let params = [
                        ("foreground", hex(fg)),
                        ("background", hex(bg)),
                        ("ratio", ratio_words(r.ratio)),
                        ("minimum", minimum_words(r.minimum)),
                        ("size", size.to_string()),
                    ];
                    c.found_grouped(format!("{} {} {} {} {:?}", cx.file, hex(fg), hex(bg), size, scheme), Finding::new("contrast-text", r.status, r.variant, at, &params));
                }
            }
        }
    }
}

/// The local style sheets a page links to, as hrefs, in order.
pub fn linked_sheets(dom: &Dom) -> Vec<String> {
    dom.find_all("link")
        .into_iter()
        .filter(|&l| dom.attr(l, "rel").map_or(false, |r| r.split_whitespace().any(|x| x.eq_ignore_ascii_case("stylesheet"))))
        .filter(|&l| dom.attr(l, "media").map_or(true, |m| { let m = m.to_ascii_lowercase(); !m.contains("print") || m.contains("screen") }))
        .filter_map(|l| dom.attr(l, "href").map(str::to_string))
        .collect()
}

/// The page's style: its linked sheets (read with `load`, which returns `None` for one it cannot read) and its
/// `style` elements, in document order.
pub fn sheet_for(file: &str, dom: &Dom, load: &dyn Fn(&str) -> Option<String>) -> Sheet {
    let mut sheet = Sheet::default();
    let mut missed = false;
    for n in dom.elements() {
        if dom.is(n, "link") && linked_sheets(dom).iter().any(|h| Some(h.as_str()) == dom.attr(n, "href")) {
            let href = dom.attr(n, "href").unwrap_or("");
            match load(href) {
                Some(text) => sheet.add(&text, &crate::paths::join(&crate::paths::dir(file), href), 1),
                None => missed = true,
            }
        } else if dom.is(n, "style") {
            let media_ok = dom.attr(n, "media").map_or(true, |m| { let m = m.to_ascii_lowercase(); !m.contains("print") || m.contains("screen") });
            if media_ok {
                sheet.add(&dom.text_raw(n), file, dom.line(n));
            }
        }
    }
    for n in dom.elements() {
        if let Some(meta) = (dom.is(n, "meta") && dom.attr(n, "name").map_or(false, |m| m.eq_ignore_ascii_case("color-scheme"))).then(|| dom.attr(n, "content").unwrap_or("")) {
            if meta.to_ascii_lowercase().contains("dark") {
                sheet.root_scheme_dark = true;
                sheet.has_dark = true;
            }
        }
        if dom.is(n, "html") {
            if let Some(st) = dom.attr(n, "style") {
                if parse_decls(st).iter().any(|d| d.prop == "color-scheme" && d.value.to_ascii_lowercase().contains("dark")) {
                    sheet.root_scheme_dark = true;
                    sheet.has_dark = true;
                }
            }
        }
    }
    if missed {
        sheet.notes.push("A linked style sheet could not be read, so colours it sets were not checked.".into());
    }
    sheet
}
