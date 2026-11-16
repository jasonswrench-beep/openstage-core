// @openstage/bank: the test set (testsets/bank), the cleaning of a bank's HTML, the zip reader's checks, and the
// way to unpack where there is no DecompressionStream.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

import { BankError, cleanHtml, htmlToText, readBank, readQuestion, TYPE_NAMES, QUESTION_TYPES } from "../src/index.js";
import { crc32, openZip } from "../src/zip.js";
import { checkCase } from "../../../testsets/bank/check/check_reader.mjs";

const set = new URL("../../../testsets/bank/", import.meta.url);
const ids = JSON.parse(readFileSync(new URL("cases.json", set), "utf8"));
const bytesOf = (id) => {
  const e = JSON.parse(readFileSync(new URL(`cases/${id}/expected.json`, set), "utf8"));
  return new Uint8Array(readFileSync(new URL(`cases/${id}/${e.input}`, set)));
};

test("the test set", async () => {
  assert.ok(ids.length >= 9);
  for (const id of ids) assert.deepEqual(await checkCase(readBank, id), [], id);
});

test("a wrong answer is caught", async () => {
  const wrong = async (bytes) => {
    const b = await readBank(bytes);
    b.questions[0].usage.lastGiven = "2026-11-15";
    b.problems.push({ file: "x", message: "extra", skipped: false });
    return b;
  };
  const problems = await checkCase(wrong, "course");
  assert.ok(problems.some((p) => p.includes("lastGiven")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("unexpected problem")));
  const swallow = async () => ({ questions: [], problems: [] });
  assert.ok((await checkCase(swallow, "newer-format")).length > 0, "an error that is not raised is caught");
});

test("unpacking without DecompressionStream, sync or async", async () => {
  const bytes = bytesOf("course");
  for (const inflateRaw of [(d) => new Uint8Array(inflateRawSync(d)), async (d) => new Uint8Array(inflateRawSync(d))]) {
    const b = await readBank(bytes, { inflateRaw });
    assert.equal(b.questions.length, 5);
    assert.equal((await b.media(b.questions[1].pictures[0].file)).length, 68);
  }
});

test("errors carry a code", async () => {
  await assert.rejects(readBank(bytesOf("newer-format")), (e) => e instanceof BankError && e.code === "newer-format" && /format 2/.test(e.message));
  await assert.rejects(readBank(new Uint8Array([1, 2, 3])), (e) => e.code === "not-a-zip");
});

test("the zip reader checks sizes and check values", async () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const zip = openZip(bytesOf("course"), { maxEntry: 100 });
  await assert.rejects(zip.entry("manifest.json"), /more than 100 bytes/);
  await assert.rejects(openZip(bytesOf("course")).entry("nothing.json"), /not in the archive/);
});

test("HTML is cleaned to the subset", () => {
  const { html, removed } = cleanHtml(`<p style="x">a<b>b</b><iframe src=x>gone</iframe><ol start="3" type="i"><li>c</li></ol><td colspan="2;x">d</td><!-- note --><oa-media ref="m_1" onload="x"></oa-media> 1 < 2 & 3</p>`);
  assert.equal(html, `<p>ab<ol start="3"><li>c</li></ol><td>d</td><oa-media ref="m_1"></oa-media> 1 &lt; 2 &amp; 3</p>`);
  assert.equal(removed, 8);
  assert.equal(htmlToText(html, { pictures: [{ id: "m_1", alt: "A dog" }] }), "ab\nc\nd [Picture: A dog] 1 < 2 & 3");
  assert.equal(htmlToText(`<oa-media ref="m_2"></oa-media>`, { pictures: [{ id: "m_2", alt: "", decorative: true }] }), "");
  assert.equal(htmlToText(`<p>&#x1F600; &#55296; &nbsp;x</p>`), "\u{1F600} &#55296; x");
});

test("a question on its own", () => {
  assert.deepEqual(Object.keys(TYPE_NAMES), QUESTION_TYPES);
  const q = {
    id: "q_01KA9C4B000000000000000001", version: 3, type: "numeric", title: "", stem: { format: "plain", content: "How many?" }, points: 2,
    body: { mode: "range", min: 1, max: 3, units: "pages" }, feedback: {}, metadata: { tags: ["a", 4], status: "reviewed", bloom: "remembering" }, media: [], math: [], findings: [{ code: "x", severity: "warn", message: "m", dismissed: true }], history: [],
  };
  const r = readQuestion(q);
  assert.equal(r.question.title, "How many?");
  assert.equal(r.question.revision, 3);
  assert.deepEqual(r.question.key, { mode: "range", min: 1, max: 3, units: "pages" });
  assert.equal(r.question.hasKey, true);
  assert.deepEqual(r.question.metadata, { tags: ["a"], status: "reviewed" });
  assert.deepEqual(r.question.findings, [], "a dismissed finding is left out");
  assert.equal(r.question.lastChanged, null);
  assert.match(readQuestion({ ...q, id: "q_short" }).problem, /no id/);
  assert.match(readQuestion({ ...q, points: -1 }).problem, /points/);
  assert.match(readQuestion({ ...q, type: "multipleChoice", body: { options: [] } }).problem, /options/);
});
