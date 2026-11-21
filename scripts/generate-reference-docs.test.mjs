// The lists in the docs that come from the code (MCP tools, Installation Settings, scopes, refusal codes) match it.
// Fix a difference with `UPDATE_REFERENCE=1 node scripts/generate-reference-docs.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { check, replaceBlock } from "./generate-reference-docs.mjs";

test("a block's body is replaced and the rest kept", () => {
  assert.equal(replaceBlock("a\n<!-- generated:x -->\nold\n<!-- /generated:x -->\nb", "x", "new"), "a\n<!-- generated:x -->\nnew\n<!-- /generated:x -->\nb");
  assert.equal(replaceBlock("# generated:x\nold\n# /generated:x", "x", "# n", true), "# generated:x\n# n\n# /generated:x");
  assert.equal(replaceBlock("nothing", "x", "new"), null);
});

test("the generated lists in the docs match the code", async () => {
  const diffs = await check(false);
  assert.deepEqual(diffs, [], `These generated blocks in the docs differ from the code (or have no marker):\n${diffs.map((d) => `  ${d.file}: generated:${d.id}${d.missing ? " (markers missing)" : ""}`).join("\n")}\nRun: UPDATE_REFERENCE=1 node scripts/generate-reference-docs.mjs`);
});
