# 0022 Correct numbers: one way to read them, the workspace's way to write them, tested calculations

**Status:** in progress. **Tracking issue:** #106 (label `tracking`); tickets #107 to #115, #118, #126 and #130 carry `spec:0022`.

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
17. As anyone relying on Ziffr's numbers, I want every calculation, above all every aggregation from granular values into longer periods, proven equal to an independent reference for every combination of period, Aggregation, Display Period and Fiscal Year, so that "the numbers are right" is checked, not hoped.

## Implementation Decisions

- **Number Style** (glossary, new): a Workspace setting, one of `1,234.5` (the default, what every Workspace shows today), `1.234,5`, `1 234,5` and `1'234.5`. Only Owners and Admins change it, on the Workspace settings page; a change is audited. A new Workspace takes the style its Profile's country usually writes, if a country is set. It is stored as one of these four keys in a new column with a check, through the core.
- **Unit and its side** (Metric Description): `unit` stays free text (at most 20 characters, as the forms and the API already allow) and gains `unit_position`, `before` or `after` (default `after`). Before is written without a space (`$1,200`, `CHF 1'200` keeps the space the unit itself ends with), after with one (`1.200 €`, `12 d`, `12 %`). A migration fills `unit` where it is empty today: "€" for `currency`, "%" for `percent`, so every Metric shows exactly what it shows now. From then on the display reads only the unit, its side, the decimals and the Number Style. `format` stays (`percent` still means values are stored as 12.5, not 0.125; `currency` still picks the money wording) but no longer adds a sign of its own. Choosing "Money" on a new Metric fills the unit from the Workspace Profile's currency (`EUR` → "€" after, `USD` → "$" before, `CHF` → "CHF " before, others as their code before); the owner may change it. A Metric created without a unit (a program may leave it out) gets the same proposal, "%" for a percent; a Metric made from the catalog as money takes the Profile's currency too. Metrics kept in Snapshots and frozen View Links before units had a side, and Versions restored from then, get the unit their format used to add when they are read, so they show what they showed.
- **One reader** (`numbers.ts` in the core, pure, so the browser previews with the same rules): `readNumber(text, style)` reads one number written in either convention, with optional `+`, `-` or `−`, grouping by `.`, `,`, space, narrow space or `'`, a decimal part, and `k` or `M`. When a number has both marks, or a group that is not three digits, it can be read only one way, and it is (`1.234,5` is 1234.5 in every style; `1,5` is 1.5 in every style). Only a single mark followed by exactly three digits (`1.500`, `1,500`) is ambiguous, and the Number Style settles it. It returns null for anything else, and for a number that is not finite or is larger than 10^15 in size.
- **Values in sentences** (`readAnswer(text, { style, today, period, yearStart, promptPeriod, languages })` in `numbers.ts`, replacing `parseValue`): a message, email reply or form value is read in fixed steps, the same for every Connector.
  1. **Period words are taken out first.** Words that name a period are read as the period and never as the value: "today", "yesterday", "this", "last" or "previous" with day, week, month, quarter or year, month names, "Q1" to "Q4", "H1" and "H2", "week 46", "KW 46", a year such as "2026", "FY 2026/27", and dates such as "12.11.", "12.11.2026", "2026-11-12" or "12 Nov", in each language the Workspace reads answers in (below). The period they name is resolved with the Metric's period and the Fiscal Year:
     - A month, week, quarter, half or date named without a year is the latest one that has begun ("December" in November is last December); answers are about what happened.
     - One year number names the Fiscal Year that starts in it, as Ziffr names years: with April, "2026" and "FY 2026" are FY 2026/27, and "Q4 2026" is its Q4 (January 2027).
     - A day ("yesterday", "12.11.") names the Metric's period it falls in. Any other span names only a period of the same length: "last week" is no period of a monthly Metric.
     - A month word that is also an everyday word ("may") names a month only next to a day or a year; a month followed by a bare number ("November 12") is a month and a value, a date only with an ordinal or a year ("Nov 12th", "November 12, 2026").
     - A year that is the whole answer ("2026") is the value, not the period.
     - A date with a slash ("12/11", "12/11/2026") is day first, or month first where the Workspace's country writes it so (the US); "11/2026" is a month.
  2. **The period is checked.** In a reply to a Prompt, a named period that differs from the Prompt's records nothing; the reply asks which one was meant, naming both. Without a Prompt, a named period is used instead of the current one, and must be over or current, as for the API. A named period that is not one of the Metric's ("Q3" for a monthly Metric) records nothing either, and the reply says which periods the Metric counts. Without a named period, the Prompt's period or the current one applies, as today.
  3. **The value is what is left.** Digits that are part of a word (`2nd`, `3x`, `v2`) are not numbers. Exactly one number left is the value. None left records nothing, as today. Several left (`2 signups and 1 cancellation`) records nothing; the reply asks for the value alone, naming the numbers it found.
  Each reason to ask back is an outcome of its own in the intake log: `rejected_several_numbers`, `rejected_several_periods`, `rejected_other_period` and `rejected_not_a_period`; a period still to come or one that does not exist ("week 60") is `rejected_period`, as for the API.
  4. **The reply says what was understood**: the value in the Number Style and the period by name, "2 recorded for Sign-ups, week of 9 Nov 2026", so a misreading is seen at once.

  Breakdowns keep their own line format. Breakdowns, pasted Target Series, typed Target Series cells and the target range edit all read their numbers with `readNumber`; their own number code is removed.
- **Languages of answers.** The steps above never depend on a language; only the words do. Each language is one word file in the core (`numbers/words/<code>.ts`), all of one shape:
  - the words for today, yesterday, and this or last with day, week, month, quarter and year;
  - the month names and their short forms;
  - abbreviations such as "Q3", "KW 46" or "T3" (*trimestre*);
  - the forms a word takes inside a sentence ("w październiku" for "październik");
  - month words that are also everyday words ("may", Italian "set", Spanish "ago"), which name a month only next to a day or a year, and the words between a day, its month and its year ("12 de noviembre").

  The words `Intl` already knows (`RelativeTimeFormat` for "last week", `DateTimeFormat` for month names) are generated from it by a script (`scripts/answer-words.mjs`, which only rewrites the block between `// fromIntl:` and `// end fromIntl`) and checked in, so a file is reviewed like code and does not change with the runtime. Abbreviations and inflected forms are added by hand. The order of day and month in a date such as "12/11" comes from the Workspace's country (month first in the US, day first elsewhere); "2026-11-12" works everywhere.
  - **Which languages are tried** is a Workspace setting, **Answer languages**, set by Owners and Admins and audited (`workspace.answer_languages_changed`): English plus the languages of the Workspace's country by default (several for Belgium, Switzerland and Luxembourg). It is stored as language codes in `workspaces.answer_languages`, whose check holds only the shape, so adding a language needs no migration; the core keeps the codes it has a word file for. Only those are tried, so words of different languages ("Mai", "mar") never collide.
  - **A language Ziffr does not know** is safe rather than wrong. Its words are skipped, and the rules still decide: one number left goes to the Prompt's period, several ask back.
  - **The first version** (#109) reads English and German. #118 adds the setting, the script, French, Spanish, Italian and Dutch, and a contributor guide (`docs/guides/answer-languages.md`): adding a language is one file and its rows in the sentence table.
  - **Number words** ("two", "zwei", "a dozen") are not read. "One of our customers" would otherwise hold a value.
- **Writing** (`formatValue`, `compactValue`): both take the Number Style. `compactValue` shortens every unit at 10,000 and above to `k` and `M` with one decimal where it is needed (`1.2M`, `126k €`, `12k pc`), never `1000k`. Percentage changes are written one way everywhere, by one function. `−0` is written as `0`; a value that is not finite is written as "–" and never reaches a chart. The style reaches every writer as a required argument (`CanvasData.numberStyle` for Snapshots, View Links and decks, like `yearStart`), so a caller that forgets it does not compile. Below 10,000 `compactValue` writes what `formatValue` writes.
- **Add up in the database.** "Add up all values" becomes one SQL statement (`value = value + $1`) in a function the core calls, so two values arriving together both count, and the sum is rounded to 6 decimals there to drop floating-point noise. Values are stored as received; only the display rounds to the Metric's decimals.
- **Formulas.** `evaluate` reads its whole formula or refuses it: any character it does not know, a missing or extra bracket, two values without an operator, or a number such as `.5` or `1e3` gives null. A function `checkFormula(formula, inputs, metric)` says why a formula is refused, and the core calls it wherever a formula is written (today only the trial seed; the demo's formulas are seeded in SQL and checked by a database test; any later editor gets it for free). A Derived Metric whose inputs have different periods, or another period than its own, or whose inputs are set to Aggregation none, or are Derived Metrics themselves (series are computed one level deep), is refused when written, and an existing one shows the reason on its page and in widgets ("Its inputs are counted by different periods") instead of an empty chart.
- **Around zero.** Attainment by distance (below) is computed against the distance to the target, so that it is right for targets at or below zero and for all three polarities, or it is null where no percentage means anything (target 0 for "higher is better" shows the difference instead). `health` and `targetStatus` return neutral for a value that is not finite. The Unusual Value check treats a change from 0 as unusual when the new value is not 0.
- **Two ways to compute Attainment, chosen per Metric** (#130). Both are kept, because each is right for different Metrics:
  - **Ratio** is value ÷ target, or target ÷ value for "lower is better". It is what Ziffr showed up to 0.9.0, is familiar, and is never negative for positive values. It has no percentage where a ratio means nothing: a target at or below zero, or a value at or below 0 for "lower is better" (target ÷ 0 is no number, and a negative ratio would call the best value the worst). There the difference to the target is shown instead.
  - **Distance** is 100 % plus the distance to the target, in steps of the target's size. It reads the same in every direction and works around zero.

  For "higher is better" with a positive target, the two give the same number; they differ for "lower is better" (5 against at most 10: Ratio 200 %, Distance 150 %) and around zero.
  - **Where it is set:** a Workspace default (`workspaces.attainment_method`), set by Owners and Admins and audited (`workspace.attainment_method_changed`). Existing Workspaces get Ratio, so nothing changes from 0.9.0; new ones start with Ratio too, the familiar method. Each Metric may override the default in its Metric Description (`metrics.attainment_method`, null to follow the Workspace). `attainment()` and `summary()` take the Workspace's method as a required argument (`CanvasData.attainmentMethod` for widgets, Snapshots, View Links and decks), so a caller that forgets it does not compile.
  - **No per-viewer switch.** Everyone sees the same number for the same value, and the tooltip names the method.
  - **Snapshots and View Links** keep the method they were made with: a Snapshot and a frozen View Link keep the Workspace's method and each Metric's own as they were then, unlike the Number Style; one made before the choice existed keeps Ratio. A live View Link shows the dashboard as it is now, so it follows the current methods.
  - Both methods are in the Calculation Catalogue, each with its reference, and table tests for every polarity and for targets and values below, at and above zero.
  - **Glossary:** **Attainment** names both methods.
- **Export.** The deck export takes its changes from `compare()`, as the app does, and rounds to the Metric's decimals. The trial's CSV export writes values in the Number Style and uses `;` as the separator when the decimal mark is a comma. The change on a slide is the widget's first comparison ("vs prev. +4.2 %"), none where the app says n/a. Chart values are rounded to the Metric's decimals and carry a number format with its unit, but PowerPoint writes a chart's digits in the locale of the computer that opens the file, so charts cannot follow the Number Style. The CSV writes values without group marks and with every decimal stored (up to 6), so a spreadsheet reads them as numbers, and a negative value is not escaped as a formula.
- **Glossary.** Adds **Number Style**: "How a Workspace writes numbers: how digits are grouped and which mark is the decimal, such as 1,234.5 or 1.234,5. It also settles how an ambiguous number such as 1.500 is read. _Avoid_: Locale, number format, regional settings". Changes **Metric Description**: "unit and which side of the number it stands on, format". Lands with ticket 2.

## Testing Decisions

- **Reading:** one table of texts with their expected value in each Number Style, run against `readNumber`, `parseValue` and every caller (form, Slack, Telegram, email, breakdowns, pasted and typed Target Series, target range), so no two places can read the same text differently. It includes `1,5`, `12,50`, `1.500`, `1,500`, `1.234,5`, `1'234.5`, `1 234,5`, `2,5k`, `−5`, `+5`, `1e3`, `Q3 revenue 4500`, a 400-digit number and text with no number.
- **Sentences:** a second table of answers in every language with a word file (English and German first), each with the value and period `readAnswer` must find, or that it must ask back and why, for a weekly, monthly, quarterly and yearly Metric, a fixed today and a Fiscal Year from April: "we had 2 signups last week", "in week 46 we had 2 signups", "KW 46: 2", "wir hatten letzte Woche 2 Anmeldungen", "2 signups, 1 churn", "Q3 revenue 4500", "October: 12,5", "yesterday 340 pc", "12.11.: 4", a reply to last week's Prompt that says "this week 3", and a future period. The database tests send some of them through email, Slack and Telegram replies, with and without a Prompt. A test fails when a word file has no rows in the table, or when two answer languages offered together share a word that names different periods.
- **Writing:** a table of values, units, sides, decimals and Number Styles to their text, including negatives, −0.4, very large and very small values, and `compactValue` at its thresholds.
- **Verification is the first requirement of this spec.** Every calculation Ziffr does on values is listed, has a rule written down, an independent reference implementation, and tests that prove the code equals the reference for every combination of its inputs. "Tested with a few examples" does not count. The points below say what that means.
- **The Calculation Catalogue** (`docs/reference/calculations.md`): one entry per calculation, with its rule in plain words, the code that does it (file and function), its reference implementation and its tests:
  - each Aggregation (sum, average, last, none) from each Period into each longer Display Period;
  - the half-the-periods rule, partial spans, to-date spans and the Comparison cut;
  - Target Series combined;
  - Derived Metrics per period and over spans;
  - the Submission Rules (overwrite, add, keep both, reject) and breakdown totals;
  - changes and percentage changes, Attainment, target status and health, the Unusual Value check;
  - Comparisons, correlation and the forecast;
  - Snapshot and View Link values, widget numbers, the deck and CSV exports, and the API's and MCP's values;
  - rounding to the Metric's decimals.

  A test fails when an exported function of a calculation module has no catalogue entry, so a new calculation cannot slip in untested.
- **Reference implementations** (`packages/core/src/test/reference/`) are written separately from the code they check, as plainly as possible:
  - they walk every calendar day and use exact decimal arithmetic on the values' text;
  - they share no helper with the code under test except the types;
  - each reference has its own small tests with sums worked out by hand.
- **Aggregations, exhaustively.** For every source Period (day, week, month, quarter, year), every longer Display Period (week, month, quarter, half-year, year), every Aggregation and every Fiscal Year start (all twelve months), `seriesBy` and everything built on it must equal the reference. This holds for:
  - hand-made edge cases: an empty series; one value; a span with exactly half and one short of half of its periods; a span that starts before the first value; week 53; a week crossing a month, quarter or year boundary; 29 February; the current span to date; a Snapshot's day; a Comparison point in the middle of a span;
  - generated series (fast-check, at least 1,000 runs per combination in CI, with a fixed seed reported on failure): random gaps, negative values, zeros, values with up to six decimals, very large and very small values, duplicate periods, unsorted input.

  Invariants checked on top of the reference:
  - a sum over a year equals the sum of its quarters' sums and of its months' sums wherever every span is complete;
  - an average lies between the lowest and highest value it averages;
  - "last" is the value of the latest period with one;
  - reordering the input changes nothing;
  - "none" never combines;
  - every Metric period is counted in exactly one span.
- **Exact results.** A sum or average must equal the exact decimal result rounded to the Metric's decimals, never a floating-point neighbour. Tests include values chosen to break floating point: 0.1 + 0.2, a thousand values of 0.01, values ending in 5 at the rounding digit. Where JavaScript numbers cannot meet this, the calculation is done on scaled integers.

  _Made precise in #115:_ a sum or average is the double nearest to the exact decimal result (ties to the even one), so 0.1 + 0.2 is 0.3 and 1,095 days of 0.01 add up to three years of 3.65. `seriesBy` and `targetsBy` add the values' text as scaled BigInts and divide once at the end. Rounded to the Metric's decimals (half away from zero, as the display rounds) this equals the exact result rounded wherever a double can carry it: up to 15 significant digits, and for an average that never ends (1/3) below a million. Larger sums, such as 400 values near 10^15, are the nearest double and no closer.
- **The rules the references apply** (written down in #115, where the code and the wording above left them open):
  - a Metric period belongs to the span its first day falls in: a week to the month, quarter and year its Monday is in, so week 53 of 2026 (28 December to 3 January) is December's and 2026's, and ISO week 1 of 2026 (from 29 December 2025) is December 2025's;
  - a period given more than once counts once, with the value given last (the latest value of a period, as a chart plots it); the order the values come in changes nothing else;
  - a span is shown when it holds a value and at least half of the Metric periods it counts, rounded up (2 of 3 months, 7 of 13 weeks, 183 of 365 days); the span today falls in counts the periods up to its latest value;
  - the Comparison cut: every span is cut where the latest period sits in its own span, the same number of days in for days and weeks, and for longer spans the same month of the span and the same day of the month, or that month's last day when it is shorter (31 May is 28 or 29 February a quarter back; 30 April is 30 March a month back);
  - YoY for a weekly Metric compares with the week 52 weeks before, the one most of whose days fall on the same dates; the same date a year back is rarely a Monday, so before #115 weekly YoY was never available. A daily Metric compares with the same date a year back, 28 February for 29 February;
  - a Snapshot keeps the Metric periods over by its last day and is combined as of the day after, when its period is over.
- **Derived Metrics, exhaustively.** For every combination of the inputs' Aggregations and every Display Period, the value over a span is computed from the inputs' combined values. This includes inputs with gaps, an input that is zero (division), and the refusals (inputs with another period, Aggregation none, an input that is itself derived) giving their reason rather than a number. Generated formulas, random trees of + − × ÷ and brackets over 1 to 4 inputs, are checked against a reference evaluator. A table of malformed formulas must give null.

  _Made precise in #126:_
  - a formula is worked out exactly on its inputs' text and its own numbers, and gives the double nearest to the result: `{a} - {b}` for 0.3 and 0.1 is 0.2, a margin the nearest double to the exact margin. White space of any kind separates; a division by zero or an input that is not a number gives no value; a formula is at most 500 characters long, with at most 50 operations (+ − × ÷ and minus signs) and 20 digits in a number, or it is refused with the reason; every step is kept in lowest terms, and one whose numerator or denominator passes 8,192 bits gives no value (with values as Ziffr keeps them, at most 10^15 with six decimals, no formula within the bounds gets near it);
  - over a longer span, each input is combined by its own Aggregation over the span's Metric periods and counts when it holds at least half of them; the formula is worked out on the combined values as Ziffr holds them (the double nearest to each, as an average of 1/3 cannot be held exactly). A span is shown when every input counts and the formula has a value; spans are looked for wherever an input has a value, so two inputs that each hold half of a year count even without a month of both. What a span holds is what the input with the fewest values holds; the span today falls in is cut at the Derived Metric's latest period;
  - an input that is a Derived Metric itself is refused with its reason everywhere a Derived Metric is shown or combined, as inputs of another period are.
- **Same number everywhere.** For a fixed workspace in the database, one test reads the same Metric and span through every path:
  - a widget's data (`shownData`);
  - a Snapshot and a View Link;
  - a Comparison;
  - the deck export;
  - the CSV export;
  - the API and the MCP Server.

  It checks that each one shows the reference's number. A path that computes on its own fails here.
- **Mutation testing** (Stryker) runs on every calculation module every night and before each release; a release is blocked when it fails. On a pull request it runs only on the calculation files that pull request changes (Stryker's incremental mode, `--mutate` limited to the diff), so an ordinary change waits minutes, not half an hour. It changes the code on purpose (a `<` into `<=`, a `+` into `-`) and checks that a test fails. A surviving change is a gap in the tests and is fixed, or recorded in the catalogue with the reason it cannot matter. The score must not fall below 95 % on the calculation modules.
- **Formulas:** a table of malformed formulas that must give null, and generated formulas checked against a reference evaluator.
- **Around zero:** Attainment, target status and changes for targets below, at and above zero, for every polarity.
- **Database:** "Add up all values" with two values sent at the same moment records both; decimals do not leave noise. The same holds for a value sent with a Breakdown: two at once keep every row (left open by #111, done in #126). _Made precise in #126:_ every Submission Rule is applied in one database call (`record_observation`), under the lock "add" takes on the Metric's period, with the value's rows: two values at once under "reject" keep only the first, under "overwrite" one replaces the other (with its rows, never a mix of both), and under "add" every row of both counts, a label already there (in any case) added to, a new one put after the others.
- **Always run, never opt-in.** The verification is a permanent part of the code, not a one-off check, and runs by itself whenever something that touches values changes:
  - every reference, exhaustive and generated test is part of `pnpm test`: in CI's `check` job on every pull request and push, in `pnpm ci:local`, and in the hook that runs before an agent finishes. The generated tests use a fixed seed and a few hundred runs per combination there, so they stay fast;
  - `pnpm --filter @ziffr/core test:numbers` is the full-strength run: at least 1,000 runs per combination, a random seed printed on failure, and mutation testing as above. It runs in CI's `numbers` job on every pull request whose diff touches the calculation paths, in parallel with `check` and `core-db` rather than after them, every night, and in the release workflow before an image is built;
  - pull requests need not be rebased onto the latest `main` before merging (the required checks are not "strict"). Two separately green changes that clash are caught by the nightly run and, at the latest, by the release check;
  - the calculation paths are listed once, in `.github/calculation-paths.txt`: the calculation modules, intake and submissions, the workspace and canvas data loaders, Snapshots, the exports, and migrations touching values. The job and `pnpm ci:local` read it; the hook runs `pnpm test`, which includes every reference test whatever changed. A new calculation module must be added there and to the Calculation Catalogue, or the catalogue test fails;
  - `check`, `core-db` and `numbers` are required checks on `main`, and nobody merges past them, including administrators and agents.
- **Coverage:** `@vitest/coverage-v8` in the core. CI requires 100 % of lines and branches in the calculation modules (`numbers`, `display-periods`, `formula`, `compare`, `format`, `parse`, `correlation`, `snapshot-periods`, `periods`, `workflow-rules`, and the forecast). Coverage only shows that code ran, so it is the floor; the references and mutation testing show that the results are right. #115 enforces it for `display-periods`, `compare`, `snapshot-periods` and `periods` (the list in `packages/core/vitest.config.ts`); the others join in #126, once the tickets changing them (#109, #110, #112, #118) have landed and their tests reach 100 %.
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
9. #115 Aggregations verified: the reference for combining periods, the exhaustive and generated tests for every Period, Display Period, Aggregation and Fiscal Year start, exact results, Target Series combined, coverage thresholds in CI. Started at once, alongside the others, because it is the first requirement; bugs it finds are fixed in it.
10. #118 Answer languages: the setting, word files generated from `Intl`, French, Spanish, Italian and Dutch, and the contributor guide (needs 3).
11. #126 Everything else verified: the Calculation Catalogue and its check, references for Derived Metrics, Submission Rules, changes, Attainment, Unusual Values, Comparisons, correlation and the forecast, the same-number-everywhere test, mutation testing in CI (needs every other ticket).
12. #130 Attainment by Ratio or by Distance: the Workspace default, the per-Metric choice, Snapshots keeping theirs (needs 4).

## Out of Scope

- A Number Style per person. A person reading a Workspace in another style is rare; when it matters, a person setting can override the Workspace's later.
- Converting between currencies. A unit is a label; Ziffr never changes a value because of it.
- Ziffr's own texts (pages, Prompts, replies) in other languages. They stay English; translating Ziffr is a spec of its own, which the word files will be part of.
- Units that change with the size of a value (seconds to minutes, kg to t).
- Reading answers with an AI model. Fixed rules give the same result for the same text, keep the values on the server, and cover the short answers Prompts get. If it is ever added, it only suggests a reading for a message the rules could not read ("Did you mean 2 for last week?"), and the person confirms it; it never records a value by itself.

## Further Notes

- **Why the style is the Workspace's and the unit the Metric's.** A team reads its numbers one way, whatever they count, so the digits belong to the Workspace. What they count differs per Metric (days, pieces, euros, dollars, kilometres), so the unit and its side belong to the Metric. Money is not special: "€" is a unit like "d".
- **Why ask back instead of guessing.** A wrong number recorded quietly is worse than a question: it reaches dashboards, decks and Workflows before anyone sees it. Every Connector already replies, so asking costs one message.
