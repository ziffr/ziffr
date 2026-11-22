// Every code example in the docs says whether CI runs it or why not (ticket #571, part 3); the running is in
// docs-examples.app.test.ts. Needs nothing running, so it is part of `pnpm test`.
import { describe, expect, it } from "vitest";
import { allBlocks, blocksOf } from "./docs-blocks";

const FENCE = "```";

describe("the examples in the docs", () => {
  it("every sh, ts, js and python block is marked run, skip with a reason, or run by its own test", () => {
    const bad = allBlocks().filter((b) => b.mode === "unmarked").map((b) => `${b.file}:${b.line} (${b.lang})`);
    expect(bad, `Mark these blocks: ${FENCE}sh run, or ${FENCE}sh skip="why it cannot run"`).toEqual([]);
  });
  it("a skip names its reason in some words", () => {
    for (const b of allBlocks().filter((b) => b.mode === "skip")) expect(b.reason.split(" ").length, `${b.file}:${b.line}`).toBeGreaterThanOrEqual(3);
  });
  it("finds the blocks of a file, indented ones too", () => {
    expect(blocksOf("docs/guides/api.md").filter((b) => b.mode === "run").length).toBeGreaterThan(0);
    expect(blocksOf("docs/guides/self-hosting.md").some((b) => b.code.startsWith("supabase link"))).toBe(true);
    expect(blocksOf("docs/guides/webhooks.md").filter((b) => b.mode === "named")).toHaveLength(2);
  });
});
