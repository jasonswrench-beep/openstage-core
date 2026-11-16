// Copies the A11Y-1 rule catalogue (specs/a11y/rules.json, the one to change) to the engine
// (crates/openstage-a11y/src/rules.json) and the package (packages/a11y/src/rules.js). Run after changing it:
//   node tools/sync_a11y_rules.mjs          writes the copies
//   node tools/sync_a11y_rules.mjs --check  only says whether they are the same (tools/check_all.mjs runs this)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const spec = readFileSync(at("specs/a11y/rules.json"), "utf8");
JSON.parse(spec);
const js = `// Made by tools/sync_a11y_rules.mjs from specs/a11y/rules.json; change that file, not this one.\nexport default ${spec.trimEnd()};\n`;
const copies = [
  ["crates/openstage-a11y/src/rules.json", spec],
  ["packages/a11y/src/rules.js", js],
];
if (process.argv.includes("--check")) {
  const stale = copies.filter(([p, want]) => {
    try {
      return readFileSync(at(p), "utf8") !== want;
    } catch {
      return true;
    }
  });
  if (stale.length) {
    console.log(`differ from specs/a11y/rules.json: ${stale.map(([p]) => p).join(", ")} (run node tools/sync_a11y_rules.mjs)`);
    process.exitCode = 1;
  }
} else {
  for (const [p, text] of copies) writeFileSync(at(p), text);
  console.log("copied");
}
