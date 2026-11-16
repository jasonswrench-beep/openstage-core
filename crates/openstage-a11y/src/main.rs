//! openstage-a11y: checks a file or a folder of web pages against the OpenStage accessibility rules (A11Y-1).
//!
//!   openstage-a11y check <file or folder> [--json] [--project <project.json>] [--settings <settings.json>] [--strict]
//!   openstage-a11y rules [--json]
//!
//! It prints each rule's status and the findings, in words. `--json` prints the report as A11Y-1 section 4 sets it
//! out. `--project` reads the project's `accessibilityChecks` (ignored rules and findings, and blockers);
//! `--settings` reads a file that holds that object by itself. The exit code is 0 whatever is found, so a check never
//! stops a build; `--strict` makes it 1 when a finding of a blocker rule fails, for a build that asks for that. It is
//! 2 when the input cannot be read.

use openstage_a11y::{catalogue::catalogue, check_path, Options, Report, Settings, Status};
use std::path::PathBuf;
use std::process::ExitCode;

fn usage() -> ExitCode {
    eprintln!("usage: openstage-a11y check <file or folder> [--json] [--project <project.json>] [--settings <settings.json>] [--strict]");
    eprintln!("       openstage-a11y rules [--json]");
    ExitCode::from(2)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("rules") => {
            if args.iter().any(|a| a == "--json") {
                println!("{}", openstage_a11y::catalogue::RULES_JSON.trim_end());
            } else {
                let cat = catalogue();
                println!("{} revision {}, WCAG {} AA", cat.catalogue, cat.revision, cat.wcag);
                for r in &cat.rules {
                    let kind = if r.is_person() { "for a person" } else { r.basis.as_str() };
                    println!("{:<22} {:<16} {:<14} {}", r.id, r.wcag.join(", "), kind, r.title);
                }
            }
            ExitCode::SUCCESS
        }
        Some("check") => check(&args[1..]),
        Some("--version") | Some("-V") => {
            println!("openstage-a11y {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        _ => usage(),
    }
}

fn check(args: &[String]) -> ExitCode {
    let mut input: Option<PathBuf> = None;
    let (mut json, mut strict) = (false, false);
    let mut settings = Settings::default();
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--json" => json = true,
            "--strict" => strict = true,
            "--project" | "--settings" => {
                let Some(p) = args.get(i + 1) else { return usage() };
                let text = match std::fs::read(p) {
                    Ok(b) => openstage_a11y::text_of(&b),
                    Err(e) => {
                        eprintln!("{p} could not be read: {e}");
                        return ExitCode::from(2);
                    }
                };
                let value: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(v) => v,
                    Err(e) => {
                        eprintln!("{p} is not JSON: {e}");
                        return ExitCode::from(2);
                    }
                };
                settings = if args[i] == "--project" {
                    Settings::from_project(&value)
                } else {
                    Settings::from_project(&serde_json::json!({ openstage_a11y::settings::MEMBER: value }))
                };
                i += 1;
            }
            a if !a.starts_with("--") && input.is_none() => input = Some(PathBuf::from(a)),
            _ => return usage(),
        }
        i += 1;
    }
    let Some(input) = input else { return usage() };
    let mut report = match check_path(&input, &Options::default()) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("{} {e}", input.display());
            return ExitCode::from(2);
        }
    };
    settings.apply(&mut report);
    if json {
        println!("{}", serde_json::to_string_pretty(&report).expect("a report is always JSON"));
    } else {
        print_words(&report);
    }
    if strict && !report.blocking.is_empty() {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}

fn print_words(r: &Report) {
    println!("{} ({}, {} file{})", r.input.name, r.input.kind, r.input.files, if r.input.files == 1 { "" } else { "s" });
    println!("{}", r.summary_line("Accessibility"));
    println!();
    for rule in &r.rules {
        let s = rule.status;
        println!("{} {:<14} {:<22} {}", s.symbol(), s.word(), rule.rule, rule.title);
    }
    if !r.findings.is_empty() {
        println!();
        for f in &r.findings {
            let place = f.at.key();
            let more = if f.count > 1 { format!(" (and {} more like it)", f.count - 1) } else { String::new() };
            println!("{} {}: {} {}{more}", f.status.symbol(), f.status.word(), f.rule, place);
            println!("    {}", f.message);
            if !f.fix.is_empty() {
                println!("    What to do: {}", f.fix);
            }
        }
    }
    if !r.checklist.is_empty() {
        println!();
        println!("Only a person can check:");
        for c in &r.checklist {
            println!("  {}: {}", c.title, c.message);
        }
    }
    if !r.limits.is_empty() {
        println!();
        println!("What this check could not do:");
        for l in &r.limits {
            println!("  {l}");
        }
    }
    if !r.blocking.is_empty() {
        println!();
        println!("Blocking publishing, because the project made these rules blockers:");
        for k in &r.blocking {
            println!("  {} {k}", Status::Fail.symbol());
        }
    }
}
