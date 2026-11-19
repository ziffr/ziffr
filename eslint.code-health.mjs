// The complexity ceiling (#177, CONTRIBUTING "Code health"): no function more complex, and none longer, than the
// worst one when the ceiling was set. Every package's ESLint config adds these rules, so `pnpm lint` fails on a
// function above them. Lower a number whenever the worst function gets better; never raise it.
//
// Worst on 2026-11-19: complexity 98 and 340 lines, both apps/web/src/app/metrics/[slug]/page.tsx (MetricPage).
// `node scripts/code-health.mjs` prints the worst ones now.

/** The highest cyclomatic complexity a function may have. */
const COMPLEXITY_CEILING = 98;
/** The most lines a function may have, blank lines and comments not counted. */
const FUNCTION_LINES_CEILING = 340;

/** The rules, for every file a package's config lints. */
export const codeHealth = {
  rules: {
    complexity: ["error", COMPLEXITY_CEILING],
    "max-lines-per-function": ["error", { max: FUNCTION_LINES_CEILING, skipBlankLines: true, skipComments: true }],
  },
};
