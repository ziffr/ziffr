// That the React inside Next.js carries the fix for the lost wake-up (#1335; facebook/react#36134, in React 19.3):
// without it a tap on a link that changes only a page's address after the "?", such as a card of the Metric Catalog
// (GLOSSARY: Metric Catalog), often fetches the page and never shows it. The fix reaches Next.js 15.5 through
// patches/next@15.5.29.patch. This fails when another Next.js version brings a React without it; when it passes
// without the patch, the patch can go.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const next = path.dirname(createRequire(import.meta.url).resolve("next/package.json"));

/** The function React runs when something it waited for has arrived, as the given build has it. */
function ping(channel: string, build: string): string {
  const source = readFileSync(path.join(next, "dist/compiled", channel, "cjs", `react-dom-${build}.js`), "utf8");
  const start = source.indexOf("function pingSuspendedRoot(");
  return start < 0 ? "" : source.slice(start, source.indexOf("function retryTimedOutBoundary(", start));
}

describe.each(["react-dom", "react-dom-experimental"])("%s as Next.js carries it", (channel) => {
  it.each(["client.production", "client.development", "profiling.profiling", "profiling.development"])("keeps a wake-up that arrives during a render (%s)", (build) => {
    // Arriving during a render, the page cannot start over at once, so the wake-up must be noted for afterwards.
    expect(ping(channel, build)).toMatch(/\?\s*prepareFreshStack\(root, 0\)\s*:\s*\(workInProgressRootPingedLanes \|= pingedLanes\)/);
  });
});
