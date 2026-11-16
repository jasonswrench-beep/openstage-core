//! The checks of a WebVTT captions file: that it can be read, and that each caption can be read in time.

use crate::report::{Collector, Finding, Status, Where};

/// Longest line, most lines, and most characters a second, before a caption needs review.
pub const LINE_LIMIT: usize = 42;
pub const LINES_LIMIT: usize = 2;
pub const RATE_LIMIT: f64 = 20.0;

fn time(s: &str) -> Option<f64> {
    let s = s.trim();
    let (main, frac) = s.split_once('.')?;
    if frac.len() != 3 || !frac.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let parts: Vec<&str> = main.split(':').collect();
    let nums: Option<Vec<f64>> = parts.iter().map(|p| if p.len() >= 2 && p.chars().all(|c| c.is_ascii_digit()) { p.parse::<f64>().ok() } else { None }).collect();
    let nums = nums?;
    let secs = match nums.as_slice() {
        [m, s] if *m < 60.0 && *s < 60.0 => m * 60.0 + s,
        [h, m, s] if *m < 60.0 && *s < 60.0 => h * 3600.0 + m * 60.0 + s,
        _ => return None,
    };
    Some(secs + frac.parse::<f64>().ok()? / 1000.0)
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for ch in s.chars() {
        match ch {
            '<' => inside = true,
            '>' if inside => inside = false,
            c if !inside => out.push(c),
            _ => {}
        }
    }
    crate::dom::decode(&out)
}

pub fn check(file: &str, text: &str, c: &mut Collector) {
    c.check("captions-format");
    c.ask("captions-accuracy");
    let text = text.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = text.split('\n').collect();
    let at_line = |n: usize| Where { file: Some(file.to_string()), line: Some(n as u32 + 1), ..Where::default() };
    let first = lines.first().copied().unwrap_or("");
    if !(first == "WEBVTT" || first.starts_with("WEBVTT ") || first.starts_with("WEBVTT\t")) {
        c.found(Finding::new("captions-format", Status::Fail, None, at_line(0), &[("detail", "it does not start with WEBVTT".into())]));
        return;
    }
    let mut i = 1;
    let mut prev_end: Option<f64> = None;
    let mut broken = None;
    while i < lines.len() {
        while i < lines.len() && lines[i].trim().is_empty() {
            i += 1;
        }
        if i >= lines.len() {
            break;
        }
        let start = i;
        while i < lines.len() && !lines[i].trim().is_empty() {
            i += 1;
        }
        let block = &lines[start..i];
        let head = block[0].trim_start();
        if head.starts_with("NOTE") || head == "STYLE" || head.starts_with("STYLE ") || head == "REGION" || head.starts_with("REGION ") {
            continue;
        }
        let (timing_at, timing) = match block.iter().position(|l| l.contains("-->")) {
            Some(k) if k <= 1 => (start + k, block[k]),
            _ => {
                broken.get_or_insert((start, "a block has no times".to_string()));
                continue;
            }
        };
        let (a, rest) = timing.split_once("-->").unwrap_or(("", ""));
        let b = rest.split_whitespace().next().unwrap_or("");
        let (Some(t0), Some(t1)) = (time(a), time(b)) else {
            broken.get_or_insert((timing_at, format!("the times on line {} cannot be read", timing_at + 1)));
            continue;
        };
        if t1 <= t0 {
            broken.get_or_insert((timing_at, format!("the caption on line {} ends before it starts", timing_at + 1)));
            continue;
        }
        let words: Vec<String> = block[timing_at - start + 1..].iter().map(|l| strip_tags(l)).collect();
        c.check("captions-reading");
        let at = at_line(timing_at);
        let longest = words.iter().map(|w| w.chars().count()).max().unwrap_or(0);
        let chars: usize = words.iter().map(|w| w.chars().count()).sum();
        let rate = chars as f64 / (t1 - t0);
        if prev_end.map_or(false, |p| t0 < p - 1e-9) {
            c.found(Finding::new("captions-reading", Status::NeedsReview, Some("overlap"), at, &[]));
        } else if words.len() > LINES_LIMIT {
            c.found(Finding::new("captions-reading", Status::NeedsReview, Some("lines"), at, &[("lines", words.len().to_string()), ("limit", LINES_LIMIT.to_string())]));
        } else if longest > LINE_LIMIT {
            c.found(Finding::new("captions-reading", Status::NeedsReview, Some("line"), at, &[("length", longest.to_string()), ("limit", LINE_LIMIT.to_string())]));
        } else if rate > RATE_LIMIT {
            c.found(Finding::new("captions-reading", Status::NeedsReview, None, at, &[("rate", format!("{:.1}", (rate * 10.0).floor() / 10.0)), ("limit", format!("{}", RATE_LIMIT as i64))]));
        }
        prev_end = Some(prev_end.map_or(t1, |p: f64| p.max(t1)));
    }
    if let Some((line, detail)) = broken {
        c.found(Finding::new("captions-format", Status::Fail, None, at_line(line), &[("detail", detail)]));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn times() {
        assert_eq!(time("00:01.500"), Some(1.5));
        assert_eq!(time("01:00:00.000"), Some(3600.0));
        assert_eq!(time("1:00.000"), None);
        assert_eq!(time("00:61.000"), None);
    }
}
