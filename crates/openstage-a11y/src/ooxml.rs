//! The checks of a Word file (.docx) and a PowerPoint file (.pptx).

use crate::contrast::{hex, minimum_words, parse_css_color, ratio_words, text_contrast, Rgb, Weight};
use crate::dom::{squash, Dom};
use crate::html::{lang_tag_ok, outline_rules, placeholder_alt, placeholder_title, Heading};
use crate::paths::{dir, resolve};
use crate::report::{Collector, Finding, Status, Where};
use crate::zip::Zip;
use std::collections::BTreeMap;

const VAGUE: &[&str] = &["here", "click here", "click", "more", "read more", "learn more", "more info", "info", "link", "this link", "this", "details", "go"];

fn xml(zip: &Zip, name: &str) -> Option<Dom> {
    zip.text(name).ok().map(|t| Dom::parse_xml(&t))
}

/// Where a relationship of type `kind` in a `.rels` part points, as a path in the archive.
fn rel_target(zip: &Zip, rels: &str, source_dir: &str, kind_suffix: &str) -> Option<String> {
    let d = xml(zip, rels)?;
    d.find_all("relationship")
        .into_iter()
        .find(|&r| d.attr(r, "type").map_or(false, |t| t.ends_with(kind_suffix)))
        .and_then(|r| d.attr(r, "target"))
        .and_then(|t| resolve(source_dir, t))
}

fn rels_map(zip: &Zip, rels: &str, source_dir: &str) -> BTreeMap<String, String> {
    let mut m = BTreeMap::new();
    if let Some(d) = xml(zip, rels) {
        for r in d.find_all("relationship") {
            if let (Some(id), Some(t)) = (d.attr(r, "id"), d.attr(r, "target")) {
                if let Some(p) = resolve(source_dir, t) {
                    m.insert(id.to_string(), p);
                }
            }
        }
    }
    m
}

fn core_title(zip: &Zip, c: &mut Collector, what: &str) {
    c.check("page-title");
    let at = Where::file("docProps/core.xml");
    let title = xml(zip, "docProps/core.xml").and_then(|d| d.find("dc:title").map(|t| d.text(t))).unwrap_or_default();
    if title.is_empty() {
        c.found(Finding::new("page-title", Status::Fail, None, at, &[("what", what.into())]));
    } else if placeholder_title(&title) {
        c.found(Finding::new("page-title", Status::Fail, Some("placeholder"), at, &[("what", what.into()), ("title", title)]));
    }
}

fn lang_finding(c: &mut Collector, lang: Option<String>, at: Where, what: &str) {
    c.check("page-lang");
    match lang {
        None => c.found(Finding::new("page-lang", Status::Fail, None, at, &[("what", what.into())])),
        Some(l) if !lang_tag_ok(&l) => c.found(Finding::new("page-lang", Status::Fail, Some("invalid"), at, &[("what", what.into()), ("lang", l)])),
        _ => {}
    }
}

fn true_flag(d: &Dom, n: usize) -> bool {
    d.attr_local(n, "val").map_or(true, |v| !matches!(v, "0" | "false" | "off"))
}

fn ooxml_hex(v: &str) -> Option<Rgb> {
    if v.len() == 6 && v.chars().all(|c| c.is_ascii_hexdigit()) {
        parse_css_color(&format!("#{v}")).map(|c| c.rgb)
    } else {
        None
    }
}

/// A picture, chart or diagram's description, by its `docPr` (Word) or `cNvPr` (PowerPoint) element.
fn picture_alt(d: &Dom, pr: usize, file: &str, slide: Option<u32>, c: &mut Collector) -> bool {
    let decorative = d.descendants(pr).into_iter().any(|e| d.local(e) == Some("decorative") && d.attr_local(e, "val").map_or(false, |v| v == "1" || v == "true"));
    let at = Where { file: Some(file.into()), id: d.attr(pr, "id").map(str::to_string), object: d.attr(pr, "name").map(str::to_string), slide, ..Where::default() };
    if decorative {
        return false;
    }
    c.check("alt-missing");
    let alt = squash(d.attr(pr, "descr").unwrap_or(""));
    let alt = if alt.is_empty() { squash(d.attr(pr, "title").unwrap_or("")) } else { alt };
    if alt.is_empty() {
        c.found(Finding::new("alt-missing", Status::Fail, None, at, &[]));
        return false;
    }
    c.check("alt-weak");
    let lower = alt.to_lowercase();
    if placeholder_alt(&alt, d.attr(pr, "name")) {
        c.found(Finding::new("alt-weak", Status::Fail, None, at, &[("alt", alt)]));
    } else if lower.contains("description automatically generated") {
        c.found(Finding::new("alt-weak", Status::NeedsReview, None, at, &[("alt", alt)]));
    }
    true
}

#[derive(Debug, Clone, Default)]
struct WStyle {
    name: String,
    based_on: Option<String>,
    outline: Option<u8>,
    color: Option<String>,
    size: Option<u32>,
    bold: Option<bool>,
    shading: Option<Rgb>,
}

fn run_props(d: &Dom, rpr: usize, s: &mut WStyle) {
    for p in d.element_children(rpr) {
        match d.local(p) {
            Some("color") => s.color = d.attr_local(p, "val").map(str::to_string),
            Some("sz") => s.size = d.attr_local(p, "val").and_then(|v| v.parse().ok()),
            Some("b") => s.bold = Some(true_flag(d, p)),
            Some("shd") => s.shading = d.attr_local(p, "fill").and_then(ooxml_hex),
            Some("highlight") => s.shading = d.attr_local(p, "val").and_then(highlight),
            _ => {}
        }
    }
}

fn highlight(v: &str) -> Option<Rgb> {
    Some(match v {
        "yellow" => [255, 255, 0],
        "green" => [0, 255, 0],
        "cyan" => [0, 255, 255],
        "magenta" => [255, 0, 255],
        "blue" => [0, 0, 255],
        "red" => [255, 0, 0],
        "darkBlue" => [0, 0, 128],
        "darkCyan" => [0, 128, 128],
        "darkGreen" => [0, 128, 0],
        "darkMagenta" => [128, 0, 128],
        "darkRed" => [128, 0, 0],
        "darkYellow" => [128, 128, 0],
        "darkGray" => [128, 128, 128],
        "lightGray" => [192, 192, 192],
        "black" => [0, 0, 0],
        "white" => [255, 255, 255],
        _ => return None,
    })
}

struct Styles {
    map: BTreeMap<String, WStyle>,
    defaults: WStyle,
}

impl Styles {
    fn chain(&self, id: Option<&str>) -> Vec<&WStyle> {
        let mut out = Vec::new();
        let mut cur = id.map(str::to_string);
        while let Some(i) = cur {
            let Some(s) = self.map.get(&i) else { break };
            if out.len() > 12 {
                break;
            }
            out.push(s);
            cur = s.based_on.clone();
        }
        out
    }

    fn heading_level(&self, id: Option<&str>) -> Option<u8> {
        for s in self.chain(id) {
            if let Some(l) = s.outline {
                return if l < 9 { Some(l + 1) } else { None };
            }
            let n = s.name.to_ascii_lowercase();
            if n == "title" {
                return Some(1);
            }
            if let Some(k) = n.strip_prefix("heading ").and_then(|k| k.parse::<u8>().ok()) {
                return Some(k);
            }
        }
        None
    }
}

fn read_styles(zip: &Zip, path: &str) -> Styles {
    let mut map = BTreeMap::new();
    let mut defaults = WStyle::default();
    if let Some(d) = xml(zip, path) {
        for s in d.find_all("w:style") {
            let Some(id) = d.attr_local(s, "styleid") else { continue };
            let mut st = WStyle::default();
            for p in d.element_children(s) {
                match d.local(p) {
                    Some("name") => st.name = d.attr_local(p, "val").unwrap_or("").to_string(),
                    Some("basedon") => st.based_on = d.attr_local(p, "val").map(str::to_string),
                    Some("ppr") => {
                        if let Some(o) = d.element_children(p).find(|&x| d.local(x) == Some("outlinelvl")) {
                            st.outline = d.attr_local(o, "val").and_then(|v| v.parse().ok());
                        }
                    }
                    Some("rpr") => run_props(&d, p, &mut st),
                    _ => {}
                }
            }
            map.insert(id.to_string(), st);
        }
        if let Some(rpr) = d.find("w:rprdefault").and_then(|r| d.element_children(r).find(|&x| d.local(x) == Some("rpr"))) {
            run_props(&d, rpr, &mut defaults);
        }
    }
    Styles { map, defaults }
}

fn style_id<'a>(d: &'a Dom, pr: Option<usize>, tag: &str) -> Option<&'a str> {
    pr.and_then(|p| d.element_children(p).find(|&x| d.local(x) == Some(tag))).and_then(|s| d.attr_local(s, "val"))
}

pub fn check_docx(bytes: &[u8], c: &mut Collector) -> Result<u32, String> {
    let zip = Zip::open(bytes)?;
    let main = rel_target(&zip, "_rels/.rels", "", "/officeDocument").unwrap_or_else(|| "word/document.xml".to_string());
    let doc_text = zip.text(&main).map_err(|_| "it has no main document part, so it is not a Word file".to_string())?;
    let d = Dom::parse_xml(&doc_text);
    let word = dir(&main);
    let styles = read_styles(&zip, &format!("{word}/styles.xml"));
    let rels = rels_map(&zip, &format!("{word}/_rels/{}.rels", main.rsplit('/').next().unwrap_or("document.xml")), &word);
    let _ = rels;
    core_title(&zip, c, "Word file");

    // 3.1.1: the document's language, from the default run properties or the settings.
    let lang = xml(&zip, &format!("{word}/styles.xml"))
        .and_then(|s| s.find("w:rprdefault").and_then(|r| s.find_in(r, "w:lang")).and_then(|l| s.attr_local(l, "val").map(str::to_string)))
        .or_else(|| xml(&zip, &format!("{word}/settings.xml")).and_then(|s| s.find("w:themefontlang").and_then(|l| s.attr_local(l, "val").map(str::to_string))));
    lang_finding(c, lang, Where::file(&format!("{word}/styles.xml")), "Word file");

    let page_bg = d.find("w:background").and_then(|b| d.attr_local(b, "color")).and_then(ooxml_hex).unwrap_or([255, 255, 255]);
    let mut outline: Vec<Heading> = Vec::new();
    let mut pictures = false;
    let paragraphs = d.find_all("w:p");
    for (pi, &p) in paragraphs.iter().enumerate() {
        let ppr = d.element_children(p).find(|&x| d.local(x) == Some("ppr"));
        let pstyle = style_id(&d, ppr, "pstyle");
        let direct = ppr.and_then(|pp| d.element_children(pp).find(|&x| d.local(x) == Some("outlinelvl"))).and_then(|o| d.attr_local(o, "val")).and_then(|v| v.parse::<u8>().ok());
        let level = match direct {
            Some(l) if l < 9 => Some(l + 1),
            Some(_) => None,
            None => styles.heading_level(pstyle),
        };
        let at = Where { file: Some(main.clone()), object: Some(format!("paragraph {}", pi + 1)), ..Where::default() };
        let text = squash(&d.find_all_in(p, "w:t").into_iter().map(|t| d.text_raw(t)).collect::<String>());
        if let Some(level) = level {
            c.check("heading-empty");
            if text.is_empty() {
                c.found(Finding::new("heading-empty", Status::Fail, None, at.clone(), &[]));
            }
            outline.push(Heading { level, at: at.clone() });
        }
        // 1.4.3: each run with a colour of its own.
        let para_shd = ppr.and_then(|pp| d.element_children(pp).find(|&x| d.local(x) == Some("shd"))).and_then(|s| d.attr_local(s, "fill")).and_then(ooxml_hex);
        let cell_shd = d.ancestors(p).find(|&a| d.local(a) == Some("tc")).and_then(|tc| d.element_children(tc).find(|&x| d.local(x) == Some("tcpr"))).and_then(|pr| d.element_children(pr).find(|&x| d.local(x) == Some("shd"))).and_then(|s| d.attr_local(s, "fill")).and_then(ooxml_hex);
        for r in d.element_children(p).flat_map(|x| if d.local(x) == Some("hyperlink") { d.element_children(x).collect::<Vec<_>>() } else { vec![x] }).filter(|&x| d.local(x) == Some("r")) {
            let run_text: String = d.element_children(r).filter(|&t| d.local(t) == Some("t")).map(|t| d.text_raw(t)).collect();
            if run_text.trim().is_empty() {
                continue;
            }
            let rpr = d.element_children(r).find(|&x| d.local(x) == Some("rpr"));
            let mut eff = styles.defaults.clone();
            let mut layers: Vec<&WStyle> = styles.chain(pstyle);
            layers.reverse();
            let rstyle = style_id(&d, rpr, "rstyle");
            let mut rlayers = styles.chain(rstyle);
            rlayers.reverse();
            for s in layers.into_iter().chain(rlayers) {
                if s.color.is_some() { eff.color = s.color.clone(); }
                if s.size.is_some() { eff.size = s.size; }
                if s.bold.is_some() { eff.bold = s.bold; }
                if s.shading.is_some() { eff.shading = s.shading; }
            }
            let mut own = WStyle::default();
            if let Some(rp) = rpr {
                run_props(&d, rp, &mut own);
            }
            if own.color.is_some() { eff.color = own.color; }
            if own.size.is_some() { eff.size = own.size; }
            if own.bold.is_some() { eff.bold = own.bold; }
            if own.shading.is_some() { eff.shading = own.shading; }
            let Some(fg) = eff.color.as_deref().and_then(ooxml_hex) else { continue };
            let bg = eff.shading.or(para_shd).or(cell_shd).unwrap_or(page_bg);
            c.check("contrast-text");
            let size_pt = eff.size.unwrap_or(22) as f64 / 2.0;
            let w = if eff.bold == Some(true) { Weight::Bold } else { Weight::Normal };
            let res = text_contrast(fg, bg, size_pt, w);
            if res.status != Status::Pass {
                let size = if res.large { "large" } else { "normal" };
                let params = [("foreground", hex(fg)), ("background", hex(bg)), ("ratio", ratio_words(res.ratio)), ("minimum", minimum_words(res.minimum)), ("size", size.to_string())];
                c.found_grouped(format!("docx {} {} {size}", hex(fg), hex(bg)), Finding::new("contrast-text", res.status, res.variant, at.clone(), &params));
            }
        }
    }
    outline_rules(&outline, c);

    // 1.1.1: pictures, charts and diagrams.
    for pr in d.find_all("wp:docpr") {
        let holder = d.parent(pr);
        let uri = holder.and_then(|h| d.find_in(h, "a:graphicdata")).and_then(|g| d.attr(g, "uri")).unwrap_or("");
        if uri.ends_with("/picture") || uri.ends_with("/chart") || uri.ends_with("/diagram") || uri.contains("chartex") {
            pictures |= picture_alt(&d, pr, &main, None, c);
        }
    }
    for shape in d.find_all("v:shape") {
        if d.find_in(shape, "v:imagedata").is_some() {
            c.check("alt-missing");
            let alt = d.attr(shape, "alt").map(squash).unwrap_or_default();
            if alt.is_empty() {
                c.found(Finding::new("alt-missing", Status::Fail, None, Where { file: Some(main.clone()), id: d.attr(shape, "id").map(str::to_string), ..Where::default() }, &[]));
            } else {
                pictures = true;
            }
        }
    }

    // 1.3.1: tables.
    for (ti, t) in d.find_all("w:tbl").into_iter().enumerate() {
        let rows: Vec<usize> = d.element_children(t).filter(|&r| d.local(r) == Some("tr")).collect();
        let cols = rows.iter().map(|&r| d.element_children(r).filter(|&x| d.local(x) == Some("tc")).count()).max().unwrap_or(0);
        if rows.len() < 2 || cols < 2 {
            continue;
        }
        c.check("table-headers");
        let header = d.element_children(rows[0]).find(|&x| d.local(x) == Some("trpr")).and_then(|pr| d.element_children(pr).find(|&x| d.local(x) == Some("tblheader"))).map_or(false, |h| true_flag(&d, h));
        if !header {
            c.found(Finding::new("table-headers", Status::Fail, None, Where { file: Some(main.clone()), object: Some(format!("table {}", ti + 1)), ..Where::default() }, &[]));
        }
    }

    // 2.4.4: links.
    for (li, h) in d.find_all("w:hyperlink").into_iter().enumerate() {
        let text = squash(&d.find_all_in(h, "w:t").into_iter().map(|t| d.text_raw(t)).collect::<String>());
        let alt = d.find_in(h, "wp:docpr").and_then(|p| d.attr(p, "descr")).map(squash).unwrap_or_default();
        let at = Where { file: Some(main.clone()), object: Some(format!("link {}", li + 1)), ..Where::default() };
        c.check("link-name");
        if text.is_empty() && alt.is_empty() {
            c.found(Finding::new("link-name", Status::Fail, None, at, &[]));
        } else if !text.is_empty() {
            c.check("link-vague");
            let plain: String = text.to_lowercase().chars().filter(|ch| ch.is_alphanumeric() || ch.is_whitespace()).collect();
            if VAGUE.contains(&squash(&plain).as_str()) {
                c.found(Finding::new("link-vague", Status::NeedsReview, None, at, &[("text", text)]));
            }
        }
    }

    c.ask("reading-order");
    c.ask("color-only");
    if pictures {
        c.ask("alt-meaning");
    }
    Ok(1)
}

fn has_title(d: &Dom) -> bool {
    d.find_all("p:sp").into_iter().any(|sp| {
        let ph = d.find_in(sp, "p:ph");
        let is_title = ph.map_or(false, |p| matches!(d.attr(p, "type"), Some("title") | Some("ctrTitle")));
        is_title && !squash(&d.find_all_in(sp, "a:t").into_iter().map(|t| d.text_raw(t)).collect::<String>()).is_empty()
    })
}

fn solid(d: &Dom, n: usize) -> Option<Rgb> {
    d.element_children(n).find(|&x| d.local(x) == Some("solidfill")).and_then(|f| d.element_children(f).next()).and_then(|clr| {
        if d.local(clr) == Some("srgbclr") {
            d.attr(clr, "val").and_then(ooxml_hex)
        } else {
            None
        }
    })
}

pub fn check_pptx(bytes: &[u8], c: &mut Collector) -> Result<u32, String> {
    let zip = Zip::open(bytes)?;
    let main = rel_target(&zip, "_rels/.rels", "", "/officeDocument").unwrap_or_else(|| "ppt/presentation.xml".to_string());
    let pres = xml(&zip, &main).ok_or("it has no presentation part, so it is not a PowerPoint file")?;
    let ppt = dir(&main);
    let rels = rels_map(&zip, &format!("{ppt}/_rels/{}.rels", main.rsplit('/').next().unwrap_or("presentation.xml")), &ppt);
    core_title(&zip, c, "presentation");
    let slides: Vec<String> = pres.find_all("p:sldid").into_iter().filter_map(|s| pres.attr(s, "r:id").and_then(|id| rels.get(id)).cloned()).collect();
    let mut lang = pres.find_all("a:defrpr").into_iter().find_map(|r| pres.attr(r, "lang").map(str::to_string));
    let mut pictures = false;
    let mut video = false;
    let mut scheme_colours = false;
    for (si, path) in slides.iter().enumerate() {
        let n = si as u32 + 1;
        let Some(d) = xml(&zip, path) else {
            c.limit(&format!("Slide {n} could not be read."));
            continue;
        };
        if lang.is_none() {
            lang = d.elements().into_iter().find_map(|e| if matches!(d.local(e), Some("rpr") | Some("endpararpr") | Some("defrpr")) { d.attr(e, "lang").map(str::to_string) } else { None });
        }
        c.check("slide-title");
        if !has_title(&d) {
            c.found(Finding::new("slide-title", Status::Fail, None, Where { file: Some(path.clone()), slide: Some(n), ..Where::default() }, &[("slide", n.to_string())]));
        }
        for pic in d.find_all("p:pic") {
            let Some(pr) = d.find_in(pic, "p:cnvpr") else { continue };
            if d.find_in(pic, "a:videofile").is_some() || d.descendants(pic).into_iter().any(|e| d.local(e) == Some("media")) {
                video = true;
                c.check("captions-missing");
                c.found(Finding::new("captions-missing", Status::NeedsReview, Some("unknown"), Where { file: Some(path.clone()), slide: Some(n), id: d.attr(pr, "id").map(str::to_string), ..Where::default() }, &[]));
            }
            pictures |= picture_alt(&d, pr, path, Some(n), c);
        }
        for gf in d.find_all("p:graphicframe") {
            let uri = d.find_in(gf, "a:graphicdata").and_then(|g| d.attr(g, "uri")).unwrap_or("");
            if uri.ends_with("/chart") || uri.ends_with("/diagram") || uri.contains("chartex") {
                if let Some(pr) = d.find_in(gf, "p:cnvpr") {
                    pictures |= picture_alt(&d, pr, path, Some(n), c);
                }
            }
            if let Some(tbl) = d.find_in(gf, "a:tbl") {
                let rows = d.find_all_in(tbl, "a:tr");
                let cols = rows.iter().map(|&r| d.element_children(r).filter(|&x| d.local(x) == Some("tc")).count()).max().unwrap_or(0);
                if rows.len() >= 2 && cols >= 2 {
                    c.check("table-headers");
                    let first = d.find_in(tbl, "a:tblpr").map_or(false, |p| matches!(d.attr(p, "firstrow"), Some("1") | Some("true")));
                    if !first {
                        let id = d.find_in(gf, "p:cnvpr").and_then(|p| d.attr(p, "id")).map(str::to_string);
                        c.found(Finding::new("table-headers", Status::Fail, None, Where { file: Some(path.clone()), slide: Some(n), id, ..Where::default() }, &[]));
                    }
                }
            }
        }
        // 2.4.4 and 1.4.3, run by run.
        let slide_bg = d.find("p:bgpr").and_then(|b| solid(&d, b));
        for sp in d.find_all("p:sp") {
            let shape_fill = d.find_in(sp, "p:sppr").and_then(|p| solid(&d, p));
            for r in d.find_all_in(sp, "a:r") {
                let text: String = d.find_all_in(r, "a:t").into_iter().map(|t| d.text_raw(t)).collect();
                if text.trim().is_empty() {
                    continue;
                }
                let rpr = d.element_children(r).find(|&x| d.local(x) == Some("rpr"));
                if let Some(rp) = rpr {
                    if d.find_in(rp, "a:hlinkclick").is_some() {
                        let id = d.find_in(sp, "p:cnvpr").and_then(|p| d.attr(p, "id")).map(str::to_string);
                        let at = Where { file: Some(path.clone()), slide: Some(n), id, ..Where::default() };
                        c.check("link-name");
                        c.check("link-vague");
                        let plain: String = text.to_lowercase().chars().filter(|ch| ch.is_alphanumeric() || ch.is_whitespace()).collect();
                        if VAGUE.contains(&squash(&plain).as_str()) {
                            c.found(Finding::new("link-vague", Status::NeedsReview, None, at, &[("text", squash(&text))]));
                        }
                    }
                }
                let fill = rpr.and_then(|rp| d.element_children(rp).find(|&x| d.local(x) == Some("solidfill")));
                let fg = fill.and_then(|f| d.element_children(f).next()).and_then(|clr| if d.local(clr) == Some("srgbclr") { d.attr(clr, "val").and_then(ooxml_hex) } else { scheme_colours = true; None });
                let Some(fg) = fg else { continue };
                let Some(bg) = shape_fill.or(slide_bg) else {
                    scheme_colours = true;
                    continue;
                };
                c.check("contrast-text");
                let size_pt = rpr.and_then(|rp| d.attr(rp, "sz")).and_then(|s| s.parse::<f64>().ok()).map(|s| s / 100.0).unwrap_or(18.0);
                let bold = rpr.and_then(|rp| d.attr(rp, "b")).map_or(false, |b| b == "1" || b == "true");
                let res = text_contrast(fg, bg, size_pt, if bold { Weight::Bold } else { Weight::Normal });
                if res.status != Status::Pass {
                    let size = if res.large { "large" } else { "normal" };
                    let at = Where { file: Some(path.clone()), slide: Some(n), id: d.find_in(sp, "p:cnvpr").and_then(|p| d.attr(p, "id")).map(str::to_string), ..Where::default() };
                    let params = [("foreground", hex(fg)), ("background", hex(bg)), ("ratio", ratio_words(res.ratio)), ("minimum", minimum_words(res.minimum)), ("size", size.to_string())];
                    c.found_grouped(format!("pptx {n} {} {} {size}", hex(fg), hex(bg)), Finding::new("contrast-text", res.status, res.variant, at, &params));
                }
            }
        }
    }
    lang_finding(c, lang, Where::file(&main), "presentation");
    if scheme_colours {
        c.limit("Some text takes its colour or its background from the theme, which this check does not read.");
    }
    c.ask("reading-order");
    c.ask("color-only");
    if pictures {
        c.ask("alt-meaning");
    }
    if video {
        c.ask("captions-accuracy");
        c.ask("flashing");
    }
    Ok(slides.len() as u32)
}
