// The glossary warning (scripts/glossary-names.mjs) finds capitalised names in new UI text that GLOSSARY.md lacks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateWords, unknownWords } from "./glossary-names.mjs";

const glossary = "**Target Range**:\nThe band a value should stay in.\n**Share**:\nGiving access.";

test("capitalised words inside a sentence are candidates, sentence starts are not", () => {
  assert.deepEqual(candidateWords(["<p>Open the Target Range or a Zebra Board</p>"]), ["Target", "Range", "Zebra", "Board"]);
  assert.deepEqual(candidateWords(["<p>Target values are shown</p>"]), []);
  assert.deepEqual(candidateWords(['  // see the Zebra Board', 'const x = "Zebra Board";']), []);
  assert.deepEqual(candidateWords(['<Field label="Choose the Zebra" />']), ["Zebra"]);
});

test("words the glossary or the allowlist know are not reported", () => {
  assert.deepEqual(unknownWords(["<p>Open the Target Range or a Zebra Board on Monday via Slack</p>"], glossary), ["Zebra", "Board"]);
});
