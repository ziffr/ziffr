// The load script (scripts/demo-load.mjs) matches the demo's refusals by their exact sentences, which it cannot import
// from TypeScript: this keeps its copies the same as demo-words.ts, so a changed sentence fails here instead of making
// the script miss every refusal.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_BUDGET_USED, DEMO_BUSY, DEMO_GOING_FAST, DEMO_READ_ONLY, demoLimitWords } from "./demo-words";
import { DEMO_WRITE_BUDGET } from "./demo-limits";
import { repoFile } from "./test/repo-file";

const script = readFileSync(repoFile("scripts/demo-load.mjs"), "utf8");

describe("scripts/demo-load.mjs", () => {
  it("holds the demo's exact refusal sentences", () => {
    for (const words of [DEMO_READ_ONLY, DEMO_GOING_FAST, DEMO_BUDGET_USED, DEMO_BUSY]) expect(script).toContain(`"${words}"`);
    // The row caps' sentence, as its pattern.
    expect(demoLimitWords("dashboards")).toMatch(/^The demo is full of dashboards for now\. Try again when it starts fresh\.$/);
    expect(script).toContain(String.raw`The demo is full (?:of [^.]+ )?for now\. Try again when it starts fresh\.`);
  });

  it("uses the address budget of the limits, and sends the job secret only with the explicit flag", () => {
    expect(script).toContain(`const ADDRESS_BUDGET = ${DEMO_WRITE_BUDGET.perAddressPerWindow};`);
    expect(script).toContain("--yes-this-is-the-demo");
    expect(script).toContain('redirect: "manual"');
    expect(script).toContain('url.protocol === "https:"');
  });
});
