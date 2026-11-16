// Runs every check in the repository that needs nothing outside it: each package's tests, the item-analysis test
// set's own check, readPstat against the .pstat reader conformance files, the spec's example files, the bank reader
// against its test set, the A11Y-1 catalogue's copies, the accessibility and bank test sets' checksums, and (when cargo
// is on the PATH) each Rust crate's tests, the accessibility engine's run of its test set among them.
// Run from the root: node tools/check_all.mjs [--no-rust]
// The checks of the tools themselves (OpenAssess, PrismStatistics) need those tools; see CORE-NOTES.md.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const run = (label, args, cwd = ROOT, program = process.execPath) => {
  process.stdout.write(`${label} ... `);
  try {
    const out = execFileSync(program, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    console.log("ok");
    return out;
  } catch (e) {
    console.log("FAILED");
    console.log(String(e.stdout ?? "") + String(e.stderr ?? ""));
    process.exitCode = 1;
  }
};

for (const name of readdirSync(join(ROOT, "packages")).sort()) {
  const dir = join(ROOT, "packages", name);
  const tests = readdirSync(join(dir, "test")).filter((f) => f.endsWith(".test.js")).map((f) => join("test", f));
  run(`packages/${name} tests`, ["--test", ...tests], dir);
}
run("item-analysis test set", [join("testsets", "item-analysis", "check", "check_set.mjs")]);
run(".pstat reader conformance (readPstat)", [join("specs", "pstat", "conformance", "check_reader.mjs")]);

// The spec's example files are what make_examples.mjs makes, and pass checkPstat.
{
  const { checkPstat } = await import(new URL("../packages/pstat/src/index.js", import.meta.url).href);
  const ex = await import(new URL("../specs/pstat/examples/make_examples.mjs", import.meta.url).href);
  const { writePstat } = await import(new URL("../packages/pstat/src/index.js", import.meta.url).href);
  const files = { "minimal.pstat": [ex.minimal()], "item-results.pstat": [ex.itemResults()], "item-results-2.pstat": [ex.itemResults2(), ex.assessment()], "case-table.pstat": [ex.caseTable(), ex.caseTablePart()] };
  process.stdout.write("spec examples ... ");
  const bad = Object.entries(files).filter(([file, args]) => {
    const bytes = readFileSync(join(ROOT, "specs", "pstat", "examples", file));
    return !Buffer.from(writePstat(...args)).equals(bytes) || checkPstat(bytes).length > 0;
  });
  if (bad.length === 0) console.log("ok");
  else {
    console.log(`FAILED: ${bad.map(([f]) => f).join(", ")} (run node specs/pstat/examples/make_examples.mjs)`);
    process.exitCode = 1;
  }
}

// The A11Y-1 catalogue's copies; the accessibility and bank test sets' checksums (every file listed, none extra); and
// the bank reader against its set. The accessibility set's cases are run by the engine's cargo tests below.
run("A11Y-1 catalogue copies", [join("tools", "sync_a11y_rules.mjs"), "--check"]);
run("bank test set (check_reader.mjs)", [join("testsets", "bank", "check", "check_reader.mjs")]);
for (const [name, label] of [["a11y", "accessibility"], ["bank", "bank"]]) {
  const { createHash } = await import("node:crypto");
  const { statSync } = await import("node:fs");
  const set = join(ROOT, "testsets", name);
  const listed = new Map(readFileSync(join(set, "SHA256SUMS.txt"), "utf8").trim().split("\n").map((l) => [l.slice(66), l.slice(0, 64)]));
  const found = [];
  const walk = (d, rel) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const r = rel ? `${rel}/${e}` : e;
      if (statSync(p).isDirectory()) walk(p, r);
      else if (r !== "SHA256SUMS.txt") found.push(r);
    }
  };
  walk(set, "");
  const bad = found.filter((r) => listed.get(r) !== createHash("sha256").update(readFileSync(join(set, ...r.split("/")))).digest("hex"));
  const gone = [...listed.keys()].filter((r) => !found.includes(r));
  process.stdout.write(`${label} test set checksums ... `);
  if (bad.length === 0 && gone.length === 0) console.log("ok");
  else {
    console.log(`FAILED: changed or unlisted ${bad.join(", ") || "none"}; missing ${gone.join(", ") || "none"} (run node testsets/${name}/make_cases.mjs)`);
    process.exitCode = 1;
  }
}

// Rust crates: cargo test in each, unless cargo is missing or --no-rust is given.
if (!process.argv.includes("--no-rust")) {
  let cargo = true;
  try {
    execFileSync("cargo", ["--version"], { stdio: "ignore" });
  } catch {
    cargo = false;
  }
  const workspaces = [...readdirSync(join(ROOT, "crates")).sort().map((name) => [`crates/${name}`, ["test", "--quiet"]]), ["capture", ["test", "--workspace", "--quiet"]]];
  for (const [dir, args] of workspaces) {
    if (cargo) run(`${dir} tests (cargo test)`, args, join(ROOT, ...dir.split("/")), "cargo");
    else console.log(`${dir} tests ... skipped: cargo is not on the PATH`);
  }
}
