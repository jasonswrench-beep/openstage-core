//! The checks of an EPUB 3: the package's title, language, contents list and accessibility details, then each
//! content document in reading order as a page, with the headings of the whole book as one outline.

use crate::dom::Dom;
use crate::html::{check_page, outline_rules, placeholder_title, lang_tag_ok, sheet_for, Heading, PageKind};
use crate::paths::{dir, resolve};
use crate::report::{Collector, Finding, Status, Where};
use crate::zip::Zip;

pub fn check(bytes: &[u8], c: &mut Collector) -> Result<u32, String> {
    let zip = Zip::open(bytes)?;
    let container = zip.text("META-INF/container.xml").map_err(|_| "it has no META-INF/container.xml, so it is not an EPUB".to_string())?;
    let cdom = Dom::parse_xml(&container);
    let opf_path = cdom
        .find_all("rootfile")
        .into_iter()
        .find(|&r| cdom.attr(r, "media-type").map_or(true, |m| m == "application/oebps-package+xml"))
        .and_then(|r| cdom.attr(r, "full-path"))
        .ok_or("its container.xml names no package file")?
        .to_string();
    let opf = zip.text(&opf_path)?;
    let pdom = Dom::parse_xml(&opf);
    let base = dir(&opf_path);
    let book = Where::file(&opf_path);

    // 2.4.2 and 3.1.1 for the book.
    c.check("page-title");
    let title = pdom.find("dc:title").map(|t| pdom.text(t)).unwrap_or_default();
    if title.is_empty() {
        c.found(Finding::new("page-title", Status::Fail, None, book.clone(), &[("what", "e-book".into())]));
    } else if placeholder_title(&title) {
        c.found(Finding::new("page-title", Status::Fail, Some("placeholder"), book.clone(), &[("what", "e-book".into()), ("title", title)]));
    }
    c.check("page-lang");
    let lang = pdom.find("dc:language").map(|t| pdom.text(t)).unwrap_or_default();
    if lang.is_empty() {
        c.found(Finding::new("page-lang", Status::Fail, None, book.clone(), &[("what", "e-book".into())]));
    } else if !lang_tag_ok(&lang) {
        c.found(Finding::new("page-lang", Status::Fail, Some("invalid"), book.clone(), &[("what", "e-book".into()), ("lang", lang)]));
    }

    // The accessibility details (EPUB Accessibility 1.1).
    c.check("ebook-metadata");
    let props: Vec<String> = pdom
        .find_all("meta")
        .into_iter()
        .filter_map(|m| pdom.attr(m, "property").or_else(|| pdom.attr(m, "name")).map(|p| p.to_ascii_lowercase()))
        .collect();
    let missing: Vec<&str> = [("schema:accessmode", "access mode"), ("schema:accessibilityfeature", "features"), ("schema:accessibilityhazard", "hazards"), ("schema:accessibilitysummary", "summary")]
        .iter()
        .filter(|(p, _)| !props.iter().any(|x| x == p))
        .map(|(_, w)| *w)
        .collect();
    if !missing.is_empty() {
        c.found(Finding::new("ebook-metadata", Status::Fail, None, book.clone(), &[("missing", missing.join(", "))]));
    }

    // The manifest and the reading order.
    let mut items = std::collections::BTreeMap::new();
    let mut nav = None;
    for it in pdom.find_all("item") {
        let (Some(id), Some(href)) = (pdom.attr(it, "id"), pdom.attr(it, "href")) else { continue };
        let Some(path) = resolve(&base, href) else { continue };
        if pdom.attr(it, "properties").map_or(false, |p| p.split_whitespace().any(|x| x == "nav")) {
            nav = Some(path.clone());
        }
        items.insert(id.to_string(), (path, pdom.attr(it, "media-type").unwrap_or("").to_string()));
    }
    let mut order: Vec<String> = Vec::new();
    for r in pdom.find_all("itemref") {
        if let Some((path, mt)) = pdom.attr(r, "idref").and_then(|id| items.get(id)) {
            if mt.contains("html") && !order.contains(path) {
                order.push(path.clone());
            }
        }
    }

    // 2.4.5: the contents list.
    c.check("bookmarks");
    let has_toc = nav.as_ref().and_then(|n| zip.text(n).ok()).map_or(false, |t| {
        let d = Dom::parse_xml(&t);
        d.find_all("nav").into_iter().any(|n| d.attr(n, "epub:type").map_or(false, |v| v.split_whitespace().any(|x| x == "toc")) && d.find_in(n, "li").is_some())
    });
    if !has_toc {
        c.found(Finding::new("bookmarks", Status::Fail, None, book.clone(), &[("what", "e-book".into())]));
    }

    let mut outline: Vec<Heading> = Vec::new();
    let mut files = 0;
    for path in &order {
        let text = match zip.text(path) {
            Ok(t) => t,
            Err(e) => {
                c.limit(&format!("A page of the e-book could not be read: {e}."));
                continue;
            }
        };
        files += 1;
        let dom = Dom::parse_xml(&text);
        let folder = dir(path);
        let load = |href: &str| resolve(&folder, href).and_then(|p| zip.text(&p).ok());
        let sheet = sheet_for(path, &dom, &load);
        let mut page = Collector::new("epub");
        check_page(path, &dom, &sheet, PageKind::Ebook, &mut page, &mut outline);
        c.absorb(page);
    }
    if order.is_empty() {
        c.limit("The e-book's reading order lists no pages.");
    }
    outline_rules(&outline, c);
    Ok(files + 1)
}
