//! The rule catalogue (`rules.json`, the same file as `specs/a11y/rules.json`): each rule's id, its WCAG success
//! criteria, its title, and the words of its message and fix.

use serde::Deserialize;
use std::collections::BTreeMap;
use std::sync::OnceLock;

/// The catalogue as it is kept in the repository. `specs/a11y/rules.json` is the one to change; the core's checks
/// fail when this copy differs from it.
pub const RULES_JSON: &str = include_str!("rules.json");

#[derive(Debug, Clone, Deserialize)]
pub struct Catalogue {
    pub catalogue: String,
    pub revision: String,
    pub wcag: String,
    pub statuses: Vec<StatusInfo>,
    pub criteria: BTreeMap<String, Criterion>,
    pub rules: Vec<Rule>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StatusInfo {
    pub id: String,
    pub word: String,
    pub symbol: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Criterion {
    pub name: String,
    pub level: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Rule {
    pub id: String,
    /// `machine` (checked by a program) or `person` (only a person can check it; listed in the report's checklist).
    pub kind: String,
    pub title: String,
    pub wcag: Vec<String>,
    /// `requirement` (a WCAG 2.1 AA success criterion asks for it) or `practice` (good practice that serves one).
    pub basis: String,
    /// Where it can be checked: `source` (a tool's own project), `html`, `epub`, `docx`, `pptx`, `pdf`, `vtt`.
    pub checks: Vec<String>,
    pub message: String,
    #[serde(default)]
    pub variants: BTreeMap<String, String>,
    #[serde(default)]
    pub fix: Option<String>,
}

impl Rule {
    pub fn is_person(&self) -> bool {
        self.kind == "person"
    }
    pub fn applies_to(&self, format: &str) -> bool {
        self.checks.iter().any(|c| c == format)
    }
}

/// The catalogue, read once.
pub fn catalogue() -> &'static Catalogue {
    static C: OnceLock<Catalogue> = OnceLock::new();
    C.get_or_init(|| serde_json::from_str(RULES_JSON).expect("rules.json is part of the crate and is valid"))
}

/// The rule with this id, if there is one.
pub fn rule(id: &str) -> Option<&'static Rule> {
    catalogue().rules.iter().find(|r| r.id == id)
}

/// Fills `{name}` in a template from `params`. A name with no value is left as it is, so a missing value shows.
pub fn fill(template: &str, params: &BTreeMap<String, String>) -> String {
    let mut out = String::with_capacity(template.len() + 32);
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close) if after[..close].chars().all(|c| c.is_ascii_alphanumeric() || c == '_') => {
                let name = &after[..close];
                match params.get(name) {
                    Some(v) => out.push_str(v),
                    None => {
                        out.push('{');
                        out.push_str(name);
                        out.push('}');
                    }
                }
                rest = &after[close + 1..];
            }
            _ => {
                out.push('{');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}
