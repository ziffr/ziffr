# Adding an Answer Language

People answer Prompts in sentences: "we had 2 signups last week", "KW 46: 2", "la semaine dernière 2". Ziffr reads the words that name a period as the period and the one number left as the value (spec 0022, "Values in sentences"). The rules never depend on a language. Only the words do. Each language is one file, so adding one is a small, reviewable change:

1. one word file in `packages/core/src/numbers/words/<code>.ts`;
2. its line in `ANSWER_LANGUAGES` (and, if a country speaks it, in `COUNTRY_LANGUAGES`) in `packages/core/src/numbers/languages.ts`;
3. its rows in the sentence table in `packages/core/src/numbers.test.ts`.

No migration is needed: the database stores a Workspace's Answer Languages as codes and the core keeps only codes it has a file for.

## 1. Start the file

```sh
node scripts/answer-words.mjs pt
```

This writes `pt.ts` with the words `Intl` already knows, between `// fromIntl:` and `// end fromIntl`:

- **relative**: "today", "yesterday", and this or last day, week, month, quarter and year, from `Intl.RelativeTimeFormat`;
- **months**: each month's name, its short form and the form it takes in a date, from `Intl.DateTimeFormat`.

That block is generated and checked in, so it does not change when Node's ICU data does. Never edit it by hand. Run the script again (without a code) to regenerate every file; `--check` fails when a file differs from the running Node's `Intl`, which shows when an upgrade would change words.

## 2. Add the words by hand

Everything under `byHand` is yours. Every word is written in lower case. An apostrophe matches both `'` and `’`, and any run of spaces matches one.

| Field | What goes in | Example (French) |
| --- | --- | --- |
| `relative` | Other ways to say this or last week, month, quarter or year, including the forms a phrase takes inside a sentence | `week: { last: ["semaine dernière", "la semaine passée"] }` |
| `months` | Twelve lists, January first: forms `Intl` misses, such as spellings without accents or inflected forms ("w październiku" in Polish) | `[[], ["fevrier"], …]` |
| `monthsOnlyWithDate` | Month words that are also everyday words, here or in another language: they name a month only next to a day or a year | Italian `"set"`, Spanish `"ago"`, English `"may"` |
| `week`, `quarter`, `half` | Words before a number (`before`: "semaine 46", "T3", "S1") or after an ordinal (`after`: "3e trimestre") | `quarter: { before: ["t", "trimestre"], after: ["trimestre"] }` |
| `fiscalYear` | Words before a Fiscal Year ("exercice 2026/27") | `["exercice", "fy"]` |
| `ordinal` | What follows a number to make it an ordinal | `["e", "er", "ème"]` |
| `dateWords` | Words between a day, its month and its year | Spanish `["de"]` for "12 de noviembre de 2026" |

Leave out number words ("deux", "a dozen"): "one of our customers" would otherwise hold a value.

## 3. Add its rows to the sentence table

Each row in `SENTENCES` is an answer with what `readAnswer` must find for a weekly, monthly, quarterly and yearly Metric (today is 18 November 2026, the Fiscal Year starts in April), or why it must ask back. Give your language at least the common shapes:

```ts
{ lang: "pt", text: "na semana passada tivemos 2 inscrições", week: v(2, "2026-11-09"), month: NOT, quarter: NOT, year: NOT },
{ lang: "pt", text: "outubro: 12,5", week: NOT, month: v(12.5, "2026-10-01"), quarter: NOT, year: NOT },
{ lang: "pt", text: "ontem 340", ...now(340) },
```

Each row is read in English, German and its own language together, as a Workspace in a country that speaks it would read it.

## What the tests check

`pnpm --filter @ziffr/core test` fails when:

- a language in `ANSWER_LANGUAGES` has no row in the sentence table;
- two languages share a word that names different periods. "mar" is March in English, Spanish and Italian, which is fine. A word that is March in one language and May in another would not be. Rename it, move it to `monthsOnlyWithDate`, or leave it out;
- a row reads differently than it says.

## How Workspaces get it

A Workspace reads answers in its **Answer Languages** (GLOSSARY: Answer Language). Until an Owner or Admin picks them on **Workspace → General**, these are English plus the languages of the Workspace Profile's country. A language Ziffr has no file for is skipped safely: its words name nothing, and an answer with exactly one number still goes to the Prompt's period.
