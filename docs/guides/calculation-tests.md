# How Ziffr's calculations are tested

Ziffr is only useful if its numbers are right. So every calculation on values is held to an independent reference, not to a few examples (spec 0022, "Verification is the first requirement"). The [Calculation Catalogue](../reference/calculations.md) lists each calculation with its rule, its code, its reference and its tests. This guide says how the parts fit together, what to do when a test fails or a mutant survives, and how to add a case or a calculation.

## The parts

- **The references** in `packages/core/src/test/reference/` work a result out a second way, as plainly as possible. They share nothing with the code they check except types:
  - `calendar.ts` counts days from 1 January 1970. It finds a week, month, quarter, half-year or year by walking back day by day to the day that starts it, for each of the twelve months a Fiscal Year can start in. No `date-fns`, no `periods.ts`;
  - `exact.ts` reads a value from its text ("0.1", "1e-7") as a fraction of two BigInts and adds, subtracts and divides without loss. It rounds half away from zero, checks that a double is the one nearest to an exact value, and finds that double;
  - `combine.ts` applies the rules for combining as the spec and the glossary write them: a series by a Display Period, one span's value for a Comparison, a Target Series combined, and what a Snapshot keeps;
  - `change.ts`: a Comparison's change and its percentage, target status, health and the Unusual Value check;
  - `attainment.ts`: Attainment by ratio and by distance;
  - `formula.ts`: a formula read by the shunting-yard method and worked out on exact fractions;
  - `derived.ts`: a Derived Metric per period and over a longer span;
  - `write.ts`: a value written digit by digit in a Number Style, with its unit, a percentage change and a short value, with the minus sign "−" for people and the ASCII "-" without group marks, for files;
  - `analyses.ts`: Pearson's r and Holt's forecast, from their textbook definitions;
  - `reference.test.ts`, `attainment.test.ts` and the "the reference gives what was worked out by hand" tests check the references themselves.
- **Hand-made cases** (`cases.ts`): an empty series, one value, exactly half and one short of half of a span, week 53, weeks across a month, quarter and year, 29 February, the current span to date, a Comparison point mid-span, a period given twice, unsorted input, negative values and zeros. The `aggregations*.test.ts` files run every case for every source Period, Display Period, Aggregation and Fiscal Year start.
- **Generated cases** (fast-check). Series with random gaps, negative values, zeros, up to six decimals, values up to 10^15 and down to 0.000001, values chosen to break floating point, periods given twice and any order (`generated.ts`, `check.ts`). Formula trees over 1 to 4 inputs, and the same formulas broken on purpose (`derived.test.ts`). Pairs of values for changes, Attainment and the Unusual Value check (`changes.test.ts`). Values, units, sides, decimals and Number Styles for writing, and reading back what was written (`writing.test.ts`, `numbers.test.ts`). Series for the forecast and correlation, and values for the exports (`analyses.test.ts`).
- **Equal** means:
  - the same spans, with the same first day, cut, number of periods held and counted, and "to date";
  - a value that is the double nearest to the exact result;
  - at the Metric's decimals, the same text as the exact result rounded, wherever a double can carry it (`valueMismatch` in `check.ts`).

  Where a result has a square root (r, the forecast's band), it is exact up to that root: the root is taken of the double nearest to the exact square.
- **The same number everywhere** (`same-number.db.test.ts` in the core and in the web app): one Workspace in the database, read through a widget, a Snapshot, View Links, a Comparison, the deck and CSV exports, the API and the MCP Server, each against the reference.
- **Coverage**: `pnpm test` in the core runs with `@vitest/coverage-v8`. It fails unless every line and branch of the calculation modules listed in `packages/core/calculation-modules.json` ran. Coverage is the floor; the references show that the results are right.
- **Mutation testing** (Stryker, `packages/core/stryker.config.mjs`): it changes the calculation modules on purpose (a `<` into `<=`, a `+` into `-`) and runs the tests that cover each change. A change no test notices is a gap. The score must be at least 95 %.
- **The catalogue's test** (`catalogue.test.ts`) fails when an exported function of a calculation module has no row in the catalogue, or a mutant left out of mutation testing has no reason written there.

## When they run

- `pnpm test`, everything above except mutation testing, with a fixed seed (115) and 200 generated cases per combination. It runs in CI's `check` job on every pull request and push, in `pnpm ci:local`, and in the hook before an agent finishes; about a minute on a laptop.
- `pnpm --filter @ziffr/core test:numbers`, the full-strength run: 1,000 cases per combination with a new seed each run, a few minutes on a laptop.
- `pnpm --filter @ziffr/core test:mutation`, mutation testing of every calculation module. It mutates about 3,000 times, and takes about 45 minutes on an 8-core laptop and a few hours on a CI runner.

Where each run happens:

| Where | Full strength | Mutation testing |
|---|---|---|
| CI's `numbers` job, on a pull request or push that touches a **calculation path**, beside `check` and `core-db` | yes | not yet: it starts from the nightly run's results, which the next pull request of #126 adds |
| Every night (`.github/workflows/numbers.yml`) | yes | every module |
| The release workflow, before the image is built: a failure blocks the release | yes | every module |
| `pnpm ci:local` | when a calculation path changed against `origin/main` | the touched modules, from an earlier local run's results when there are any (`--incremental`), except with `--quick` |

Each mutation run writes its score per module and its time to the job's summary (`.github/scripts/mutation-summary.mjs`). `NUMBERS_RUNS` and `NUMBERS_SEED` set the count and the seed for any of these runs: `NUMBERS_RUNS=5000 pnpm --filter @ziffr/core test:numbers`. Mutation testing runs with 30 generated cases per combination, because the hand-made cases and the references kill most mutants, and every mutant runs the tests again.

## The calculation paths

`.github/calculation-paths.txt` lists them once, one regular expression per line: the calculation modules, where values are stored and read (submissions, the workspace and page data), Snapshots, the exports, the views that draw values, the references and these tests. A migration counts when it names `observations`, `series_values` or `breakdowns`. `.github/scripts/calculation-paths-touched.sh <base>` says whether a change touches one; CI's `numbers` job and `pnpm ci:local` both ask it.

## When a test fails

A failure names the combination ("week by quarter, average, year from month 4, today 2026-05-13") and the difference ("span 2026-04-01: 0.30000000000000004 is not the double nearest to 0.3"). It also names fast-check's seed and the shrunk counterexample. Run it again with that seed:

```sh
NUMBERS_SEED=1234 NUMBERS_RUNS=1000 pnpm --filter @ziffr/core exec vitest run src/aggregations-generated-week.test.ts
```

Then decide which side is wrong. If the code is, fix the code. If the reference is, check its rule against the spec and the glossary first: a reference changed to match the code proves nothing. If the rule itself was unclear, write the rule you chose into the spec in the same pull request. Never make a test weaker to make it pass.

## When a mutant survives

The report (`packages/core/reports/mutation/mutation.json`, and the "Survived" lines of the run) shows the change and the tests that ran it. Run one module:

```sh
pnpm --filter @ziffr/core exec stryker run --mutate src/compare.ts
```

- Usually a test is missing: add the case that tells the two apart, by hand or in a generated test, and check it against the reference.
- Sometimes the code has a branch that changes nothing: simplify the code.
- Only when the change cannot alter any result, leave it out. An example is `n < 0 ? -n : n` for a BigInt, where `<=` gives the same for 0. Put `// Stryker disable next-line <Mutator>: <why it cannot matter>` above the line, and a line under "Mutants that cannot matter" in the catalogue. The catalogue's test checks both.

## Adding a case

- An edge case for every combination: add it to `cases()` in `cases.ts`, with a name that says what it is about. Build its periods with the reference calendar (`starts`, `periodsOfSpan`), never with `periods.ts`. Where the case pins a rule (half the periods, week 53), also write the outcome down in `aggregations.test.ts`, so the reference is held to it too.
- A new kind of generated value: add it to `valueText` in `check.ts`; a new shape of series, to `series()`.
- A new rule: change the reference and add a hand-worked test for it first, then make the code follow.

## Adding a calculation

1. Write it in a pure module of the core, and add the module to `packages/core/calculation-modules.json` and its paths to `.github/calculation-paths.txt`.
2. Write its rule into the catalogue, with a row for every function the module exports.
3. Write a reference in `test/reference/`, with a few results worked out by hand, and a test that holds the code to it on hand-made and generated cases.
4. Run `pnpm test` (coverage must be 100 %) and `pnpm --filter @ziffr/core exec stryker run --mutate <the module>` (at least 95 %).
