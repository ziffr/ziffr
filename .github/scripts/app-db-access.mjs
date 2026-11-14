#!/usr/bin/env node
// The web app reads and writes data only through the core (AGENTS.md rule 2, ticket #42). Only finding the signed-in
// person and the demo's "view as" and reset may use the database directly. Run from the repository root; exits 1
// and names each other file that does. It looks for any way in: the app's and the core's database modules, the
// Supabase clients, and query calls on anything named db, however they are written.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "apps/web/src";
// middleware.ts refreshes the sign-in session with the Supabase client; it reads no data.
const ALLOWED = new Set(["lib/db.ts", "lib/auth.ts", "lib/viewer.ts", "app/actions.ts", "middleware.ts"]);
const RULES = [
  [/["'](?:[^"']*\/)?lib\/db(?:\.[jt]s)?["']/, "imports the app's database module"],
  [/["']@ziffr\/core\/(?:src\/)?db(?:\.[jt]s)?["']/, "imports the core's database module"],
  [/["']@supabase\/(?:supabase-js|ssr)["']/, "imports a Supabase client"],
  [/\bdb\s*(?:\(\s*\))?\s*\.\s*(?:from|rpc|schema|storage)\s*\(/, "queries the database"],
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.[cm]?[jt]sx?$/.test(name)) files.push(p);
  }
})(ROOT);

const bad = [];
for (const f of files) {
  const rel = relative(ROOT, f);
  if (ALLOWED.has(rel)) continue;
  const text = readFileSync(f, "utf8");
  for (const [re, why] of RULES) if (re.test(text)) bad.push(`${rel}: ${why}`);
}
if (bad.length) {
  console.error("These files use the database directly; call a core function instead:\n" + bad.join("\n"));
  process.exit(1);
}
console.log(`Database access only through the core (${files.length} files checked).`);
