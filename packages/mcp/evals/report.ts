// The eval report as Markdown (ticket #614): one table row per scenario, then what failed and why, for a pull request
// body or a job summary. Pure, so it is easy to read and to change.
import type { Outcome } from "./harness";

const mark = (ok: boolean) => (ok ? "pass" : "FAIL");

/** The report for `outcomes` run on `model`. */
export function reportMarkdown(outcomes: Outcome[], model: string): string {
  const passed = outcomes.filter((o) => o.checks.every((c) => c.ok)).length;
  const out = [`## MCP scenario evals (${model})`, "", `${passed} of ${outcomes.length} scenarios pass.`, "", "| Scenario | Result | Checks | Questions asked | Tool calls | Tool errors | Tokens |", "|---|---|---|---|---|---|---|"];
  for (const o of outcomes) {
    const ok = o.checks.filter((c) => c.ok).length;
    out.push(`| ${o.id} | ${mark(ok === o.checks.length)} | ${ok}/${o.checks.length} | ${o.questions} | ${o.toolCalls} | ${o.toolErrors.length} | ${o.tokens} |`);
  }
  for (const o of outcomes.filter((x) => x.checks.some((c) => !c.ok))) {
    out.push("", `### ${o.id}`, "", ...o.checks.filter((c) => !c.ok).map((c) => `- ${c.name}${c.detail ? `: ${c.detail.replace(/\s+/g, " ").slice(0, 300)}` : ""}`));
    if (o.note) out.push(`- note: ${o.note}`);
    if (o.lastWords) out.push("", `> ${o.lastWords.replace(/\s+/g, " ").slice(0, 400)}`);
  }
  return `${out.join("\n")}\n`;
}
