#!/usr/bin/env node
// Client components may import only the core's pure modules (docs/security/threat-model.md): anything that reaches
// the database with the service role must never be bundled for a browser. Type-only imports ship no code and pass.
// Run from the repository root; exits 1 and names each offending import.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PURE = new Set([
  "appearance", "branded-email", "theme-look", "theme-dark",
  "actor", "attainment-method", "built-in-designs", "compare", "design-export", "correlation", "display-periods", "exact", "export-values", "forecast", "format", "formula", "metric-row", "metric-names", "number-style", "numbers", "parse", "paste-reader", "people", "periods", "placeholders", "sample-data", "series-lines", "snapshot-periods", "team-templates", "theme-tokens", "standard-themes", "view-design", "json-check", "design-files", "widget-designs", "analysis-recipe", "recipe-run", "recipe-functions", "built-in-recipes", "design-analysis", "mark-figures", "basis", "suitability", "takeaways/takeaway", "takeaways/strength", "takeaways/wording", "takeaways/forecast", "methods/holt-winters", "methods/track-record", "methods/forecast-choice", "methods/reach-chance", "methods/normal-curve", "methods/before-after", "methods/change-point", "methods/look-alike", "methods/t-curve", "takeaways/sizes", "work-bound",
  "themes", "tokens", "types", "pack", "pack-ranking", "pack-voucher", "metric-file", "theme-file", "dashboard-template-file", "deck-template-file", "workflow-template-file", "file-text", "assistant-words", "assistant-backfill-prompt", "visibility", "role-words", "widget-metrics", "widget-templates", "workflow-rules", "workspace-profile", "n8n-workflow", "units",
  "approval-question", "demo-words", "sealed-labels", "retention-rules", "retention-words", "alert-rules", "alert-limits", "asking-schedule", "schedule-calendar", "quiet-rules", "prompt-route",
  "connectors/index", "connectors/types", "connectors/email", "connectors/slack", "connectors/tickets", "connectors/whatsapp",
  "feedback-rules", "demo-reset-line", "announcement-rules",
  "canvas-roles", "chart-stretch", "method-picker-names", "polar-marks", "progress-bars", "stacked-marks", "pareto", "slope-chart", "running-total", "bump-marks", "heatmap-grid", "formula-tree", "breakdown-tree",
]);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name)) files.push(p);
  }
})("apps/web/src");

// A module a client component imports is bundled for the browser too, with or without its own "use client": so the
// check follows relative imports from every client file (a file imported only by server code stays out of it).
const bad = [];
const clients = new Set(files.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8"))));
const queue = [...clients];
while (queue.length) {
  const file = queue.pop();
  for (const m of readFileSync(file, "utf8").matchAll(/^import\s+(?:type\s+)?[^;]*?from\s+["'](\.{1,2}\/[^"']+)["']/gm)) {
    if (/^import\s+type\s/.test(m[0])) continue;
    const base = join(file, "..", m[1]);
    const next = [base + ".tsx", base + ".ts", join(base, "index.tsx"), join(base, "index.ts")].find((c) => files.includes(c));
    // A "use server" file stays on the server: a client component only gets a reference to its actions.
    if (next && !clients.has(next) && !/^\s*["']use server["']/.test(readFileSync(next, "utf8"))) { clients.add(next); queue.push(next); }
  }
}
for (const file of clients) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+["']@ziffr\/core\/([^"']+)["']/gm)) {
    if (m[1]) continue; // import type: no code
    if (!PURE.has(m[2])) bad.push(`${file}: imports @ziffr/core/${m[2]}`);
  }
}
if (bad.length) {
  console.error("Client components import core modules that reach the database:\n" + bad.join("\n"));
  process.exit(1);
}
console.log(`Client imports fine (${files.length} files checked).`);
