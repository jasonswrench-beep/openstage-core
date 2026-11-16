// Runs every check in the repository that needs nothing outside it: each package's tests, the item-analysis test
// set's own check, readPstat against the .pstat reader conformance files, the spec's example files, and (when cargo
// is on the PATH) each Rust crate's tests. Run from the root: node tools/check_all.mjs [--no-rust]
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
