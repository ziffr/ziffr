#!/usr/bin/env node
// Writes the words `Intl` knows into the Answer Language word files (spec 0022, #118; GLOSSARY: Answer Language):
// "today", "last week" and the like from RelativeTimeFormat, the month names from DateTimeFormat. The output is
// checked in, so a word file is reviewed like code and does not change with the runtime.
//
//   node scripts/answer-words.mjs            rewrites the generated block of every word file
//   node scripts/answer-words.mjs pt         also starts packages/core/src/numbers/words/pt.ts for a new language
//   node scripts/answer-words.mjs --check    fails when a file's generated block differs from this runtime's Intl
//
// Only the block between "// fromIntl:" and "// end fromIntl" is written; the words added by hand stay as they are.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "../packages/core/src/numbers/words");
const UNITS = ["day", "week", "month", "quarter", "year"];
const START = "  // fromIntl: generated from Intl by scripts/answer-words.mjs, do not edit by hand.";
const END = "  // end fromIntl";

const lower = (code, s) => s.toLocaleLowerCase(code).normalize("NFC");
// "janv." and "Jan." are written without their dot: the reader takes an optional dot after any month word.
const bare = (s) => s.replace(/\.$/, "");

/** The generated block of a language, as TypeScript lines. */
function block(code) {
  const rtf = new Intl.RelativeTimeFormat(code, { numeric: "auto" });
  const rel = UNITS.map((u) => `      ${u}: { this: [${JSON.stringify(lower(code, rtf.format(0, u)))}], last: [${JSON.stringify(lower(code, rtf.format(-1, u)))}] },`);
  const months = Array.from({ length: 12 }, (_, m) => {
    const d = new Date(Date.UTC(2026, m, 15));
    const f = (o) => new Intl.DateTimeFormat(code, { ...o, timeZone: "UTC" });
    // The name alone, its short form, and the form it takes in a date (genitive in some languages).
    const inDate = f({ day: "numeric", month: "long" }).formatToParts(d).find((p) => p.type === "month")?.value ?? "";
    const forms = [f({ month: "long" }).format(d), f({ month: "short" }).format(d), inDate].map((s) => bare(lower(code, s))).filter(Boolean);
    return `      [${[...new Set(forms)].map((w) => JSON.stringify(w)).join(", ")}],`;
  });
  return [START, "  fromIntl: {", "    relative: {", ...rel, "    },", "    months: [", ...months, "    ],", "  },", END].join("\n");
}

/** A word file for a language Ziffr has no words for yet: the generated block, and empty lists to fill by hand. */
function newFile(code) {
  const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  return `// ${name} words that name a Period in an answer (spec 0022; GLOSSARY: Period, Answer Language). The shape is in
// ../languages.ts; docs/guides/answer-languages.md says what to add by hand.
import type { AnswerWords } from "../languages";

/** ${name}. */
export const ${code}: AnswerWords = {
  code: "${code}",
  name: "${name}",
${block(code)}
  byHand: {
    relative: {},
    months: [[], [], [], [], [], [], [], [], [], [], [], []],
    monthsOnlyWithDate: [],
    week: { before: [], after: [] },
    quarter: { before: [], after: [] },
    half: { before: [], after: [] },
    fiscalYear: [],
    ordinal: [],
    dateWords: [],
    reply: { yes: [], no: [], greetings: [], closings: [], sentFrom: [] },
  },
};
`;
}

const args = process.argv.slice(2);
const check = args.includes("--check");
for (const code of args.filter((a) => !a.startsWith("--"))) {
  if (!/^[a-z]{2,3}$/.test(code)) throw new Error(`${code} is not a language code such as "pt".`);
  const file = join(DIR, `${code}.ts`);
  if (!existsSync(file)) { writeFileSync(file, newFile(code)); console.log(`Started ${file}: add it to ANSWER_LANGUAGES and fill byHand.`); }
}
let stale = 0;
for (const name of readdirSync(DIR).filter((n) => /^[a-z]{2,3}\.ts$/.test(n))) {
  const file = join(DIR, name);
  const text = readFileSync(file, "utf8");
  const from = text.indexOf(START);
  const to = text.indexOf(END);
  if (from < 0 || to < 0) throw new Error(`${name} has no generated block between "${START.trim()}" and "${END.trim()}".`);
  const next = text.slice(0, from) + block(name.slice(0, -3)) + text.slice(to + END.length);
  if (next === text) continue;
  if (check) { stale++; console.error(`${name}: the generated words differ from this runtime's Intl.`); continue; }
  writeFileSync(file, next);
  console.log(`Wrote ${name}.`);
}
if (stale) process.exit(1);
