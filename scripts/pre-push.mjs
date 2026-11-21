// The optional pre-push hook (#578, lefthook.yml): the fast checks of `pnpm ci:local`, limited to what this branch
// changed against origin/main. `pre-push.mjs typecheck` runs the type check of each changed package, `pre-push.mjs lint`
// runs ESLint on the changed files of each package. `pnpm ci:local` stays the full version.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LINTED = /\.(?:[cm]?[jt]sx?)$/;

/** The workspace package (`apps/x` or `packages/x`) a file belongs to, or null for a file outside every package. */
export function packageOf(file) {
  return /^((?:apps|packages)\/[^/]+)\//.exec(file)?.[1] ?? null;
}

/** The changed files grouped by package: `{ "packages/core": ["src/a.ts"], … }`, paths relative to the package. */
export function groupByPackage(files) {
  const groups = {};
  for (const file of files) {
    const dir = packageOf(file);
    if (dir) (groups[dir] ??= []).push(file.slice(dir.length + 1));
  }
  return groups;
}

/** The changed files this branch has against origin/main (deleted files left out). */
function changedFiles() {
  const out = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", "origin/main...HEAD"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

function run(args, cwd = ".") {
  const r = spawnSync("pnpm", args, { stdio: "inherit", cwd });
  return r.status === 0;
}

function main(mode) {
  const groups = groupByPackage(changedFiles());
  let ok = true;
  for (const [dir, files] of Object.entries(groups)) {
    if (mode === "typecheck") {
      console.log(`typecheck ${dir}`);
      ok = run(["--filter", `./${dir}`, "--if-present", "typecheck"]) && ok;
    } else {
      const lintable = files.filter((f) => LINTED.test(f) && existsSync(`${dir}/${f}`));
      if (!lintable.length) continue;
      console.log(`lint ${dir}: ${lintable.length} file(s)`);
      ok = run(["exec", "eslint", ...lintable], dir) && ok;
    }
  }
  if (Object.keys(groups).length === 0) console.log("No package changed: nothing to check.");
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  if (mode !== "typecheck" && mode !== "lint") {
    console.error("usage: node scripts/pre-push.mjs typecheck|lint");
    process.exit(2);
  }
  main(mode);
}
