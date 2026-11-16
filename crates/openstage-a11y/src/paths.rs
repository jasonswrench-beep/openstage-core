//! Paths inside what is checked (a site's folder, an EPUB, a Word file), always with `/` between parts.

/// The folder part of a path: `a/b/c.html` gives `a/b`; `c.html` gives the empty string.
pub fn dir(path: &str) -> String {
    match path.rfind('/') {
        Some(i) => path[..i].to_string(),
        None => String::new(),
    }
}

/// A relative reference (`../css/site.css?v=2`) from a folder, made plain (`css/site.css`). `None` for a reference
/// that leaves the top (more `..` than folders), names another site, or is a `data:` address.
pub fn resolve(folder: &str, href: &str) -> Option<String> {
    let href = href.trim();
    let lower = href.to_ascii_lowercase();
    if href.is_empty() || lower.starts_with("data:") || lower.starts_with("//") || lower.contains("://") || lower.starts_with("mailto:") || lower.starts_with("javascript:") {
        return None;
    }
    let href = href.split(['?', '#']).next().unwrap_or("");
    let href = percent_decode(href);
    let mut parts: Vec<&str> = if href.starts_with('/') { Vec::new() } else { folder.split('/').filter(|p| !p.is_empty()).collect() };
    for p in href.split('/') {
        match p {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            other => parts.push(other),
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

/// `resolve`, or the reference as it is when it cannot be resolved (for a finding's place).
pub fn join(folder: &str, href: &str) -> String {
    resolve(folder, href).unwrap_or_else(|| href.to_string())
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hexval = |c: u8| (c as char).to_digit(16);
            if let (Some(h), Some(l)) = (hexval(b[i + 1]), hexval(b[i + 2])) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_inside_the_top_only() {
        assert_eq!(resolve("OEBPS/text", "../css/a%20b.css?v=1").as_deref(), Some("OEBPS/css/a b.css"));
        assert_eq!(resolve("", "site.css").as_deref(), Some("site.css"));
        assert_eq!(resolve("a", "/top.css").as_deref(), Some("top.css"));
        assert_eq!(resolve("", "../out.css"), None);
        assert_eq!(resolve("a", "https://example.org/x.css"), None);
        assert_eq!(dir("a/b/c.html"), "a/b");
        assert_eq!(dir("c.html"), "");
    }
}
