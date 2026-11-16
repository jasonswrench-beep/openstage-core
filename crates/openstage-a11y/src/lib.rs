//! The OpenStage accessibility rules, A11Y-1 (`specs/a11y/A11Y-1.md` in openstage-core).
//!
//! Give it what a tool made (a web page, a folder of pages, an EPUB, a Word or PowerPoint file, a WebVTT captions
//! file) and it returns a [`Report`]: each rule's status, the findings with where they are and what to do, and the
//! checks only a person can make. Findings warn; nothing here stops anything. A project can turn chosen rules into
//! blockers of its own ([`Settings`]), and the lists are empty unless the author fills them.
//!
//! ```
//! let report = openstage_a11y::check_bytes("page.html", b"<html><title>Hi</title><p>Hello</p></html>", &Default::default()).unwrap();
//! assert_eq!(report.rules.iter().find(|r| r.rule == "page-lang").unwrap().status, openstage_a11y::Status::Fail);
//! ```

pub mod catalogue;
pub mod contrast;
pub mod css;
pub mod dom;
mod epub;
pub mod html;
mod ooxml;
pub mod paths;
pub mod report;
pub mod settings;
mod vtt;
pub mod zip;

pub use report::{ChecklistItem, Collector, Finding, Input, Report, RuleResult, Status, Summary, Where};
pub use settings::Settings;

use std::fmt;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct Options {
    /// The largest file read, in bytes.
    pub max_file_bytes: u64,
    /// The most pages read from a folder.
    pub max_files: usize,
}

impl Default for Options {
    fn default() -> Options {
        Options { max_file_bytes: 256 * 1024 * 1024, max_files: 5000 }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The file or folder could not be read.
    Read(String),
    /// It is not something these rules read.
    Unsupported(String),
    /// It looks like a kind these rules read, but it is damaged.
    Damaged(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Read(s) => write!(f, "could not be read: {s}"),
            Error::Unsupported(s) => write!(f, "is not something the accessibility rules read: {s}"),
            Error::Damaged(s) => write!(f, "could not be checked: {s}"),
        }
    }
}

impl std::error::Error for Error {}

/// Text from bytes: UTF-8 (or UTF-16 with a byte order mark), with the byte order mark left out.
pub fn text_of(b: &[u8]) -> String {
    if b.len() >= 2 && (b[0] == 0xFF && b[1] == 0xFE || b[0] == 0xFE && b[1] == 0xFF) {
        let le = b[0] == 0xFF;
        let units: Vec<u16> = b[2..].chunks_exact(2).map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) }).collect();
        return String::from_utf16_lossy(&units);
    }
    let b = b.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(b);
    String::from_utf8_lossy(b).into_owned()
}

/// What kind of file this is, by its name and then by its first bytes: `html`, `epub`, `docx`, `pptx`, `pdf` or `vtt`.
pub fn kind_of(name: &str, bytes: &[u8]) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    let by_name = match ext {
        "html" | "htm" | "xhtml" => Some("html"),
        "epub" => Some("epub"),
        "docx" | "docm" => Some("docx"),
        "pptx" | "pptm" => Some("pptx"),
        "pdf" => Some("pdf"),
        "vtt" => Some("vtt"),
        _ => None,
    };
    if by_name.is_some() {
        return by_name;
    }
    if bytes.starts_with(b"%PDF-") {
        return Some("pdf");
    }
    if bytes.starts_with(b"WEBVTT") || bytes.starts_with(b"\xEF\xBB\xBFWEBVTT") {
        return Some("vtt");
    }
    if bytes.starts_with(b"PK\x03\x04") {
        let z = zip::Zip::open(bytes).ok()?;
        if z.has("META-INF/container.xml") {
            return Some("epub");
        }
        if z.has("word/document.xml") {
            return Some("docx");
        }
        if z.has("ppt/presentation.xml") {
            return Some("pptx");
        }
        return None;
    }
    let head = text_of(&bytes[..bytes.len().min(2048)]).to_ascii_lowercase();
    if head.contains("<html") || head.contains("<!doctype html") {
        return Some("html");
    }
    None
}

/// Checks one file's bytes. A web page checked this way has no folder, so the style sheets it links to are not read
/// (the report says so); use [`check_path`] to read them.
pub fn check_bytes(name: &str, bytes: &[u8], options: &Options) -> Result<Report, Error> {
    check_with(name, bytes, options, &|_| None)
}

fn check_with(name: &str, bytes: &[u8], options: &Options, load: &dyn Fn(&str) -> Option<String>) -> Result<Report, Error> {
    if bytes.len() as u64 > options.max_file_bytes {
        return Err(Error::Read(format!("it is larger than {} MB", options.max_file_bytes / (1024 * 1024))));
    }
    let kind = kind_of(name, bytes).ok_or_else(|| Error::Unsupported("only web pages, EPUB, Word, PowerPoint, PDF and WebVTT files are read".into()))?;
    let file = name.rsplit(['/', '\\']).next().unwrap_or(name).to_string();
    let mut c = Collector::new(kind);
    let files = match kind {
        "html" => {
            let text = text_of(bytes);
            let dom = dom::Dom::parse_html(&text);
            let sheet = html::sheet_for(&file, &dom, load);
            let mut outline = Vec::new();
            html::check_page(&file, &dom, &sheet, html::PageKind::Web, &mut c, &mut outline);
            if dom.truncated {
                c.limit("The page is very large; only its first part was read.");
            }
            1
        }
        "epub" => epub::check(bytes, &mut c).map_err(Error::Damaged)?,
        "docx" => ooxml::check_docx(bytes, &mut c).map_err(Error::Damaged)?,
        "pptx" => ooxml::check_pptx(bytes, &mut c).map_err(Error::Damaged)?,
        "vtt" => {
            vtt::check(&file, &text_of(bytes), &mut c);
            1
        }
        "pdf" => {
            pdf_not_yet(&mut c);
            1
        }
        _ => unreachable!(),
    };
    Ok(c.finish(Input { name: file, kind: kind.to_string(), files }))
}

fn pdf_not_yet(c: &mut Collector) {
    let why = "This version of the engine does not read PDFs yet (A11Y-1 section 6.6); PDF Remediator checks them.";
    for r in &catalogue::catalogue().rules {
        if !r.is_person() && r.applies_to("pdf") {
            c.not_tested(&r.id, why);
        }
    }
    c.limit(why);
    c.ask("reading-order");
    c.ask("alt-meaning");
    c.ask("color-only");
}

/// Checks a file, or a folder of web pages (a help site): every `.html`, `.htm` and `.xhtml` file in it, with the
/// style sheets they link to inside the folder.
pub fn check_path(path: &Path, options: &Options) -> Result<Report, Error> {
    if path.is_dir() {
        return check_site(path, options);
    }
    let bytes = read_limited(path, options.max_file_bytes)?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let folder = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let max = options.max_file_bytes;
    let load = move |href: &str| -> Option<String> {
        let rel = paths::resolve("", href)?;
        read_limited(&folder.join(rel), max.min(16 * 1024 * 1024)).ok().map(|b| text_of(&b))
    };
    check_with(&name, &bytes, options, &load)
}

fn read_limited(path: &Path, max: u64) -> Result<Vec<u8>, Error> {
    let meta = std::fs::metadata(path).map_err(|e| Error::Read(e.to_string()))?;
    if meta.len() > max {
        return Err(Error::Read(format!("it is larger than {} MB", max / (1024 * 1024))));
    }
    std::fs::read(path).map_err(|e| Error::Read(e.to_string()))
}

fn check_site(root: &Path, options: &Options) -> Result<Report, Error> {
    let mut pages: Vec<String> = Vec::new();
    let mut stack = vec![(root.to_path_buf(), String::new(), 0u32)];
    let mut cut = false;
    while let Some((dir, rel, depth)) = stack.pop() {
        let mut entries: Vec<_> = std::fs::read_dir(&dir).map_err(|e| Error::Read(e.to_string()))?.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let name = e.file_name().to_string_lossy().into_owned();
            let child = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                if depth < 16 && !name.starts_with('.') && name != "node_modules" {
                    stack.push((e.path(), child, depth + 1));
                }
            } else if matches!(name.rsplit('.').next().map(|x| x.to_ascii_lowercase()).as_deref(), Some("html" | "htm" | "xhtml")) {
                if pages.len() >= options.max_files {
                    cut = true;
                } else {
                    pages.push(child);
                }
            }
        }
    }
    pages.sort();
    let mut c = Collector::new("html");
    for page in &pages {
        let full = root.join(page);
        let bytes = match read_limited(&full, options.max_file_bytes) {
            Ok(b) => b,
            Err(e) => {
                c.limit(&format!("{page} {e}."));
                continue;
            }
        };
        let text = text_of(&bytes);
        let dom = dom::Dom::parse_html(&text);
        let folder = paths::dir(page);
        let load = |href: &str| -> Option<String> {
            let rel = paths::resolve(&folder, href)?;
            read_limited(&root.join(rel), 16 * 1024 * 1024).ok().map(|b| text_of(&b))
        };
        let sheet = html::sheet_for(page, &dom, &load);
        let mut one = Collector::new("html");
        let mut outline = Vec::new();
        html::check_page(page, &dom, &sheet, html::PageKind::Web, &mut one, &mut outline);
        c.absorb(one);
    }
    if cut {
        c.limit(&format!("Only the first {} pages were checked.", options.max_files));
    }
    let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut report = c.finish(Input { name, kind: "site".into(), files: pages.len() as u32 });
    if pages.is_empty() {
        report.limits.push("The folder has no web pages.".into());
    }
    Ok(report)
}
