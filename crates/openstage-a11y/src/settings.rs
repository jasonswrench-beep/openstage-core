//! A project's choices about the checks (A11Y-1 section 5): rules and findings it ignores, and the rules it turned
//! into publishing blockers. Every list is empty unless the author fills it, so nothing ever blocks by default.

use crate::report::{Report, Status};
use serde::{Deserialize, Serialize};

/// The member name a project file keeps these under.
pub const MEMBER: &str = "accessibilityChecks";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Rule ids whose findings are left out of the report.
    #[serde(default)]
    pub ignored: Vec<String>,
    /// Finding keys (section 4.2) left out of the report, one place at a time.
    #[serde(default)]
    pub ignored_findings: Vec<String>,
    /// Rule ids that stop publishing while they have a finding that fails. Empty unless the author turns one on.
    #[serde(default)]
    pub blockers: Vec<String>,
}

impl Settings {
    /// The settings in a project file's JSON (`accessibilityChecks`), or none when the member is missing. Unknown
    /// members and values that are not strings are skipped, so a newer project file still reads.
    pub fn from_project(project: &serde_json::Value) -> Settings {
        let Some(obj) = project.get(MEMBER) else { return Settings::default() };
        let list = |name: &str| -> Vec<String> {
            obj.get(name)
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                .unwrap_or_default()
        };
        Settings { ignored: list("ignored"), ignored_findings: list("ignoredFindings"), blockers: list("blockers") }
    }

    pub fn is_blocker(&self, rule: &str) -> bool {
        self.blockers.iter().any(|b| b == rule)
    }

    /// Whether a finding is left out. A blocker's findings are never left out by rule, only one key at a time.
    pub fn hides(&self, rule: &str, key: &str) -> bool {
        self.ignored_findings.iter().any(|k| k == key) || (!self.is_blocker(rule) && self.ignored.iter().any(|r| r == rule))
    }

    /// Leaves out the ignored findings (counting them in `summary.ignored`, and in the summary's finding counts no
    /// longer), and lists in `blocking` the keys of the findings that fail and whose rule is a blocker. A rule's own
    /// status is what was measured and does not change.
    pub fn apply(&self, report: &mut Report) {
        let mut kept = Vec::with_capacity(report.findings.len());
        for f in report.findings.drain(..) {
            if self.hides(&f.rule, &f.key) {
                report.summary.ignored += f.count;
                match f.status {
                    Status::Fail => report.summary.fail = report.summary.fail.saturating_sub(f.count),
                    Status::NeedsReview => report.summary.needs_review = report.summary.needs_review.saturating_sub(f.count),
                    _ => {}
                }
            } else {
                kept.push(f);
            }
        }
        report.findings = kept;
        report.blocking = report
            .findings
            .iter()
            .filter(|f| f.status == Status::Fail && self.is_blocker(&f.rule))
            .map(|f| f.key.clone())
            .collect();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_member_is_empty_and_never_blocks() {
        let s = Settings::from_project(&serde_json::json!({ "title": "A course" }));
        assert_eq!(s, Settings::default());
        assert!(!s.is_blocker("alt-missing"));
    }

    #[test]
    fn reads_the_member_and_skips_what_it_does_not_know() {
        let s = Settings::from_project(&serde_json::json!({
            "accessibilityChecks": { "ignored": ["link-vague", 3], "blockers": ["alt-missing"], "later": true }
        }));
        assert_eq!(s.ignored, vec!["link-vague"]);
        assert_eq!(s.blockers, vec!["alt-missing"]);
        assert!(s.hides("link-vague", "link-vague a.html#a[1]"));
        assert!(!s.hides("alt-missing", "alt-missing a.html#img[1]"));
    }

    #[test]
    fn a_blocker_is_not_hidden_by_its_rule() {
        let s = Settings { ignored: vec!["alt-missing".into()], blockers: vec!["alt-missing".into()], ..Settings::default() };
        assert!(!s.hides("alt-missing", "k"));
        let s = Settings { ignored_findings: vec!["k".into()], blockers: vec!["alt-missing".into()], ..Settings::default() };
        assert!(s.hides("alt-missing", "k"));
    }
}
