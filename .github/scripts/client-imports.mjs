#!/usr/bin/env node
// Client components may import only the core's pure modules (docs/security/threat-model.md): anything that reaches
// the database with the service role must never be bundled for a browser. Type-only imports ship no code and pass.
// Run from the repository root; exits 1 and names each offending import.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PURE = new Set([
  "actor", "compare", "format", "formula", "metric-row", "parse", "people", "placeholders", "sample-data", "series-lines", "team-templates", "theme-tokens",
  "themes", "tokens", "types", "visibility", "widget-metrics", "widget-templates", "workflow-rules", "workspace-profile",
  "connectors/index", "connectors/types", "connectors/email", "connectors/slack", "connectors/tickets", "connectors/whatsapp",
]);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name)) files.push(p);
  }
})("apps/web/src");

const bad = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (!/^\s*["']use client["']/.test(text)) continue;
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
