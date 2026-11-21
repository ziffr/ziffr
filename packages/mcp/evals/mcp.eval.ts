// The MCP scenario evals (ticket #614), run by `pnpm --filter @ziffr/mcp eval`: needs the app (ZIFFR_TEST_URL, default
// http://localhost:3000) and its local Supabase running, and ANTHROPIC_API_KEY in the environment (without it the evals
// say so and skip). ZIFFR_EVAL_MODEL changes the model, ZIFFR_EVAL_SCENARIOS (comma-separated ids) picks scenarios.
// Failing scenarios do not fail the run (the report says what failed); ZIFFR_EVAL_STRICT=1 makes them.
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { expect, it } from "vitest";
import { DEFAULT_MODEL, runScenario, type Outcome } from "./harness";
import { reportMarkdown } from "./report";
import { SCENARIOS } from "./scenarios";

const model = process.env.ZIFFR_EVAL_MODEL || DEFAULT_MODEL;
const url = process.env.ZIFFR_TEST_URL ?? "http://localhost:3000";
const wanted = process.env.ZIFFR_EVAL_SCENARIOS?.split(",").map((s) => s.trim());

it.skipIf(!process.env.ANTHROPIC_API_KEY)("the scenarios", async () => {
  const anthropic = new Anthropic();
  const outcomes: Outcome[] = [];
  for (const sc of SCENARIOS.filter((s) => !wanted || wanted.includes(s.id))) outcomes.push(await runScenario(sc, { url, model, anthropic }));
  const report = reportMarkdown(outcomes, model);
  writeFileSync(process.env.ZIFFR_EVAL_REPORT ?? "evals/report.md", report);
  console.log(report);
  if (process.env.ZIFFR_EVAL_STRICT) expect(outcomes.flatMap((o) => o.checks).filter((c) => !c.ok)).toEqual([]);
}, 20 * 60_000);

if (!process.env.ANTHROPIC_API_KEY) console.log("MCP evals skipped: ANTHROPIC_API_KEY is not set.");
