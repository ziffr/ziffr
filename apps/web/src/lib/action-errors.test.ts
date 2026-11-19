// Client code never shows the message of an error a server action threw (ticket 192): a production build replaces it
// with a generic text, so the person would never learn why. Actions return `{ error }` (lib/action-result.ts) and the
// browser shows that, or `shown(err)` for a refusal it turned back into an error (lib/action-error.ts).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
/** Reading a caught error's message: `(err as Error).message`, `err.message`, `e.message`. */
const READS_MESSAGE = /\((?:e|err|error) as Error\)\.message|\b(?:err|e)\.message\b/;

function clientFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return clientFiles(full);
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return readFileSync(full, "utf8").slice(0, 200).includes('"use client"') ? [full] : [];
  });
}

describe("client code and server action errors", () => {
  const files = clientFiles(ROOT).map((f) => ({ rel: path.relative(ROOT, f), text: readFileSync(f, "utf8") }));

  it("never shows the message of an error thrown by a server action", () => {
    const offending = files.filter((f) => READS_MESSAGE.test(f.text)).map((f) => f.rel);
    expect(offending).toEqual([]);
  });
});
