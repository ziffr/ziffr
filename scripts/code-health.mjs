#!/usr/bin/env node
// Code health (#177, CONTRIBUTING "Code health"): the duplication ratchet, and the list behind the complexity ceiling.
// `pnpm health` runs knip and then this; CI's `check` job and `pnpm ci:local` run `pnpm health`.
//
//   node scripts/code-health.mjs           code duplication per format (jscpd, .jscpd.json), against its ceiling
//   node scripts/code-health.mjs --worst   the most complex and the longest functions, for eslint.code-health.mjs
//
// A ceiling is today's level, rounded up to two decimals. Lower it when duplication falls; never raise it: merge the
// new copy instead, or, when two pieces only look alike, say why in the pull request and leave them.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** The most duplicated lines a format may have, in percent of its lines. Set on 2026-11-19: 0.424 % and 0.665 %. */
const DUPLICATION_CEILING = { typescript: 0.43, tsx: 0.67 };

const ROOT = path.join(import.meta.dirname, "..");

function duplication() {
  const out = mkdtempSync(path.join(tmpdir(), "ziffr-jscpd-"));
  try {
    const run = spawnSync("pnpm", ["exec", "jscpd", "--config", ".jscpd.json", "--silent", "--reporters", "json", "--output", out], { cwd: ROOT, encoding: "utf8" });
    const file = path.join(out, "jscpd-report.json");
    if (!existsSync(file)) {
      process.stderr.write(run.stderr || run.stdout || "jscpd wrote no report.\n");
      return 1;
    }
    const report = JSON.parse(readFileSync(file, "utf8"));
    let failed = false;
    for (const [format, ceiling] of Object.entries(DUPLICATION_CEILING)) {
      const s = report.statistics.formats[format];
      if (!s) { console.log(`${format}: no files found`); failed = true; continue; }
      const over = s.percentage > ceiling;
      failed ||= over;
      console.log(`${format}: ${s.percentage.toFixed(3)} % duplicated lines (${s.duplicatedLines} of ${s.lines}, ${s.clones} clones), ceiling ${ceiling} %${over ? ": ABOVE" : ""}`);
    }
    if (failed) {
      console.log("\nThe clones, largest first (merge the new one):");
      for (const d of report.duplicates.sort((a, b) => b.tokens - a.tokens)) {
        console.log(`  ${d.lines} lines  ${d.firstFile.name}:${d.firstFile.start}-${d.firstFile.end}  ${d.secondFile.name}:${d.secondFile.start}-${d.secondFile.end}`);
      }
    }
    return failed ? 1 : 0;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function worst() {
  const lint = JSON.stringify({ complexity: ["warn", 1], "max-lines-per-function": ["warn", { max: 1, skipBlankLines: true, skipComments: true }] });
  const found = { complexity: [], "max-lines-per-function": [] };
  for (const dir of ["apps", "packages"].flatMap((d) => readdirSync(path.join(ROOT, d)).map((p) => `${d}/${p}`))) {
    if (!existsSync(path.join(ROOT, dir, "eslint.config.mjs"))) continue;
    const run = spawnSync("pnpm", ["exec", "eslint", "--format", "json", "--rule", lint, "."], { cwd: path.join(ROOT, dir), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    for (const file of JSON.parse(run.stdout || "[]")) {
      for (const m of file.messages) {
        if (!(m.ruleId in found)) continue;
        const n = Number((/complexity of (\d+)/.exec(m.message) ?? /too many lines \((\d+)\)/.exec(m.message) ?? [])[1]);
        found[m.ruleId].push({ n, at: `${path.relative(ROOT, file.filePath)}:${m.line}` });
      }
    }
  }
  for (const [rule, list] of Object.entries(found)) {
    console.log(`${rule}, worst first:`);
    for (const f of list.sort((a, b) => b.n - a.n).slice(0, 10)) console.log(`  ${String(f.n).padStart(4)}  ${f.at}`);
  }
  return 0;
}

process.exit(process.argv.includes("--worst") ? worst() : duplication());
