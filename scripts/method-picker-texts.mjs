#!/usr/bin/env node
// Writes packages/core/src/method-picker-texts.json: the "Use it when" and "Don't use it when" text of each Method, taken
// word for word from docs/guides/methods.md, so the picker on the Analysis Canvas and the Methods guide cannot disagree
// (spec 0041, ticket 16). Only the lines a person can read without a technical word are kept (the picker's words follow the
// forbidden-word and Avoid lists of the Takeaways); the guide keeps the rest.
//
//   node scripts/method-picker-texts.mjs            rewrites the JSON file
//   node scripts/method-picker-texts.mjs --check    fails when the file differs from what the guide says
import { readFileSync, writeFileSync } from "node:fs";

const GUIDE = new URL("../docs/guides/methods.md", import.meta.url);
const OUT = new URL("../packages/core/src/method-picker-texts.json", import.meta.url);
// Words the picker does not show (the Takeaways' forbidden words, the GLOSSARY's Avoid words, and code in backticks).
const NOT_SHOWN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden|`|\bseries\b|\bmodel\b|\bgoal\b|variance|outlier|insight|\banswer\b|\bpage\b/i;
// The longest line that is shown whole.
const LONGEST = 340;
const MOST_LINES = 3;

/** The picker's text for each section of the guide that has both parts, as a JSON text. */
export function generate() {
  const out = {};
  for (const section of readFileSync(GUIDE, "utf8").split(/^## /m).slice(1)) {
    const title = section.split("\n")[0].trim();
    const use = section.match(/\*\*Use it when\.\*\*([\s\S]*?)\n\n/)?.[1];
    const dont = section.match(/\*\*Don't use it when\.\*\*([\s\S]*?)\n\n\*\*/)?.[1];
    if (!use || !dont) continue;
    const text = dont.trim();
    const lines = text.startsWith("- ") ? text.split(/\n(?=- )/).map((s) => s.slice(2).trim()) : [text];
    out[title] = { use: use.trim(), dont: lines.filter((s) => !NOT_SHOWN.test(s) && s.length <= LONGEST).slice(0, MOST_LINES) };
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = generate();
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== text) {
      console.error("packages/core/src/method-picker-texts.json is out of date: run node scripts/method-picker-texts.mjs");
      process.exit(1);
    }
    console.log("method-picker-texts.json is up to date.");
  } else {
    writeFileSync(OUT, text);
    console.log("Wrote packages/core/src/method-picker-texts.json");
  }
}
