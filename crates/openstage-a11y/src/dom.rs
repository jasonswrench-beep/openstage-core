//! A small, forgiving reader of HTML and XML into a tree. It is not a full HTML5 parser: it knows the empty elements,
//! the raw-text elements and the usual implied ends (a `p` before a block, one `li` before the next), which is enough
//! for pages that tools write and for most written by hand. XML mode (XHTML in an EPUB, Word and PowerPoint parts)
//! keeps every element as written.

#[derive(Debug, Clone)]
pub enum Kind {
    Document,
    Element { name: String, attrs: Vec<(String, String)> },
    Text(String),
}

#[derive(Debug, Clone)]
pub struct Node {
    pub kind: Kind,
    pub parent: Option<usize>,
    pub children: Vec<usize>,
    /// The line the node starts on, from 1.
    pub line: u32,
}

#[derive(Debug, Clone)]
pub struct Dom {
    pub nodes: Vec<Node>,
    /// True when a limit stopped the reading early.
    pub truncated: bool,
}

const MAX_NODES: usize = 400_000;
const MAX_DEPTH: usize = 400;

const VOID: &[&str] = &["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
const RAW: &[&str] = &["script", "style"];
const RCDATA: &[&str] = &["title", "textarea"];
const CLOSES_P: &[&str] = &[
    "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
    "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul",
];
const SCOPE: &[&str] = &["html", "body", "table", "td", "th", "caption", "button", "object", "template", "div", "section", "article", "li", "dd", "dt"];

impl Dom {
    pub fn parse_html(src: &str) -> Dom {
        Builder::new(src, false).run()
    }
    pub fn parse_xml(src: &str) -> Dom {
        Builder::new(src, true).run()
    }

    pub fn root(&self) -> usize {
        0
    }

    /// The element's name in lower case, or `None` for a text node or the document.
    pub fn name(&self, i: usize) -> Option<&str> {
        match &self.nodes[i].kind {
            Kind::Element { name, .. } => Some(name),
            _ => None,
        }
    }

    pub fn is(&self, i: usize, name: &str) -> bool {
        self.name(i) == Some(name)
    }

    /// The name without its namespace prefix (`w:p` gives `p`).
    pub fn local(&self, i: usize) -> Option<&str> {
        self.name(i).map(|n| n.rsplit(':').next().unwrap_or(n))
    }

    pub fn attr(&self, i: usize, name: &str) -> Option<&str> {
        match &self.nodes[i].kind {
            Kind::Element { attrs, .. } => attrs.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str()),
            _ => None,
        }
    }

    /// An attribute by its local name, whatever its prefix (`w:val` or `val`).
    pub fn attr_local(&self, i: usize, local: &str) -> Option<&str> {
        match &self.nodes[i].kind {
            Kind::Element { attrs, .. } => attrs.iter().find(|(k, _)| k == local || k.rsplit(':').next() == Some(local)).map(|(_, v)| v.as_str()),
            _ => None,
        }
    }

    pub fn attrs(&self, i: usize) -> &[(String, String)] {
        match &self.nodes[i].kind {
            Kind::Element { attrs, .. } => attrs,
            _ => &[],
        }
    }

    pub fn has_attr(&self, i: usize, name: &str) -> bool {
        self.attr(i, name).is_some()
    }

    pub fn parent(&self, i: usize) -> Option<usize> {
        self.nodes[i].parent
    }

    pub fn children(&self, i: usize) -> &[usize] {
        &self.nodes[i].children
    }

    pub fn element_children(&self, i: usize) -> impl Iterator<Item = usize> + '_ {
        self.nodes[i].children.iter().copied().filter(move |&c| matches!(self.nodes[c].kind, Kind::Element { .. }))
    }

    pub fn line(&self, i: usize) -> u32 {
        self.nodes[i].line
    }

    /// Every element, in document order.
    pub fn elements(&self) -> Vec<usize> {
        let mut out = Vec::new();
        let mut stack = vec![0usize];
        while let Some(i) = stack.pop() {
            if matches!(self.nodes[i].kind, Kind::Element { .. }) {
                out.push(i);
            }
            for &c in self.nodes[i].children.iter().rev() {
                stack.push(c);
            }
        }
        out
    }

    /// Every element under `i` (not `i` itself), in document order.
    pub fn descendants(&self, i: usize) -> Vec<usize> {
        let mut out = Vec::new();
        let mut stack: Vec<usize> = self.nodes[i].children.iter().rev().copied().collect();
        while let Some(n) = stack.pop() {
            if matches!(self.nodes[n].kind, Kind::Element { .. }) {
                out.push(n);
            }
            for &c in self.nodes[n].children.iter().rev() {
                stack.push(c);
            }
        }
        out
    }

    /// The first element of this name, in document order.
    pub fn find(&self, name: &str) -> Option<usize> {
        self.elements().into_iter().find(|&i| self.is(i, name))
    }

    pub fn find_all(&self, name: &str) -> Vec<usize> {
        self.elements().into_iter().filter(|&i| self.is(i, name)).collect()
    }

    /// The first element under `i` of this name.
    pub fn find_in(&self, i: usize, name: &str) -> Option<usize> {
        self.descendants(i).into_iter().find(|&n| self.is(n, name))
    }

    pub fn find_all_in(&self, i: usize, name: &str) -> Vec<usize> {
        self.descendants(i).into_iter().filter(|&n| self.is(n, name)).collect()
    }

    pub fn ancestors(&self, i: usize) -> impl Iterator<Item = usize> + '_ {
        std::iter::successors(self.nodes[i].parent, move |&p| self.nodes[p].parent)
    }

    pub fn has_ancestor(&self, i: usize, name: &str) -> bool {
        self.ancestors(i).any(|a| self.is(a, name))
    }

    /// All the text under a node, joined, with runs of white space made one space and trimmed.
    pub fn text(&self, i: usize) -> String {
        let mut s = String::new();
        self.collect_text(i, &mut s);
        squash(&s)
    }

    fn collect_text(&self, i: usize, s: &mut String) {
        match &self.nodes[i].kind {
            Kind::Text(t) => s.push_str(t),
            _ => {
                for &c in &self.nodes[i].children {
                    self.collect_text(c, s);
                }
            }
        }
    }

    /// All the text under a node, as written (for a `style` element's sheet).
    pub fn text_raw(&self, i: usize) -> String {
        let mut s = String::new();
        self.collect_text(i, &mut s);
        s
    }

    /// The text directly in an element (not in its child elements), squashed.
    pub fn own_text(&self, i: usize) -> String {
        let mut s = String::new();
        for &c in &self.nodes[i].children {
            if let Kind::Text(t) = &self.nodes[c].kind {
                s.push_str(t);
                s.push(' ');
            }
        }
        squash(&s)
    }

    /// The element's place, such as `html/body/main/p[2]/a[1]`: each step is the name and, in brackets, which one of
    /// that name it is under its parent, from 1.
    pub fn path(&self, i: usize) -> String {
        let mut steps = Vec::new();
        let mut n = i;
        while let Some(name) = self.name(n) {
            let parent = self.nodes[n].parent.unwrap_or(0);
            let same: Vec<usize> = self.element_children(parent).filter(|&c| self.is(c, name)).collect();
            let pos = same.iter().position(|&c| c == n).unwrap_or(0) + 1;
            steps.push(if same.len() > 1 || name != "html" && name != "body" && name != "head" { format!("{name}[{pos}]") } else { name.to_string() });
            n = parent;
        }
        steps.reverse();
        steps.join("/")
    }
}

/// White space made single spaces, trimmed.
pub fn squash(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

struct Builder<'a> {
    src: &'a str,
    b: &'a [u8],
    pos: usize,
    line: u32,
    xml: bool,
    dom: Dom,
    stack: Vec<usize>,
}

impl<'a> Builder<'a> {
    fn new(src: &'a str, xml: bool) -> Builder<'a> {
        let root = Node { kind: Kind::Document, parent: None, children: Vec::new(), line: 1 };
        Builder { src, b: src.as_bytes(), pos: 0, line: 1, xml, dom: Dom { nodes: vec![root], truncated: false }, stack: vec![0] }
    }

    fn run(mut self) -> Dom {
        while self.pos < self.b.len() {
            if self.dom.nodes.len() >= MAX_NODES {
                self.dom.truncated = true;
                break;
            }
            if self.b[self.pos] == b'<' {
                self.tag();
            } else {
                let end = self.src[self.pos..].find('<').map(|e| self.pos + e).unwrap_or(self.b.len());
                let text = decode(&self.src[self.pos..end]);
                self.text(text);
                self.advance(end);
            }
        }
        self.dom
    }

    fn advance(&mut self, to: usize) {
        let to = to.min(self.b.len());
        self.line += self.b[self.pos..to].iter().filter(|&&c| c == b'\n').count() as u32;
        self.pos = to;
    }

    fn starts(&self, s: &str) -> bool {
        self.b.len() >= self.pos + s.len() && self.b[self.pos..self.pos + s.len()].eq_ignore_ascii_case(s.as_bytes())
    }

    fn skip_past(&mut self, end: &str) {
        let to = self.src[self.pos..].find(end).map(|e| self.pos + e + end.len()).unwrap_or(self.b.len());
        self.advance(to);
    }

    fn tag(&mut self) {
        if self.starts("<!--") {
            self.skip_past("-->");
        } else if self.starts("<![CDATA[") {
            let start = self.pos + 9;
            let end = self.src[start..].find("]]>").map(|e| start + e).unwrap_or(self.b.len());
            let text = self.src[start..end].to_string();
            self.text(text);
            self.advance((end + 3).min(self.b.len()));
        } else if self.starts("<!") || self.starts("<?") {
            self.skip_past(">");
        } else if self.starts("</") {
            let start = self.pos + 2;
            let mut e = start;
            while e < self.b.len() && !self.b[e].is_ascii_whitespace() && self.b[e] != b'>' {
                e += 1;
            }
            let name = self.src[start..e].to_ascii_lowercase();
            self.skip_past(">");
            self.end_tag(&name);
        } else if self.pos + 1 < self.b.len() && self.b[self.pos + 1].is_ascii_alphabetic() {
            self.start_tag();
        } else {
            self.text("<".to_string());
            self.advance(self.pos + 1);
        }
    }

    fn start_tag(&mut self) {
        let line = self.line;
        let mut p = self.pos + 1;
        while p < self.b.len() && !self.b[p].is_ascii_whitespace() && self.b[p] != b'>' && self.b[p] != b'/' {
            p += 1;
        }
        let name = self.src[self.pos + 1..p].to_ascii_lowercase();
        let mut attrs: Vec<(String, String)> = Vec::new();
        let mut self_closed = false;
        loop {
            while p < self.b.len() && self.b[p].is_ascii_whitespace() {
                p += 1;
            }
            if p >= self.b.len() {
                break;
            }
            if self.b[p] == b'>' {
                p += 1;
                break;
            }
            if self.b[p] == b'/' {
                if p + 1 < self.b.len() && self.b[p + 1] == b'>' {
                    self_closed = true;
                    p += 2;
                    break;
                }
                p += 1;
                continue;
            }
            let ns = p;
            while p < self.b.len() && !self.b[p].is_ascii_whitespace() && !matches!(self.b[p], b'=' | b'>' | b'/') {
                p += 1;
            }
            let an = self.src[ns..p].to_ascii_lowercase();
            while p < self.b.len() && self.b[p].is_ascii_whitespace() {
                p += 1;
            }
            let mut value = String::new();
            if p < self.b.len() && self.b[p] == b'=' {
                p += 1;
                while p < self.b.len() && self.b[p].is_ascii_whitespace() {
                    p += 1;
                }
                if p < self.b.len() && (self.b[p] == b'"' || self.b[p] == b'\'') {
                    let q = self.b[p];
                    let vs = p + 1;
                    let ve = self.b[vs..].iter().position(|&c| c == q).map(|e| vs + e).unwrap_or(self.b.len());
                    value = decode(&self.src[vs..ve]);
                    p = (ve + 1).min(self.b.len());
                } else {
                    let vs = p;
                    while p < self.b.len() && !self.b[p].is_ascii_whitespace() && self.b[p] != b'>' {
                        p += 1;
                    }
                    value = decode(&self.src[vs..p]);
                }
            }
            if !an.is_empty() && !attrs.iter().any(|(k, _)| *k == an) {
                attrs.push((an, value));
            }
        }
        self.advance(p);
        if !self.xml {
            self.implied_ends(&name);
        }
        let node = self.push_node(Kind::Element { name: name.clone(), attrs }, line);
        let empty = self_closed || (!self.xml && VOID.contains(&name.as_str()));
        if empty {
            return;
        }
        if !self.xml && (RAW.contains(&name.as_str()) || RCDATA.contains(&name.as_str())) {
            let close = format!("</{name}");
            let lower = self.src[self.pos..].to_ascii_lowercase();
            let end = lower.find(&close).map(|e| self.pos + e).unwrap_or(self.b.len());
            let raw = &self.src[self.pos..end];
            let text = if RCDATA.contains(&name.as_str()) { decode(raw) } else { raw.to_string() };
            if !text.is_empty() {
                let t = Node { kind: Kind::Text(text), parent: Some(node), children: Vec::new(), line: self.line };
                self.dom.nodes.push(t);
                let ti = self.dom.nodes.len() - 1;
                self.dom.nodes[node].children.push(ti);
            }
            self.advance(end);
            self.skip_past(">");
            return;
        }
        if self.stack.len() < MAX_DEPTH {
            self.stack.push(node);
        } else {
            self.dom.truncated = true;
        }
    }

    fn push_node(&mut self, kind: Kind, line: u32) -> usize {
        let parent = *self.stack.last().unwrap_or(&0);
        self.dom.nodes.push(Node { kind, parent: Some(parent), children: Vec::new(), line });
        let i = self.dom.nodes.len() - 1;
        self.dom.nodes[parent].children.push(i);
        i
    }

    fn text(&mut self, text: String) {
        if text.is_empty() {
            return;
        }
        let parent = *self.stack.last().unwrap_or(&0);
        if let Some(&last) = self.dom.nodes[parent].children.last() {
            if let Kind::Text(t) = &mut self.dom.nodes[last].kind {
                t.push_str(&text);
                return;
            }
        }
        let line = self.line;
        self.push_node(Kind::Text(text), line);
    }

    fn open_in_scope(&self, name: &str, boundaries: &[&str]) -> Option<usize> {
        for (depth, &n) in self.stack.iter().enumerate().rev() {
            let Some(nn) = self.dom.name(n) else { break };
            if nn == name {
                return Some(depth);
            }
            if boundaries.contains(&nn) {
                return None;
            }
        }
        None
    }

    fn close_to(&mut self, depth: usize) {
        self.stack.truncate(depth.max(1));
    }

    fn implied_ends(&mut self, name: &str) {
        if CLOSES_P.contains(&name) {
            if let Some(d) = self.open_in_scope("p", SCOPE) {
                self.close_to(d);
            }
        }
        if name.len() == 2 && name.starts_with('h') && name.as_bytes()[1].is_ascii_digit() {
            if let Some(&top) = self.stack.last() {
                if let Some(t) = self.dom.name(top) {
                    if t.len() == 2 && t.starts_with('h') && t.as_bytes()[1].is_ascii_digit() {
                        self.stack.pop();
                    }
                }
            }
        }
        let close_any = |b: &mut Self, names: &[&str], bounds: &[&str]| {
            for n in names {
                if let Some(d) = b.open_in_scope(n, bounds) {
                    b.close_to(d);
                    return;
                }
            }
        };
        match name {
            "li" => close_any(self, &["li"], &["ul", "ol", "menu"]),
            "dt" | "dd" => close_any(self, &["dt", "dd"], &["dl"]),
            "tr" => close_any(self, &["tr"], &["table", "thead", "tbody", "tfoot"]),
            "td" | "th" => close_any(self, &["td", "th"], &["tr", "table"]),
            "thead" | "tbody" | "tfoot" => close_any(self, &["thead", "tbody", "tfoot"], &["table"]),
            "option" => close_any(self, &["option"], &["select", "datalist", "optgroup"]),
            "optgroup" => close_any(self, &["optgroup", "option"], &["select"]),
            _ => {}
        }
    }

    fn end_tag(&mut self, name: &str) {
        for depth in (1..self.stack.len()).rev() {
            if self.dom.name(self.stack[depth]) == Some(name) {
                self.stack.truncate(depth);
                return;
            }
        }
    }
}

/// Character references: the five of XML, numeric ones, and the named ones most often met in text.
pub fn decode(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let after = &rest[amp + 1..];
        let end = after.find(';').filter(|&e| e <= 32);
        let Some(end) = end else {
            out.push('&');
            rest = after;
            continue;
        };
        let name = &after[..end];
        let ch = if let Some(num) = name.strip_prefix('#') {
            let v = if let Some(h) = num.strip_prefix('x').or_else(|| num.strip_prefix('X')) { u32::from_str_radix(h, 16).ok() } else { num.parse::<u32>().ok() };
            v.and_then(char::from_u32).map(|c| c.to_string())
        } else {
            named(name).map(str::to_string)
        };
        match ch {
            Some(c) => {
                out.push_str(&c);
                rest = &after[end + 1..];
            }
            None => {
                out.push('&');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

fn named(name: &str) -> Option<&'static str> {
    Some(match name {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        "nbsp" => "\u{a0}",
        "copy" => "©",
        "reg" => "®",
        "trade" => "™",
        "hellip" => "…",
        "mdash" => "\u{2014}",
        "ndash" => "–",
        "lsquo" => "‘",
        "rsquo" => "’",
        "ldquo" => "“",
        "rdquo" => "”",
        "bull" => "•",
        "middot" => "·",
        "times" => "×",
        "rarr" => "→",
        "larr" => "←",
        "deg" => "°",
        "shy" => "\u{ad}",
        "zwj" => "\u{200d}",
        "zwnj" => "\u{200c}",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_page_with_implied_ends() {
        let d = Dom::parse_html("<!doctype html><html lang=en><body><p>One<div>Two</div><ul><li>a<li>b</ul><img src=x.png alt=''><p>Three &amp; four</body></html>");
        assert_eq!(d.find("html").and_then(|h| d.attr(h, "lang")), Some("en"));
        assert_eq!(d.find_all("li").len(), 2);
        let div = d.find("div").unwrap();
        assert!(!d.has_ancestor(div, "p"), "a div ends the open p");
        let ps = d.find_all("p");
        assert_eq!(d.text(ps[1]), "Three & four");
        assert_eq!(d.path(ps[1]), "html/body/p[2]");
        assert_eq!(d.attr(d.find("img").unwrap(), "alt"), Some(""));
    }

    #[test]
    fn raw_text_and_xml_mode() {
        let d = Dom::parse_html("<style>p > a { color: red }</style><script>if (a < b) {}</script><p>x</p>");
        assert_eq!(d.text(d.find("style").unwrap()), "p > a { color: red }");
        assert_eq!(d.find_all("p").len(), 1);
        let x = Dom::parse_xml("<package><metadata><meta property=\"schema:accessMode\">textual</meta><dc:title>A</dc:title></metadata></package>");
        let meta = x.find("meta").unwrap();
        assert_eq!(x.text(meta), "textual");
        assert_eq!(x.local(x.find("dc:title").unwrap()), Some("title"));
    }

    #[test]
    fn entities() {
        assert_eq!(decode("a &lt;b&gt; &#65;&#x42; &bogus; & c"), "a <b> AB &bogus; & c");
    }
}
