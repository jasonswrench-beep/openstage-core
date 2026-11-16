# openstage-a11y

The engine of the OpenStage accessibility rules ([A11Y-1](../../specs/a11y/A11Y-1.md)): give it a web page, a folder
of pages, an EPUB, a Word or PowerPoint file or a WebVTT captions file, and it returns a report of each rule's status,
the findings with where they are and what to do, and the checks only a person can make. Findings warn; nothing stops
anything unless a project made a rule a blocker. PDFs are not read yet (A11Y-1 section 6.6).

As a library (Rust):

```toml
openstage-a11y = { git = "https://github.com/jasonswrench-beep/openstage-core", tag = "a11y-v0.1.0" }
```

```rust
let mut report = openstage_a11y::check_path(std::path::Path::new("guide.html"), &Default::default())?;
openstage_a11y::Settings::from_project(&project_json).apply(&mut report);
println!("{}", report.summary_line("Web page"));   // Web page: 0 failures, 2 to review, 3 checks for a person
```

As a program:

```bash
openstage-a11y check guide.html
openstage-a11y check help-site --json --project project.json
openstage-a11y rules
```

`check` always exits 0 whatever it finds, so it never stops a build; `--strict` makes it exit 1 when a finding of a
rule the project made a blocker fails. It exits 2 when the input cannot be read.

Its dependencies are `serde`, `serde_json` and `flate2`, which the OpenStage tools already have. It reads HTML, CSS,
XML and ZIP itself, within limits on size (A11Y-1 and the source say which).
