//! Colours and contrast (A11Y-1 section 3): the relative luminance and contrast ratio of WCAG 2.1, the large-text
//! rule, and colours as CSS writes them.

use crate::report::Status;

/// An 8-bit sRGB colour.
pub type Rgb = [u8; 3];

/// A colour with how solid it is, from 0 (see-through) to 1 (solid).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rgba {
    pub rgb: Rgb,
    pub alpha: f64,
}

pub const TEXT_MIN: f64 = 4.5;
pub const LARGE_TEXT_MIN: f64 = 3.0;
pub const GRAPHIC_MIN: f64 = 3.0;

/// The relative luminance of a colour, from 0 (black) to 1 (white). Each channel is divided by 255 and made linear
/// with the sRGB curve (the 0.04045 knee; WCAG 2.1's text says 0.03928, which gives the same result for every 8-bit
/// value).
pub fn luminance(rgb: Rgb) -> f64 {
    let lin = |v: u8| {
        let s = v as f64 / 255.0;
        if s <= 0.04045 {
            s / 12.92
        } else {
            ((s + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}

/// The contrast ratio of two colours, from 1 to 21, unrounded.
pub fn ratio(a: Rgb, b: Rgb) -> f64 {
    let (la, lb) = (luminance(a), luminance(b));
    (la.max(lb) + 0.05) / (la.min(lb) + 0.05)
}

/// A colour laid over another: each channel `alpha * top + (1 - alpha) * under`, rounded to the nearest whole value.
pub fn blend(top: Rgba, under: Rgb) -> Rgb {
    let a = top.alpha.clamp(0.0, 1.0);
    let mix = |t: u8, u: u8| (a * t as f64 + (1.0 - a) * u as f64).round().clamp(0.0, 255.0) as u8;
    [mix(top.rgb[0], under[0]), mix(top.rgb[1], under[1]), mix(top.rgb[2], under[2])]
}

/// Large text: at least 18 points, or at least 14 points and bold (weight 700 or more). A CSS pixel is 0.75 points,
/// so 24px, or 18.67px bold.
pub fn is_large(size_pt: f64, bold: bool) -> bool {
    size_pt >= 18.0 || (bold && size_pt >= 14.0)
}

/// Whether text is bold, when it is known.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Weight {
    Bold,
    Normal,
    Unknown,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TextContrast {
    pub ratio: f64,
    pub minimum: f64,
    pub large: bool,
    pub status: Status,
    /// `uncertain-bold` when the result depends on a weight that is not known.
    pub variant: Option<&'static str>,
}

/// The contrast of text of this size and weight. An unknown weight counts as normal, except that text of 14 to 18
/// points whose ratio is at least 3 but under 4.5 needs review, because it passes only if it is bold.
pub fn text_contrast(fg: Rgb, bg: Rgb, size_pt: f64, weight: Weight) -> TextContrast {
    let r = ratio(fg, bg);
    let large = is_large(size_pt, weight == Weight::Bold);
    let minimum = if large { LARGE_TEXT_MIN } else { TEXT_MIN };
    if weight == Weight::Unknown && (14.0..18.0).contains(&size_pt) && (LARGE_TEXT_MIN..TEXT_MIN).contains(&r) {
        return TextContrast { ratio: r, minimum: TEXT_MIN, large: false, status: Status::NeedsReview, variant: Some("uncertain-bold") };
    }
    let status = if r >= minimum { Status::Pass } else { Status::Fail };
    TextContrast { ratio: r, minimum, large, status, variant: None }
}

/// A ratio in words, rounded down to one decimal place, so that 4.49 reads "4.4" and never "4.5".
pub fn ratio_words(r: f64) -> String {
    format!("{:.1}", (r * 10.0 + 1e-9).floor() / 10.0)
}

/// A minimum in words: "4.5", "3".
pub fn minimum_words(m: f64) -> String {
    if m.fract() == 0.0 {
        format!("{}", m as i64)
    } else {
        format!("{m}")
    }
}

/// `#RRGGBB` in capitals.
pub fn hex(rgb: Rgb) -> String {
    format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2])
}

/// A colour as CSS writes it: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()` (with commas or spaces,
/// numbers or percentages), `hsl()` and `hsla()`, a named colour, or `transparent`. `None` for anything else
/// (`currentcolor`, `inherit`, a `var()` not yet resolved).
pub fn parse_css_color(text: &str) -> Option<Rgba> {
    let t = text.trim().to_ascii_lowercase();
    if let Some(h) = t.strip_prefix('#') {
        return parse_hex(h);
    }
    if t == "transparent" {
        return Some(Rgba { rgb: [0, 0, 0], alpha: 0.0 });
    }
    if let Some(args) = func_args(&t, &["rgb", "rgba"]) {
        let (parts, alpha) = split_args(&args)?;
        if parts.len() != 3 {
            return None;
        }
        let mut rgb = [0u8; 3];
        for (i, p) in parts.iter().enumerate() {
            let v = if let Some(pc) = p.strip_suffix('%') { pc.trim().parse::<f64>().ok()? * 2.55 } else { p.parse::<f64>().ok()? };
            rgb[i] = v.round().clamp(0.0, 255.0) as u8;
        }
        return Some(Rgba { rgb, alpha });
    }
    if let Some(args) = func_args(&t, &["hsl", "hsla"]) {
        let (parts, alpha) = split_args(&args)?;
        if parts.len() != 3 {
            return None;
        }
        let h = parts[0].trim_end_matches("deg").parse::<f64>().ok()?;
        let s = parts[1].strip_suffix('%').unwrap_or(&parts[1]).parse::<f64>().ok()? / 100.0;
        let l = parts[2].strip_suffix('%').unwrap_or(&parts[2]).parse::<f64>().ok()? / 100.0;
        return Some(Rgba { rgb: hsl_to_rgb(h, s.clamp(0.0, 1.0), l.clamp(0.0, 1.0)), alpha });
    }
    NAMED.iter().find(|(n, _)| *n == t).map(|(_, v)| Rgba { rgb: [(v >> 16) as u8, (v >> 8) as u8, *v as u8], alpha: 1.0 })
}

fn parse_hex(h: &str) -> Option<Rgba> {
    if !h.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let digit = |i: usize| u8::from_str_radix(&h[i..i + 1], 16).ok().map(|d| d * 17);
    let pair = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).ok();
    match h.len() {
        3 => Some(Rgba { rgb: [digit(0)?, digit(1)?, digit(2)?], alpha: 1.0 }),
        4 => Some(Rgba { rgb: [digit(0)?, digit(1)?, digit(2)?], alpha: digit(3)? as f64 / 255.0 }),
        6 => Some(Rgba { rgb: [pair(0)?, pair(2)?, pair(4)?], alpha: 1.0 }),
        8 => Some(Rgba { rgb: [pair(0)?, pair(2)?, pair(4)?], alpha: pair(6)? as f64 / 255.0 }),
        _ => None,
    }
}

fn func_args(t: &str, names: &[&str]) -> Option<String> {
    for n in names {
        if let Some(rest) = t.strip_prefix(n) {
            let rest = rest.trim_start();
            if let Some(inner) = rest.strip_prefix('(').and_then(|r| r.strip_suffix(')')) {
                return Some(inner.to_string());
            }
        }
    }
    None
}

/// The three colour arguments and the alpha, from `1, 2, 3, 0.5`, `1 2 3 / 50%` or `1 2 3`.
fn split_args(args: &str) -> Option<(Vec<String>, f64)> {
    let (main, alpha_text) = match args.split_once('/') {
        Some((m, a)) => (m.to_string(), Some(a.trim().to_string())),
        None => (args.to_string(), None),
    };
    let mut parts: Vec<String> = if main.contains(',') {
        main.split(',').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect()
    } else {
        main.split_whitespace().map(str::to_string).collect()
    };
    let mut alpha_text = alpha_text;
    if alpha_text.is_none() && parts.len() == 4 {
        alpha_text = parts.pop();
    }
    let alpha = match alpha_text {
        None => 1.0,
        Some(a) => {
            if let Some(pc) = a.strip_suffix('%') {
                pc.trim().parse::<f64>().ok()? / 100.0
            } else {
                a.parse::<f64>().ok()?
            }
        }
    };
    Some((parts, alpha.clamp(0.0, 1.0)))
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> Rgb {
    let h = ((h % 360.0) + 360.0) % 360.0 / 360.0;
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    let channel = |mut t: f64| {
        if t < 0.0 {
            t += 1.0;
        }
        if t > 1.0 {
            t -= 1.0;
        }
        let v = if t < 1.0 / 6.0 {
            p + (q - p) * 6.0 * t
        } else if t < 0.5 {
            q
        } else if t < 2.0 / 3.0 {
            p + (q - p) * (2.0 / 3.0 - t) * 6.0
        } else {
            p
        };
        (v * 255.0).round().clamp(0.0, 255.0) as u8
    };
    [channel(h + 1.0 / 3.0), channel(h), channel(h - 1.0 / 3.0)]
}

/// The named colours of CSS Color Module Level 4.
const NAMED: &[(&str, u32)] = &[
    ("aliceblue", 0xF0F8FF), ("antiquewhite", 0xFAEBD7), ("aqua", 0x00FFFF), ("aquamarine", 0x7FFFD4),
    ("azure", 0xF0FFFF), ("beige", 0xF5F5DC), ("bisque", 0xFFE4C4), ("black", 0x000000),
    ("blanchedalmond", 0xFFEBCD), ("blue", 0x0000FF), ("blueviolet", 0x8A2BE2), ("brown", 0xA52A2A),
    ("burlywood", 0xDEB887), ("cadetblue", 0x5F9EA0), ("chartreuse", 0x7FFF00), ("chocolate", 0xD2691E),
    ("coral", 0xFF7F50), ("cornflowerblue", 0x6495ED), ("cornsilk", 0xFFF8DC), ("crimson", 0xDC143C),
    ("cyan", 0x00FFFF), ("darkblue", 0x00008B), ("darkcyan", 0x008B8B), ("darkgoldenrod", 0xB8860B),
    ("darkgray", 0xA9A9A9), ("darkgreen", 0x006400), ("darkgrey", 0xA9A9A9), ("darkkhaki", 0xBDB76B),
    ("darkmagenta", 0x8B008B), ("darkolivegreen", 0x556B2F), ("darkorange", 0xFF8C00), ("darkorchid", 0x9932CC),
    ("darkred", 0x8B0000), ("darksalmon", 0xE9967A), ("darkseagreen", 0x8FBC8F), ("darkslateblue", 0x483D8B),
    ("darkslategray", 0x2F4F4F), ("darkslategrey", 0x2F4F4F), ("darkturquoise", 0x00CED1), ("darkviolet", 0x9400D3),
    ("deeppink", 0xFF1493), ("deepskyblue", 0x00BFFF), ("dimgray", 0x696969), ("dimgrey", 0x696969),
    ("dodgerblue", 0x1E90FF), ("firebrick", 0xB22222), ("floralwhite", 0xFFFAF0), ("forestgreen", 0x228B22),
    ("fuchsia", 0xFF00FF), ("gainsboro", 0xDCDCDC), ("ghostwhite", 0xF8F8FF), ("gold", 0xFFD700),
    ("goldenrod", 0xDAA520), ("gray", 0x808080), ("green", 0x008000), ("greenyellow", 0xADFF2F),
    ("grey", 0x808080), ("honeydew", 0xF0FFF0), ("hotpink", 0xFF69B4), ("indianred", 0xCD5C5C),
    ("indigo", 0x4B0082), ("ivory", 0xFFFFF0), ("khaki", 0xF0E68C), ("lavender", 0xE6E6FA),
    ("lavenderblush", 0xFFF0F5), ("lawngreen", 0x7CFC00), ("lemonchiffon", 0xFFFACD), ("lightblue", 0xADD8E6),
    ("lightcoral", 0xF08080), ("lightcyan", 0xE0FFFF), ("lightgoldenrodyellow", 0xFAFAD2), ("lightgray", 0xD3D3D3),
    ("lightgreen", 0x90EE90), ("lightgrey", 0xD3D3D3), ("lightpink", 0xFFB6C1), ("lightsalmon", 0xFFA07A),
    ("lightseagreen", 0x20B2AA), ("lightskyblue", 0x87CEFA), ("lightslategray", 0x778899), ("lightslategrey", 0x778899),
    ("lightsteelblue", 0xB0C4DE), ("lightyellow", 0xFFFFE0), ("lime", 0x00FF00), ("limegreen", 0x32CD32),
    ("linen", 0xFAF0E6), ("magenta", 0xFF00FF), ("maroon", 0x800000), ("mediumaquamarine", 0x66CDAA),
    ("mediumblue", 0x0000CD), ("mediumorchid", 0xBA55D3), ("mediumpurple", 0x9370DB), ("mediumseagreen", 0x3CB371),
    ("mediumslateblue", 0x7B68EE), ("mediumspringgreen", 0x00FA9A), ("mediumturquoise", 0x48D1CC), ("mediumvioletred", 0xC71585),
    ("midnightblue", 0x191970), ("mintcream", 0xF5FFFA), ("mistyrose", 0xFFE4E1), ("moccasin", 0xFFE4B5),
    ("navajowhite", 0xFFDEAD), ("navy", 0x000080), ("oldlace", 0xFDF5E6), ("olive", 0x808000),
    ("olivedrab", 0x6B8E23), ("orange", 0xFFA500), ("orangered", 0xFF4500), ("orchid", 0xDA70D6),
    ("palegoldenrod", 0xEEE8AA), ("palegreen", 0x98FB98), ("paleturquoise", 0xAFEEEE), ("palevioletred", 0xDB7093),
    ("papayawhip", 0xFFEFD5), ("peachpuff", 0xFFDAB9), ("peru", 0xCD853F), ("pink", 0xFFC0CB),
    ("plum", 0xDDA0DD), ("powderblue", 0xB0E0E6), ("purple", 0x800080), ("rebeccapurple", 0x663399),
    ("red", 0xFF0000), ("rosybrown", 0xBC8F8F), ("royalblue", 0x4169E1), ("saddlebrown", 0x8B4513),
    ("salmon", 0xFA8072), ("sandybrown", 0xF4A460), ("seagreen", 0x2E8B57), ("seashell", 0xFFF5EE),
    ("sienna", 0xA0522D), ("silver", 0xC0C0C0), ("skyblue", 0x87CEEB), ("slateblue", 0x6A5ACD),
    ("slategray", 0x708090), ("slategrey", 0x708090), ("snow", 0xFFFAFA), ("springgreen", 0x00FF7F),
    ("steelblue", 0x4682B4), ("tan", 0xD2B48C), ("teal", 0x008080), ("thistle", 0xD8BFD8),
    ("tomato", 0xFF6347), ("turquoise", 0x40E0D0), ("violet", 0xEE82EE), ("wheat", 0xF5DEB3),
    ("white", 0xFFFFFF), ("whitesmoke", 0xF5F5F5), ("yellow", 0xFFFF00), ("yellowgreen", 0x9ACD32),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn black_on_white_is_21() {
        assert!((ratio([0, 0, 0], [255, 255, 255]) - 21.0).abs() < 1e-12);
        assert!((ratio([9, 9, 9], [9, 9, 9]) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn the_two_knees_agree_for_every_8_bit_value() {
        for v in 0..=255u8 {
            let s = v as f64 / 255.0;
            let a = if s <= 0.04045 { s / 12.92 } else { ((s + 0.055) / 1.055).powf(2.4) };
            let b = if s <= 0.03928 { s / 12.92 } else { ((s + 0.055) / 1.055).powf(2.4) };
            assert_eq!(a, b, "value {v}");
        }
    }

    #[test]
    fn colours_as_css_writes_them() {
        assert_eq!(parse_css_color("#fd0").unwrap().rgb, [255, 221, 0]);
        assert_eq!(parse_css_color("#C62828").unwrap().rgb, [198, 40, 40]);
        assert_eq!(parse_css_color("rgb(10, 20, 30)").unwrap().rgb, [10, 20, 30]);
        assert_eq!(parse_css_color("rgb(10 20 30 / 50%)").unwrap().alpha, 0.5);
        assert_eq!(parse_css_color("rgba(0,0,0,.25)").unwrap().alpha, 0.25);
        assert_eq!(parse_css_color("hsl(0, 100%, 50%)").unwrap().rgb, [255, 0, 0]);
        assert_eq!(parse_css_color("RebeccaPurple").unwrap().rgb, [0x66, 0x33, 0x99]);
        assert_eq!(parse_css_color("transparent").unwrap().alpha, 0.0);
        assert!(parse_css_color("currentcolor").is_none());
        assert!(parse_css_color("#12345").is_none());
    }

    #[test]
    fn rounded_down_in_words() {
        assert_eq!(ratio_words(4.4999), "4.4");
        assert_eq!(ratio_words(4.5), "4.5");
        assert_eq!(ratio_words(21.0), "21.0");
        assert_eq!(minimum_words(4.5), "4.5");
        assert_eq!(minimum_words(3.0), "3");
    }

    #[test]
    fn large_text_and_unknown_weight() {
        assert!(is_large(18.0, false));
        assert!(!is_large(17.99, false));
        assert!(is_large(14.0, true));
        assert!(!is_large(18.66 * 0.75, true), "18.66px is just under 14pt");
        let grey = [0x76, 0x76, 0x76]; // 4.54 to 1 on white
        assert_eq!(text_contrast(grey, [255; 3], 12.0, Weight::Normal).status, Status::Pass);
        let light = [0x94, 0x94, 0x94]; // 3.03 to 1 on white
        let c = text_contrast(light, [255; 3], 15.0, Weight::Unknown);
        assert_eq!((c.status, c.variant), (Status::NeedsReview, Some("uncertain-bold")));
        assert_eq!(text_contrast(light, [255; 3], 15.0, Weight::Bold).status, Status::Pass);
        assert_eq!(text_contrast(light, [255; 3], 15.0, Weight::Normal).status, Status::Fail);
    }
}
