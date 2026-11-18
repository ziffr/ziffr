# 0022 Correct numbers: one way to read them, the workspace's way to write them, tested calculations

**Status:** in progress. **Tracking issue:** #106 (label `tracking`); tickets #107 to #115 and #118 carry `spec:0022`.

## Problem Statement

Ziffr is only useful if its numbers are right, and today three things can make them wrong without anyone noticing.

**Reading.** A value reaches Ziffr in six places, each with its own way of reading a number. The one used most, for chat messages, email replies and the personal form link, takes the first digits in the text with "." as the only decimal mark: `1,5` is recorded as 1, `12,50` as 12, `Q3 revenue 4500` as 3, and `−5` with a typographic minus as 5. Pasted breakdowns read the same text differently (`1.500` is 1500 there, 1.5 in a message), a typed Target Series cell turns `1.234,5` into 1.2345, and editing a target range with `1.000,5` silently removes the target. A very long number in a message becomes Infinity.

**Writing.** Every value is written the British way (`1,234.5`) and every currency as "€", whatever the Workspace is. A Workspace Profile has a currency, but nothing uses it. Units other than money ("d", "pc", "km") already exist on Metrics, but a currency is treated as a special case with a fixed sign, and nobody can write "$1,200" or "CHF 1'200".

**Calculating.** The calculations on values are tested with one to three hand-picked examples each, and probing them found real errors:
- A Derived Metric's formula ignores what it cannot read and returns a number anyway: `{a} {b}` gives a, `{a} ^ 2` gives a, `1e3 * {a}` gives 1, `.5 * {a}` gives 5·a.
- A Derived Metric whose inputs have different periods is always empty, and one with an input set to Aggregation none shows an empty quarter without saying why.
- Attainment is wrong at a target of 0 or below: "-Infinity%" in the comparison strip, 50 % for a value better than a negative target.
- "Add up all values" reads, adds in JavaScript and writes back, so two values arriving together can lose one, and it stores 0.30000000000000004.
- The deck export compares a point with the one before it rather than with the period before, so it shows a change across a gap that the app refuses to show.
- −0.4 shows as "−0", an impossible value as "∞", a NaN counts as on target, and a jump from 0 is never an Unusual Value.

## Solution

- **The Number Style is the Workspace's.** How digits are grouped and which mark is the decimal (`1,234.5`, `1.234,5`, `1 234,5`, `1'234.5`) is one setting per Workspace. It is used to write every value and to settle the one case where reading is ambiguous.
- **The unit is the Metric's.** What stands next to the number, and on which side, belongs to each Metric: "€" after, "$" before, "d" after, "pc" after, "%" after, "CHF" before. Money is one kind of unit among others, not a special case. The Workspace Profile's currency is only offered as the default unit for a new money Metric.
- **One number reader** in the core reads every value that arrives as text, the same way everywhere.
- **Calculations** refuse what they cannot compute instead of guessing, and are tested against a simple reference implementation with generated inputs, not only with examples.

## User Stories

1. As a person answering a Prompt in German, I want `1,5` recorded as 1.5, so that my value is not cut short.
2. As them, I want the reply to show the value as Ziffr read it, so that I see at once when it was read wrongly.
3. As someone writing "Q3 revenue 4500" or "2026: 1500", I want "Q3" and "2026" read as the period and 4500 or 1500 as the value, never 3 or 2026.
4. As someone answering in a sentence, such as "we had 2 signups last week" or "in week 46 we had 2 signups", I want the number recorded and the words that name a period understood as the period, not as the value.
5. As them, when my sentence names a different period than the Prompt asked for, I want Ziffr to ask which one I meant rather than booking it to either.
6. As someone sending a value without a Prompt, I want "yesterday" or "last week" to book it to that period, not to today's.
7. As an Owner, I want to set my Workspace's Number Style once, so that every page, message, export and chart writes numbers the way my team reads them.
8. As them, I want `1.500` read as fifteen hundred in a Workspace that writes `1.234,5`, and as one and a half in one that writes `1,234.5`, so that the ambiguous case follows the way we write.
9. As a Metric owner, I want to give a Metric any unit and say whether it stands before or after the number ("$1,200", "1.200 €", "12 d", "340 pc"), so that each Metric reads naturally.
10. As a Metric owner in a Workspace that works in dollars, I want a new money Metric to suggest "$" before the number, from the Workspace Profile.
11. As anyone reading a chart, I want short labels such as "1.2M", "126k €" or "12k pc" for every unit, so that axes stay readable and neighbouring ticks never share a label.
12. As a Metric owner, I want "Add up all values" never to lose a value or store rounding noise.
13. As anyone, I want a Derived Metric whose formula cannot be read, or whose inputs cannot be combined, to say so instead of showing a wrong number or nothing.
14. As anyone, I want Attainment, target status and changes to be right around zero and below it, and never to see "∞", "NaN", "-Infinity%" or "−0".
15. As someone presenting a deck, I want the exported numbers and changes to match what the app shows.
16. As someone opening the CSV export in a spreadsheet, I want its numbers and separators to fit the Workspace's Number Style.
17. As a developer, I want every calculation tested against a reference with generated inputs, and CI to fail when the tests stop covering it, so that "the numbers are right" is checked, not hoped.

## Implementation Decisions

- **Number Style** (glossary, new): a Workspace setting, one of `1,234.5` (the default, what every Workspace shows today), `1.234,5`, `1 234,5` and `1'234.5`. Only Owners and Admins change it, on the Workspace settings page; a change is audited. A new Workspace takes the style its Profile's country usually writes, if a country is set. It is stored as one of these four keys in a new column with a check, through the core.
- **Unit and its side** (Metric Description): `unit` stays free text (at most 12 characters) and gains `unit_position`, `before` or `after` (default `after`). Before is written without a space (`$1,200`, `CHF 1'200` keeps the space the unit itself ends with), after with one (`1.200 €`, `12 d`, `12 %`). A migration fills `unit` where it is empty today: "€" for `currency`, "%" for `percent`, so every Metric shows exactly what it shows now. From then on the display reads only the unit, its side, the decimals and the Number Style. `format` stays (`percent` still means values are stored as 12.5, not 0.125; `currency` still picks the money wording) but no longer adds a sign of its own. Choosing "Money" on a new Metric fills the unit from the Workspace Profile's currency (`EUR` → "€" after, `USD` → "$" before, `CHF` → "CHF " before, others as their code before); the owner may change it.
- **One reader** (`numbers.ts` in the core, pure, so the browser previews with the same rules): `readNumber(text, style)` reads one number written in either convention, with optional `+`, `-` or `−`, grouping by `.`, `,`, space, narrow space or `'`, a decimal part, and `k` or `M`. When a number has both marks, or a group that is not three digits, it can be read only one way, and it is (`1.234,5` is 1234.5 in every style; `1,5` is 1.5 in every style). Only a single mark followed by exactly three digits (`1.500`, `1,500`) is ambiguous, and the Number Style settles it. It returns null for anything else, and for a number that is not finite or is larger than 10^15 in size.
- **Values in sentences** (`readAnswer(text, style, today, metric period, year start)` in `numbers.ts`, replacing `parseValue`): a message, email reply or form value is read in fixed steps, the same for every Connector.
  1. **Period words are taken out first.** Words that name a period are read as the period and never as the value: "today", "yesterday", "this", "last" or "previous" with day, week, month, quarter or year, month names, "Q1" to "Q4", "H1" and "H2", "week 46", "KW 46", a year such as "2026", "FY 2026/27", and dates such as "12.11.", "12.11.2026", "2026-11-12" or "12 Nov", in each language the Workspace reads answers in (below). The period they name is resolved with the Metric's period and the Fiscal Year.
  2. **The period is checked.** In a reply to a Prompt, a named period that differs from the Prompt's records nothing; the reply asks which one was meant, naming both. Without a Prompt, a named period is used instead of the current one, and must be over or current, as for the API. A named period that is not one of the Metric's ("Q3" for a monthly Metric) records nothing either, and the reply says which periods the Metric counts. Without a named period, the Prompt's period or the current one applies, as today.
  3. **The value is what is left.** Digits that are part of a word (`2nd`, `3x`, `v2`) are not numbers. Exactly one number left is the value. None left records nothing, as today. Several left (`2 signups and 1 cancellation`) records nothing; the reply asks for the value alone, naming the numbers it found.
  4. **The reply says what was understood**: the value in the Number Style and the period by name, "2 recorded for Sign-ups, week of 9 Nov 2026", so a misreading is seen at once.

  Breakdowns keep their own line format. Breakdowns, pasted Target Series, typed Target Series cells and the target range edit all read their numbers with `readNumber`; their own number code is removed.
- **Languages of answers.** The steps above never depend on a language; only the words do. Each language is one word file in the core (`numbers/words/<code>.ts`), all of one shape:
  - the words for today, yesterday, and this or last with day, week, month, quarter and year;
  - the month names and their short forms;
  - abbreviations such as "Q3", "KW 46" or "T3" (*trimestre*);
  - the forms a word takes inside a sentence ("w październiku" for "październik").

  The words `Intl` already knows (`RelativeTimeFormat` for "last week", `DateTimeFormat` for month names) are generated from it by a script and checked in, so a file is reviewed like code and does not change with the runtime. Abbreviations and inflected forms are added by hand. The order of day and month in a date such as "12/11" comes from the Workspace's country (month first in the US, day first elsewhere); "2026-11-12" works everywhere.
  - **Which languages are tried** is a Workspace setting, **Answer languages**, set by Owners and Admins and audited: English plus the language of the Workspace's country by default. Only those are tried, so words of different languages ("Mai", "mar") never collide.
  - **A language Ziffr does not know** is safe rather than wrong. Its words are skipped, and the rules still decide: one number left goes to the Prompt's period, several ask back.
  - **The first version** (#109) reads English and German. #118 adds the setting, the script, French, Spanish, Italian and Dutch, and a contributor guide (`docs/guides/answer-languages.md`): adding a language is one file and its rows in the sentence table.
  - **Number words** ("two", "zwei", "a dozen") are not read. "One of our customers" would otherwise hold a value.
- **Writing** (`formatValue`, `compactValue`): both take the Number Style. `compactValue` shortens every unit at 10,000 and above to `k` and `M` with one decimal where it is needed (`1.2M`, `126k €`, `12k pc`), never `1000k`. Percentage changes are written one way everywhere, by one function. `−0` is written as `0`; a value that is not finite is written as "–" and never reaches a chart.
- **Add up in the database.** "Add up all values" becomes one SQL statement (`value = value + $1`) in a function the core calls, so two values arriving together both count, and the sum is rounded to 6 decimals there to drop floating-point noise. Values are stored as received; only the display rounds to the Metric's decimals.
- **Formulas.** `evaluate` reads its whole formula or refuses it: any character it does not know, a missing or extra bracket, two values without an operator, or a number such as `.5` or `1e3` gives null. A function `checkFormula(formula, inputs)` says why a formula is refused, and the core calls it wherever a formula is written (today only seeds and the trial seed; any later editor gets it for free). A Derived Metric whose inputs have different periods, or whose inputs are set to Aggregation none, is refused when written, and an existing one shows the reason on its page and in widgets ("Its inputs are counted by different periods") instead of an empty chart.
- **Around zero.** Attainment is computed against the distance to the target, so that it is right for targets at or below zero and for all three polarities, or it is null where no percentage means anything (target 0 for "higher is better" shows the difference instead). `health` and `targetStatus` return neutral for a value that is not finite. The Unusual Value check treats a change from 0 as unusual when the new value is not 0.
- **Export.** The deck export takes its changes from `compare()`, as the app does, and rounds to the Metric's decimals. The trial's CSV export writes values in the Number Style and uses `;` as the separator when the decimal mark is a comma.
- **Glossary.** Adds **Number Style**: "How a Workspace writes numbers: how digits are grouped and which mark is the decimal, such as 1,234.5 or 1.234,5. It also settles how an ambiguous number such as 1.500 is read. _Avoid_: Locale, number format, regional settings". Changes **Metric Description**: "unit and which side of the number it stands on, format". Lands with ticket 2.

## Testing Decisions

- **Reading:** one table of texts with their expected value in each Number Style, run against `readNumber`, `parseValue` and every caller (form, Slack, Telegram, email, breakdowns, pasted and typed Target Series, target range), so no two places can read the same text differently. It includes `1,5`, `12,50`, `1.500`, `1,500`, `1.234,5`, `1'234.5`, `1 234,5`, `2,5k`, `−5`, `+5`, `1e3`, `Q3 revenue 4500`, a 400-digit number and text with no number.
- **Sentences:** a second table of answers in every language with a word file (English and German first), each with the value and period `readAnswer` must find, or that it must ask back and why, for a weekly, monthly, quarterly and yearly Metric, a fixed today and a Fiscal Year from April: "we had 2 signups last week", "in week 46 we had 2 signups", "KW 46: 2", "wir hatten letzte Woche 2 Anmeldungen", "2 signups, 1 churn", "Q3 revenue 4500", "October: 12,5", "yesterday 340 pc", "12.11.: 4", a reply to last week's Prompt that says "this week 3", and a future period. The database tests send some of them through email, Slack and Telegram replies, with and without a Prompt. A test fails when a word file has no rows in the table, or when two answer languages offered together share a word that names different periods.
- **Writing:** a table of values, units, sides, decimals and Number Styles to their text, including negatives, −0.4, very large and very small values, and `compactValue` at its thresholds.
- **Generated-input tests** (fast-check) for combining periods: for random series with negatives, decimals and gaps, every Aggregation, every Display Period and every Fiscal Year start, `seriesBy` agrees with a reference that combines naively; a quarter's sum is the sum of its months; an average lies between the lowest and highest value; "last" is the latest; reordering the input changes nothing; Comparisons equal the difference of the points they compare.
- **Formulas:** a table of malformed formulas that must give null, and generated formulas checked against a reference evaluator.
- **Around zero:** Attainment, target status and changes for targets below, at and above zero, for every polarity.
- **Database:** "Add up all values" with two values sent at the same moment records both; decimals do not leave noise.
- **Coverage:** `@vitest/coverage-v8` in the core, with a threshold on the calculation modules (`numbers`, `display-periods`, `formula`, `compare`, `format`, `parse`, `correlation`) that CI enforces.
- Screens that change (settings, the Metric form, charts) are tried in the running app in both Number Styles.

## Tickets

1. #107 Read decimal commas in messages and the form, and refuse numbers that are not finite (the quick fix, before the setting exists).
2. #108 The Number Style: the setting, its column, the settings page, the default from the country; glossary.
3. #109 One reader: `readNumber` used by every way a value arrives, and `readAnswer` for sentences (period words, the check against the Prompt's period, one number or a question back, the reply naming value and period), with both test tables (needs 1 and 2).
4. #110 The unit's side and writing: `unit_position`, the migration filling units, the Metric forms, `formatValue` and `compactValue` in the Number Style, one way to write percentage changes (needs 2).
5. #111 "Add up all values" in one database statement.
6. #112 Formulas read whole or refused, `checkFormula`, Derived Metrics with inputs that cannot be combined say why.
7. #113 Around zero: Attainment, target status, the Unusual Value check from 0, no ∞, NaN or −0 shown.
8. #114 The deck export uses `compare()` and the Metric's decimals; the CSV export follows the Number Style (needs 2).
9. #115 Generated-input tests for combining periods and formulas against a reference, and coverage thresholds in CI.
10. #118 Answer languages: the setting, word files generated from `Intl`, French, Spanish, Italian and Dutch, and the contributor guide (needs 3).

## Out of Scope

- A Number Style per person. A person reading a Workspace in another style is rare; when it matters, a person setting can override the Workspace's later.
- Converting between currencies. A unit is a label; Ziffr never changes a value because of it.
- Ziffr's own texts (pages, Prompts, replies) in other languages. They stay English; translating Ziffr is a spec of its own, which the word files will be part of.
- Units that change with the size of a value (seconds to minutes, kg to t).
- Reading answers with an AI model. Fixed rules give the same result for the same text, keep the values on the server, and cover the short answers Prompts get. If it is ever added, it only suggests a reading for a message the rules could not read ("Did you mean 2 for last week?"), and the person confirms it; it never records a value by itself.

## Further Notes

- **Why the style is the Workspace's and the unit the Metric's.** A team reads its numbers one way, whatever they count, so the digits belong to the Workspace. What they count differs per Metric (days, pieces, euros, dollars, kilometres), so the unit and its side belong to the Metric. Money is not special: "€" is a unit like "d".
- **Why ask back instead of guessing.** A wrong number recorded quietly is worse than a question: it reaches dashboards, decks and Workflows before anyone sees it. Every Connector already replies, so asking costs one message.
