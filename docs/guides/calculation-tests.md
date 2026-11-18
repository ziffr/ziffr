# How Ziffr's calculations are tested

Ziffr is only useful if its numbers are right, so every calculation on values is held to an independent reference, not to a few examples (spec 0022, "Verification is the first requirement"). This guide says how that works for combining periods, the part built first (#115), and how to add a case. The Calculation Catalogue and the references for Derived Metrics, Comparisons' changes and the rest follow in #126 and use the same pieces.

## The parts

- **The reference** in `packages/core/src/test/reference/` works a result out a second way, as plainly as possible, and shares nothing with the code it checks except types:
  - `calendar.ts` counts days from 1 January 1970 and finds a week, month, quarter, half-year or year by walking back day by day to the day that starts it, for each of the twelve months a Fiscal Year can start in. No `date-fns`, no `periods.ts`;
  - `exact.ts` reads a value from its text ("0.1", "1e-7") as a fraction of two BigInts, adds and divides without loss, rounds half away from zero, and checks that a double is the one nearest to an exact value;
  - `combine.ts` applies the rules for combining as the spec and the glossary write them: a series by a Display Period, one span's value for a Comparison, a Target Series combined, what a Snapshot keeps;
  - `reference.test.ts` checks the reference itself against sums worked out by hand.
- **Hand-made cases** (`cases.ts`): an empty series, one value, exactly half and one short of half of a span, a span starting before the first value, week 53, weeks across a month, quarter and year, 29 February, the current span to date, a Comparison point mid-span, a period given twice, unsorted input, negative values and zeros. `aggregations.test.ts`, `aggregations-targets.test.ts`, `aggregations-snapshots.test.ts` and `aggregations-compare.test.ts` run every case for every source Period, Display Period, Aggregation and Fiscal Year start.
- **Generated series** (`generated.ts`, run by `aggregations-generated-<period>.test.ts`): fast-check makes series with random gaps, negative values, zeros, up to six decimals, values up to 10^15 and down to 0.000001, values chosen to break floating point, periods given twice and any order, a random day to read them on and sometimes a Comparison cut. Each series is combined by every Display Period, Aggregation and Fiscal Year start, by the code and by the reference, and both must agree. On top, the invariants hold: an average lies between its lowest and highest value, the last value is the latest period's, every period counts in one span, reordering the input changes nothing, Aggregation none never combines, and complete spans add up (a year is the sum of its half-years, quarters and months).
- **Equal** means: the same spans, with the same first day, cut, number of periods held and counted, and "to date"; a value that is the double nearest to the exact result; and, at the Metric's decimals, the same text as the exact result rounded wherever a double can carry it (`valueMismatch` in `check.ts`).
- **Coverage**: `pnpm test` in the core runs with `@vitest/coverage-v8` and fails unless every line and branch of the calculation modules listed in `packages/core/calculation-modules.json` ran. Coverage is the floor; the reference shows that the results are right.

## When they run

- `pnpm test` (CI's `check` job on every pull request and push, `pnpm ci:local`, and the hook before an agent finishes) runs everything above with a fixed seed (115) and 200 generated series per combination, about half a minute on a laptop.
- `pnpm --filter @ziffr/core test:numbers` is the full-strength run: 1,000 series per combination with a new seed each run, about a minute on a laptop. It runs:
  - in CI's `numbers` job, beside `check` and `core-db`, on every pull request and push whose diff touches a **calculation path**. When nothing relevant changed, its steps are skipped and the job still succeeds;
  - every night (`.github/workflows/numbers.yml`), whatever changed;
  - in the release workflow, before the image is built and published;
  - in `pnpm ci:local`, when a calculation path changed against `origin/main`.
- `NUMBERS_RUNS` and `NUMBERS_SEED` set the count and the seed for any of these runs: `NUMBERS_RUNS=5000 pnpm --filter @ziffr/core test:numbers`.

## The calculation paths

`.github/calculation-paths.txt` lists them once, one regular expression per line: the calculation modules, where values are stored and read (submissions, the workspace and page data), Snapshots, the deck export, the views that draw values, the references and these tests. A migration counts when it names `observations`, `series_values` or `breakdowns`. `.github/scripts/calculation-paths-touched.sh <base>` says whether a change touches one; CI's `numbers` job and `pnpm ci:local` both ask it. A new module that calculates with values goes into this file, into `packages/core/calculation-modules.json`, and into the [Calculation Catalogue](../reference/calculations.md) with a row for every function it exports: `catalogue.test.ts` fails otherwise.

## When a test fails

A failure names the combination ("week by quarter, average, year from month 4, today 2026-05-13"), the difference ("span 2026-04-01: 0.30000000000000004 is not the double nearest to 0.3") and fast-check's seed and shrunk counterexample. Run it again with that seed:

```sh
NUMBERS_SEED=1234 NUMBERS_RUNS=1000 pnpm --filter @ziffr/core exec vitest run src/aggregations-generated-week.test.ts
```

Then decide which side is wrong. If the code is, fix the code. If the reference is, check its rule against the spec and the glossary first: a reference changed to match the code proves nothing. If the rule itself was unclear, write the rule you chose into the spec in the same pull request. Never make a test weaker to make it pass.

## Adding a case

- An edge case for every combination: add it to `cases()` in `packages/core/src/test/reference/cases.ts`, with a name that says what it is about. Build its periods with the reference calendar (`starts`, `periodsOfSpan`), never with `periods.ts`. Where the case pins a rule (half the periods, week 53), also write the outcome down in `aggregations.test.ts`, so the reference is held to it too.
- A new kind of generated value: add it to `valueText` in `check.ts`; a new shape of series, to `series()`.
- A new rule: change `combine.ts` and add a hand-worked test to `reference.test.ts` first, then make the code follow.
