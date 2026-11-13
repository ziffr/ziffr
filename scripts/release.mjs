#!/usr/bin/env node
// `pnpm release` (ADR 0004): turns the waiting release notes in .changeset/ into a new CHANGELOG.md section, sets the
// product version in every package, commits and tags vX.Y.Z. It never pushes; pushing the tag makes the GitHub
// release (.github/workflows/release.yml).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { insertSection, nextVersion, parseChangeset, renderSection } from "./release-lib.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const PACKAGES = ["package.json", "apps/web/package.json", "packages/core/package.json"];

if (git("status", "--porcelain")) throw new Error("Commit or set aside your changes first: a release starts from a clean tree.");

const files = readdirSync(".changeset").filter((f) => f.endsWith(".md") && f !== "README.md");
const notes = files.map((f) => {
  const n = parseChangeset(readFileSync(join(".changeset", f), "utf8"));
  if (!n) throw new Error(`.changeset/${f} is not a release note (see .changeset/README.md).`);
  return n;
});
if (!notes.length) throw new Error("No release notes are waiting in .changeset/: nothing to release.");

const current = JSON.parse(readFileSync("package.json", "utf8")).version;
const version = nextVersion(current, notes);
const day = new Date().toISOString().slice(0, 10);

writeFileSync("CHANGELOG.md", insertSection(readFileSync("CHANGELOG.md", "utf8"), renderSection(version, day, notes)));
for (const p of PACKAGES) {
  const pkg = readFileSync(p, "utf8");
  writeFileSync(p, pkg.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
}
for (const f of files) rmSync(join(".changeset", f));

git("add", "-A", "CHANGELOG.md", ".changeset", ...PACKAGES);
git("commit", "-q", "-m", `Release ${version}`);
git("tag", "-a", `v${version}`, "-m", `Ziffr ${version}`);
console.log(`Released ${version} with ${notes.length} notes. Push it with: git push --follow-tags`);
