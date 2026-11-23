// @ts-nocheck
// The core's plain errors carry Ziffr's own words (ticket 192): server actions show their message to people
// (apps/web/src/lib/action-result.ts), so none may carry the database's text, which names tables, columns and
// constraints. The database's words go to the server log instead.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** A plain Error built from another error's text: `new Error(error.message)`, `new Error(\`… ${e?.details}\`)`. */
const FROM_ERROR_TEXT = /new Error\([^;]*\$?\{?\s*(?:error|err|e|res|r)\??\.(?:message|details|hint)\b/;

describe("the core's plain errors", () => {
  it("never carry another error's text", () => {
    const dir = path.resolve(__dirname);
    const offending = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .flatMap((f) => readFileSync(path.join(dir, f), "utf8").split("\n").map((line, i) => ({ f, i: i + 1, line })))
      // A test of the other error's text to choose one of Ziffr's own sentences is fine, e.g. /at least one Owner/.test(error.message).
      .filter(({ line }) => FROM_ERROR_TEXT.test(line) && !/\.test\((?:error|err|e)\.message\)/.test(line))
      .map(({ f, i }) => `${f}:${i}`);
    expect(offending).toEqual([]);
  });
});
