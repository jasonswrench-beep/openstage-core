# @openstage/bank

Reads an OpenAssess question bank (a `.openassess` file, format 1;
[BANK-1](https://github.com/jasonswrench-beep/openstage-core/blob/main/specs/bank/BANK-1.md)) and gives every question
in plain data: its type, words and answer key, its points, its details (objective, chapter, section, page, Bloom level,
difficulty, tags, author, status), its folder, its pictures (with their descriptions and bytes) and equations, its
history, and the tests and classes it was used in. What cannot be read is listed, never guessed. No dependencies;
Node 20 or later, or any browser.

```js
import { readBank } from "@openstage/bank";

const bank = await readBank(bytes);                 // the file's bytes, a Uint8Array
for (const q of bank.questions) {
  q.type;                                           // "multipleChoice", ...
  q.stem.text;                                      // plain text; q.stem.html is cleaned to the bank's subset
  q.options?.map((o) => [o.text.text, o.correct]);
  q.key;                                            // the answer, by type
  q.metadata.objective; q.metadata.bloom; q.folder?.path;
  q.usage.lastGiven;                                // "2026-11-14", or null
}
const png = await bank.media(bank.questions[0].pictures[0]?.file);
bank.problems;                                      // [{ file, questionId, message, skipped }]
```

A bank written in a newer format, or a file that is not a bank, is refused with a `BankError` whose `code` says which.

Install it from its release (no sign-in needed):

```bash
npm install --save-dev https://github.com/jasonswrench-beep/openstage-core/releases/download/bank-v0.1.0/openstage-bank-0.1.0.tgz
```
