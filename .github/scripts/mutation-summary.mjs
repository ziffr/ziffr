#!/usr/bin/env node
// The mutation score per calculation module and how long the run took, from Stryker's JSON report, as a Markdown
// table for the job summary (spec 0022: measure the time and report it). Usage: mutation-summary.mjs <report> <seconds>
import { readFileSync } from "node:fs";

const [file, seconds] = process.argv.slice(2);
const report = JSON.parse(readFileSync(file, "utf8"));
const DETECTED = new Set(["Killed", "Timeout"]);
const COUNTED = new Set(["Killed", "Timeout", "Survived", "NoCoverage"]);
const rows = [];
let [detected, counted] = [0, 0];
for (const [path, f] of Object.entries(report.files)) {
  const d = f.mutants.filter((m) => DETECTED.has(m.status)).length;
  const c = f.mutants.filter((m) => COUNTED.has(m.status)).length;
  const ignored = f.mutants.filter((m) => m.status === "Ignored").length;
  [detected, counted] = [detected + d, counted + c];
  rows.push(`| ${path} | ${c ? ((100 * d) / c).toFixed(2) : "–"} % | ${d} | ${c - d} | ${ignored} |`);
}
const minutes = Math.floor(Number(seconds) / 60);
console.log(`### Mutation testing\n\nScore **${counted ? ((100 * detected) / counted).toFixed(2) : "–"} %** (at least 95 % required), ${detected} of ${counted} mutants detected, in ${minutes} min ${Number(seconds) % 60} s.\n`);
console.log("| Module | Score | Detected | Survived | Left out (static code, or equivalent as the Calculation Catalogue says) |\n|---|---|---|---|---|");
console.log(rows.join("\n"));
