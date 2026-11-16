//! Runs the engine on the A11Y-1 conformance set (`testsets/a11y` in openstage-core) and compares each report with
//! the case's `expected.json`, in the same way as `testsets/a11y/check/check_engine.mjs`. Also checks that the
//! crate's copy of the rule catalogue is the spec's.

use openstage_a11y::{check_path, Options, Report};
use serde_json::Value;
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..")
}

fn compare(expected: &Value, report: &Report) -> Vec<String> {
    let mut problems = Vec::new();
    if let Some(kind) = expected.get("kind").and_then(Value::as_str) {
        if report.input.kind != kind {
            problems.push(format!("input kind is {}, expected {kind}", report.input.kind));
        }
    }
    if let Some(files) = expected.get("files").and_then(Value::as_u64) {
        if report.input.files as u64 != files {
            problems.push(format!("{} files read, expected {files}", report.input.files));
        }
    }
    let wanted: Vec<&Value> = expected["findings"].as_array().unwrap().iter().collect();
    for e in &wanted {
        let key = e["key"].as_str().unwrap();
        let Some(g) = report.findings.iter().find(|g| g.key == key) else {
            problems.push(format!("missing finding {key}"));
            continue;
        };
        if g.rule != e["rule"].as_str().unwrap() {
            problems.push(format!("{key}: rule {}", g.rule));
        }
        if g.status.id() != e["status"].as_str().unwrap() {
            problems.push(format!("{key}: status {}", g.status.id()));
        }
        if g.variant.as_deref() != e.get("variant").and_then(Value::as_str) {
            problems.push(format!("{key}: variant {:?}", g.variant));
        }
        if g.count as u64 != e.get("count").and_then(Value::as_u64).unwrap_or(1) {
            problems.push(format!("{key}: count {}", g.count));
        }
        if let Some(params) = e.get("params").and_then(Value::as_object) {
            for (k, v) in params {
                if g.params.get(k).map(String::as_str) != v.as_str() {
                    problems.push(format!("{key}: {k} is {:?}, expected {v}", g.params.get(k)));
                }
            }
        }
        if g.message.contains('{') || g.fix.contains('{') {
            problems.push(format!("{key}: a value is missing from its words: {} / {}", g.message, g.fix));
        }
    }
    for g in &report.findings {
        if !wanted.iter().any(|e| e["key"].as_str() == Some(g.key.as_str())) {
            problems.push(format!("unexpected finding {} ({}): {}", g.key, g.status.id(), g.message));
        }
    }
    if let Some(rules) = expected.get("rules").and_then(Value::as_object) {
        for (rule, status) in rules {
            match report.rules.iter().find(|r| &r.rule == rule) {
                None => problems.push(format!("rule {rule} is not in the report")),
                Some(r) if Some(r.status.id()) != status.as_str() => problems.push(format!("rule {rule} is {}, expected {status}", r.status.id())),
                _ => {}
            }
        }
    }
    if let Some(summary) = expected.get("summary").and_then(Value::as_object) {
        let have = serde_json::to_value(&report.summary).unwrap();
        for (k, v) in summary {
            if &have[k] != v {
                problems.push(format!("summary {k} is {}, expected {v}", have[k]));
            }
        }
    }
    if let Some(list) = expected.get("checklist").and_then(Value::as_array) {
        let mut want: Vec<&str> = list.iter().filter_map(Value::as_str).collect();
        let mut have: Vec<&str> = report.checklist.iter().map(|c| c.rule.as_str()).collect();
        want.sort();
        have.sort();
        if want != have {
            problems.push(format!("checklist is {have:?}, expected {want:?}"));
        }
    }
    for l in expected.get("limits").and_then(Value::as_array).into_iter().flatten() {
        if !report.limits.iter().any(|x| Some(x.as_str()) == l.as_str()) {
            problems.push(format!("limit not reported: {l}"));
        }
    }
    problems
}

#[test]
fn the_conformance_set() {
    let set = root().join("testsets").join("a11y");
    let ids: Vec<String> = serde_json::from_str(&std::fs::read_to_string(set.join("cases.json")).unwrap()).unwrap();
    assert!(ids.len() >= 20);
    let mut failed = Vec::new();
    for id in &ids {
        let dir = set.join("cases").join(id);
        let expected: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("expected.json")).unwrap()).unwrap();
        let report = check_path(&dir.join(expected["input"].as_str().unwrap()), &Options::default()).unwrap();
        let problems = compare(&expected, &report);
        if !problems.is_empty() {
            failed.push(format!("{id}:\n  {}", problems.join("\n  ")));
        }
    }
    assert!(failed.is_empty(), "{}", failed.join("\n"));
}

#[test]
fn a_changed_expectation_is_caught() {
    let dir = root().join("testsets").join("a11y").join("cases").join("html-names");
    let mut expected: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("expected.json")).unwrap()).unwrap();
    let report = check_path(&dir.join("names.html"), &Options::default()).unwrap();
    assert!(compare(&expected, &report).is_empty());
    expected["findings"].as_array_mut().unwrap().retain(|f| f["rule"] != "role-unknown");
    assert!(compare(&expected, &report).iter().any(|p| p.starts_with("unexpected finding role-unknown")));
    expected["findings"].as_array_mut().unwrap().push(serde_json::json!({ "rule": "alt-missing", "status": "fail", "key": "alt-missing names.html#id=nothing" }));
    assert!(compare(&expected, &report).iter().any(|p| p == "missing finding alt-missing names.html#id=nothing"));
}

#[test]
fn the_catalogue_is_the_specs() {
    let spec = std::fs::read(root().join("specs").join("a11y").join("rules.json")).unwrap();
    assert_eq!(spec, openstage_a11y::catalogue::RULES_JSON.as_bytes(), "copy specs/a11y/rules.json to crates/openstage-a11y/src/rules.json");
}

#[test]
fn every_finding_rule_and_variant_is_in_the_catalogue() {
    let cat = openstage_a11y::catalogue::catalogue();
    let mut ids: Vec<&str> = cat.rules.iter().map(|r| r.id.as_str()).collect();
    ids.sort();
    let before = ids.len();
    ids.dedup();
    assert_eq!(before, ids.len(), "rule ids are used once");
    for r in &cat.rules {
        for c in &r.wcag {
            assert!(cat.criteria.contains_key(c), "{}: {c} is not in criteria", r.id);
        }
        assert!(r.is_person() || r.fix.is_some(), "{} has no fix", r.id);
        assert!(!r.message.contains('\u{2014}'), "{}: no long dashes", r.id);
    }
}

#[test]
fn the_shared_contrast_cases() {
    use openstage_a11y::contrast::{blend, hex, parse_css_color, ratio, ratio_words, text_contrast, Weight};
    let cases: Value = serde_json::from_str(&std::fs::read_to_string(root().join("specs").join("a11y").join("conformance").join("contrast.json")).unwrap()).unwrap();
    let rgb = |s: &Value| parse_css_color(s.as_str().unwrap()).unwrap();
    for c in cases["ratios"].as_array().unwrap() {
        let r = ratio(rgb(&c["foreground"]).rgb, rgb(&c["background"]).rgb);
        assert!((r - c["ratio"].as_f64().unwrap()).abs() < 0.005, "{c}: {r}");
        assert_eq!(ratio_words(r), c["words"].as_str().unwrap(), "{c}");
    }
    for c in cases["text"].as_array().unwrap() {
        let w = match c["weight"].as_str().unwrap() {
            "bold" => Weight::Bold,
            "normal" => Weight::Normal,
            _ => Weight::Unknown,
        };
        let t = text_contrast(rgb(&c["foreground"]).rgb, rgb(&c["background"]).rgb, c["sizePt"].as_f64().unwrap(), w);
        assert_eq!(t.status.id(), c["status"].as_str().unwrap(), "{c}");
        assert_eq!(t.minimum, c["minimum"].as_f64().unwrap(), "{c}");
        assert_eq!(t.large, c["large"].as_bool().unwrap(), "{c}");
        assert_eq!(t.variant, c.get("variant").and_then(Value::as_str), "{c}");
    }
    for c in cases["blend"].as_array().unwrap() {
        assert_eq!(hex(blend(rgb(&c["top"]), rgb(&c["under"]).rgb)), c["result"].as_str().unwrap(), "{c}");
    }
}
