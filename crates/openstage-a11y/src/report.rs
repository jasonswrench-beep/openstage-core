//! Findings and the report (A11Y-1 section 4).

use crate::catalogue::{catalogue, fill, rule};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// A rule's or a finding's status. Shown with its word and its symbol, never by colour alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Pass,
    Fail,
    NeedsReview,
    NotTested,
    NotApplicable,
}

impl Status {
    pub fn id(self) -> &'static str {
        match self {
            Status::Pass => "pass",
            Status::Fail => "fail",
            Status::NeedsReview => "needs-review",
            Status::NotTested => "not-tested",
            Status::NotApplicable => "not-applicable",
        }
    }
    /// The word, from the catalogue: Pass, Fail, Needs review, Not tested, Not applicable.
    pub fn word(self) -> &'static str {
        catalogue().statuses.iter().find(|s| s.id == self.id()).map(|s| s.word.as_str()).unwrap_or("")
    }
    /// The symbol, from the catalogue: ✓ ✗ ? ○ –.
    pub fn symbol(self) -> &'static str {
        catalogue().statuses.iter().find(|s| s.id == self.id()).map(|s| s.symbol.as_str()).unwrap_or("")
    }
}

/// Where a finding is. Only the members that apply are written.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Where {
    /// The file, as a path inside what was checked (a site's folder, an EPUB, a Word file), with `/` between parts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    /// An element's id, when it has one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// An element's path from the root, such as `html/body/main/p[2]/a[1]` (the number counts elements of that name
    /// under the same parent, from 1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub element: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slide: Option<u32>,
    /// An object of a tool's own project, by the tool's id for it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object: Option<String>,
    /// `light` or `dark`, for a colour finding made under one colour scheme only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheme: Option<String>,
}

impl Where {
    pub fn file(file: &str) -> Where {
        Where { file: Some(file.to_string()), ..Where::default() }
    }
    /// The location part of a finding's key (section 4.2): the file, then `#` and the first of id, element, page,
    /// slide, object and line that is set, then `@` and the scheme when there is one.
    pub fn key(&self) -> String {
        let mut k = self.file.clone().unwrap_or_default();
        let place = if let Some(id) = &self.id {
            Some(format!("id={id}"))
        } else if let Some(e) = &self.element {
            Some(e.clone())
        } else if let Some(p) = self.page {
            Some(format!("page={p}"))
        } else if let Some(s) = self.slide {
            Some(format!("slide={s}"))
        } else if let Some(o) = &self.object {
            Some(format!("object={o}"))
        } else {
            self.line.map(|l| format!("line={l}"))
        };
        if let Some(p) = place {
            k.push('#');
            k.push_str(&p);
        }
        if let Some(s) = &self.scheme {
            k.push('@');
            k.push_str(s);
        }
        k
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub rule: String,
    pub status: Status,
    pub wcag: Vec<String>,
    pub basis: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(rename = "where")]
    pub at: Where,
    /// `rule` and the location, which stays the same from one check to the next while the thing does not move; used to
    /// ignore one finding (section 5).
    pub key: String,
    pub message: String,
    pub fix: String,
    /// The values the message was made from (a colour, a ratio, an id).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub params: BTreeMap<String, String>,
    /// How many places have this same finding; the first is in `where`.
    pub count: u32,
}

impl Finding {
    /// A finding of `rule_id`, its message and fix filled from the catalogue. Panics on a rule id that is not in the
    /// catalogue, which is a programming error.
    pub fn new(rule_id: &str, status: Status, variant: Option<&str>, at: Where, params: &[(&str, String)]) -> Finding {
        let r = rule(rule_id).unwrap_or_else(|| panic!("no rule {rule_id} in the catalogue"));
        let params: BTreeMap<String, String> = params.iter().map(|(k, v)| (k.to_string(), v.clone())).collect();
        let template = variant.and_then(|v| r.variants.get(v)).unwrap_or(&r.message);
        Finding {
            rule: r.id.clone(),
            status,
            wcag: r.wcag.clone(),
            basis: r.basis.clone(),
            variant: variant.map(str::to_string),
            key: format!("{} {}", r.id, at.key()),
            at,
            message: fill(template, &params),
            fix: r.fix.as_deref().map(|f| fill(f, &params)).unwrap_or_default(),
            params,
            count: 1,
        }
    }
}

/// One rule's result for the whole input.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleResult {
    pub rule: String,
    pub title: String,
    pub status: Status,
    pub wcag: Vec<String>,
    pub basis: String,
    /// How many things the rule looked at.
    pub checked: u32,
    pub fail: u32,
    pub needs_review: u32,
    /// Why the rule was not tested, or why it does not apply.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// A check only a person can make (a `person` rule).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItem {
    pub rule: String,
    pub title: String,
    pub wcag: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    /// Findings that fail, counting each place.
    pub fail: u32,
    /// Findings that need review, counting each place.
    pub needs_review: u32,
    pub rules_failed: u32,
    pub rules_need_review: u32,
    pub rules_passed: u32,
    pub rules_not_tested: u32,
    pub rules_not_applicable: u32,
    /// Checks only a person can make.
    pub checklist: u32,
    /// Findings left out because the project ignores them (section 5).
    pub ignored: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Engine {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    pub name: String,
    /// `html`, `site` (a folder of pages), `epub`, `docx`, `pptx`, `pdf` or `vtt`.
    pub kind: String,
    pub files: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub format: String,
    pub revision: String,
    pub engine: Engine,
    pub input: Input,
    pub summary: Summary,
    pub rules: Vec<RuleResult>,
    pub findings: Vec<Finding>,
    pub checklist: Vec<ChecklistItem>,
    /// What this check could not do, in plain words.
    pub limits: Vec<String>,
    /// The keys of the findings that the project turned into blockers and that fail (section 5). Empty unless the
    /// project chose blockers.
    #[serde(default)]
    pub blocking: Vec<String>,
}

impl Report {
    /// One line for an export's report, such as "Web page: 0 failures, 2 to review, 3 checks for a person".
    pub fn summary_line(&self, label: &str) -> String {
        let s = &self.summary;
        let fails = if s.fail == 1 { "1 failure".to_string() } else { format!("{} failures", s.fail) };
        let person = if s.checklist == 1 { "1 check for a person".to_string() } else { format!("{} checks for a person", s.checklist) };
        format!("{label}: {fails}, {} to review, {person}", s.needs_review)
    }
}

/// Gathers what a checker finds, then makes the report.
pub struct Collector {
    format: String,
    findings: Vec<Finding>,
    groups: BTreeMap<String, usize>,
    checked: BTreeMap<String, u32>,
    not_tested: BTreeMap<String, String>,
    asked: BTreeSet<String>,
    limits: Vec<String>,
    max_findings: usize,
    dropped: u32,
}

impl Collector {
    /// A collector for one format (`html`, `epub`, ...): the rules of that format make up the report.
    pub fn new(format: &str) -> Collector {
        Collector {
            format: format.to_string(),
            findings: Vec::new(),
            groups: BTreeMap::new(),
            checked: BTreeMap::new(),
            not_tested: BTreeMap::new(),
            asked: BTreeSet::new(),
            limits: Vec::new(),
            max_findings: 5000,
            dropped: 0,
        }
    }

    pub fn format(&self) -> &str {
        &self.format
    }

    /// The rule looked at one more thing.
    pub fn check(&mut self, rule_id: &str) {
        *self.checked.entry(rule_id.to_string()).or_insert(0) += 1;
    }

    /// A finding (the thing it is about has already been counted with `check`).
    pub fn found(&mut self, f: Finding) {
        if self.findings.len() >= self.max_findings {
            self.dropped += 1;
            return;
        }
        self.findings.push(f);
    }

    /// A finding that is the same as others of its `group` (the same colours, say): the first is kept and the rest
    /// counted on it.
    pub fn found_grouped(&mut self, group: String, f: Finding) {
        if let Some(&i) = self.groups.get(&group) {
            self.findings[i].count += 1;
            return;
        }
        if self.findings.len() >= self.max_findings {
            self.dropped += 1;
            return;
        }
        self.groups.insert(group, self.findings.len());
        self.findings.push(f);
    }

    /// The rule could not be tested on this input, and why.
    pub fn not_tested(&mut self, rule_id: &str, reason: &str) {
        self.not_tested.entry(rule_id.to_string()).or_insert_with(|| reason.to_string());
    }

    /// Put a check for a person on the checklist.
    pub fn ask(&mut self, rule_id: &str) {
        self.asked.insert(rule_id.to_string());
    }

    pub fn limit(&mut self, text: &str) {
        if !self.limits.iter().any(|l| l == text) {
            self.limits.push(text.to_string());
        }
    }

    /// Folds another collector's findings in (one file of a site or an e-book).
    pub fn absorb(&mut self, other: Collector) {
        for (rule_id, n) in other.checked {
            *self.checked.entry(rule_id).or_insert(0) += n;
        }
        for (rule_id, reason) in other.not_tested {
            self.not_tested.entry(rule_id).or_insert(reason);
        }
        self.asked.extend(other.asked);
        for l in other.limits {
            self.limit(&l);
        }
        self.dropped += other.dropped;
        for f in other.findings {
            // The same finding twice (a style sheet that two pages share) is kept once.
            if self.findings.iter().any(|g| g.key == f.key && g.variant == f.variant) {
                continue;
            }
            self.found(f);
        }
    }

    pub fn finish(mut self, input: Input) -> Report {
        let cat = catalogue();
        if self.dropped > 0 {
            let text = format!("Only the first {} findings are listed; {} more were left out.", self.max_findings, self.dropped);
            self.limit(&text);
        }
        let mut rules = Vec::new();
        let mut summary = Summary::default();
        for r in cat.rules.iter().filter(|r| !r.is_person() && r.applies_to(&self.format)) {
            let mine: Vec<&Finding> = self.findings.iter().filter(|f| f.rule == r.id).collect();
            let fail: u32 = mine.iter().filter(|f| f.status == Status::Fail).map(|f| f.count).sum();
            let review: u32 = mine.iter().filter(|f| f.status == Status::NeedsReview).map(|f| f.count).sum();
            let checked = self.checked.get(&r.id).copied().unwrap_or(0);
            let mut reason = None;
            let status = if fail > 0 {
                Status::Fail
            } else if review > 0 {
                Status::NeedsReview
            } else if let Some(why) = self.not_tested.get(&r.id) {
                reason = Some(why.clone());
                Status::NotTested
            } else if checked > 0 {
                Status::Pass
            } else {
                Status::NotApplicable
            };
            match status {
                Status::Fail => summary.rules_failed += 1,
                Status::NeedsReview => summary.rules_need_review += 1,
                Status::Pass => summary.rules_passed += 1,
                Status::NotTested => summary.rules_not_tested += 1,
                Status::NotApplicable => summary.rules_not_applicable += 1,
            }
            summary.fail += fail;
            summary.needs_review += review;
            rules.push(RuleResult {
                rule: r.id.clone(),
                title: r.title.clone(),
                status,
                wcag: r.wcag.clone(),
                basis: r.basis.clone(),
                checked,
                fail,
                needs_review: review,
                reason,
            });
        }
        let checklist: Vec<ChecklistItem> = cat
            .rules
            .iter()
            .filter(|r| r.is_person() && self.asked.contains(&r.id))
            .map(|r| ChecklistItem { rule: r.id.clone(), title: r.title.clone(), wcag: r.wcag.clone(), message: r.message.clone() })
            .collect();
        summary.checklist = checklist.len() as u32;
        Report {
            format: cat.catalogue.clone(),
            revision: cat.revision.clone(),
            engine: Engine { name: "openstage-a11y".into(), version: env!("CARGO_PKG_VERSION").into() },
            input,
            summary,
            rules,
            findings: self.findings,
            checklist,
            limits: self.limits,
            blocking: Vec::new(),
        }
    }
}
