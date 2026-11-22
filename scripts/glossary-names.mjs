// A warning for new words in the UI that the glossary does not know (GLOSSARY.md; ticket #571, part 5). Domain names
// are capitalised in the UI ("Share", "Target Range"); a capitalised word in the middle of a sentence that is in the
// glossary nowhere, nor in the allowlist below, is probably a new concept that needs an entry (or a name that is not
// one: add it to OK_WORDS). It only warns: a guess is not a reason to block a pull request.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Capitalised words that are not Ziffr concepts: calendar, products and places named in the UI. */
const OK_WORDS = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "June", "July", "August", "September", "October", "November", "December", "Slack", "Telegram", "Google", "GitHub", "Supabase", "Stripe", "Claude", "Anthropic", "Notion", "Zapier", "Excel", "Sheets", "Postgres", "SQL", "JSON", "CSV", "HTML", "Markdown", "Docker", "Gmail", "Microsoft", "Apple", "Mail", "Email", "English", "German", "Ziffr", "Please", "Sorry"]);

/** Every word the glossary uses, in any case. */
export function glossaryWords(text) {
  return new Set((text.match(/[A-Za-z][A-Za-z-]+/g) ?? []).map((w) => w.toLowerCase()));
}

/** Capitalised words in the middle of a sentence in the UI text of added lines (JSX text and string literals). */
export function candidateWords(addedLines) {
  const out = new Set();
  for (const line of addedLines) {
    if (/^\s*(\/\/|\*|\/\*|import )/.test(line)) continue;
    const texts = [...line.matchAll(/>([^<>{}]*[a-z][^<>{}]*)</g), ...line.matchAll(/(?:label|title|placeholder|aria-label|description)\s*[=:]\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    for (const t of texts) for (const m of t.matchAll(/[a-z,;:] ((?:[A-Z][a-z]{3,})(?: [A-Z][a-z]{2,})*)/g)) for (const w of m[1].split(" ")) out.add(w);
  }
  return [...out];
}

/** The candidates the glossary and the allowlist do not know. */
export function unknownWords(addedLines, glossary) {
  const known = glossaryWords(glossary);
  return candidateWords(addedLines).filter((w) => !OK_WORDS.has(w) && !known.has(w.toLowerCase()));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = `origin/${process.env.GITHUB_BASE_REF || "main"}`;
  const diff = execFileSync("git", ["diff", "-U0", `${base}...HEAD`, "--", "apps/web/src/**/*.tsx", ":!*.test.tsx"], { encoding: "utf8" });
  const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
  const words = unknownWords(added, readFileSync("GLOSSARY.md", "utf8"));
  for (const w of words) console.log(`::warning title=Not in GLOSSARY.md::"${w}" appears in new UI text. If it names a concept, add it to GLOSSARY.md; if not, add it to OK_WORDS in scripts/glossary-names.mjs.`);
  if (!words.length) console.log("No new capitalised name in the UI that the glossary lacks.");
}
