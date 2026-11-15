// Runs every check in the repository that needs nothing outside it: each package's tests, the item-analysis test
// set's own check, and readPstat against the .pstat reader conformance files. Run from the root: node tools/check_all.mjs
// The checks of the tools themselves (OpenAssess, PrismStatistics) need those tools; see CORE-NOTES.md.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const run = (label, args, cwd = ROOT) => {
  process.stdout.write(`${label} ... `);
  try {
    const out = execFileSync(process.execPath, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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
