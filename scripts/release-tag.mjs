#!/usr/bin/env node
// `pnpm release:tag` (ADR 0004): after the release pull request from `pnpm release` is merged, tags the merged commit
// vX.Y.Z. It checks that main's latest commit is that release and that every package carries its version, so a tag
// can never point at anything else. It never pushes; pushing the tag makes the GitHub release.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

if (git("branch", "--show-current") !== "main") throw new Error("Tag from main: git switch main && git pull");
if (git("status", "--porcelain")) throw new Error("Commit or set aside your changes first.");
git("fetch", "-q", "origin", "main");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) throw new Error("main is not up to date with origin/main: git pull");

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const subject = git("log", "-1", "--format=%s");
// A squash merge adds the pull request's number: "Release 0.10.0 (#130)".
if (!new RegExp(`^Release ${version.replace(/\./g, "\\.")}( \\(#\\d+\\))?$`).test(subject))
  throw new Error(`main's latest commit is "${subject}", not the release of ${version}. Merge the release pull request first.`);
for (const p of ["apps/web/package.json", "packages/core/package.json"])
  if (JSON.parse(readFileSync(p, "utf8")).version !== version) throw new Error(`${p} is not at ${version}.`);
if (git("tag", "--list", `v${version}`)) throw new Error(`v${version} exists already.`);

git("tag", "-a", `v${version}`, "-m", `Ziffr ${version}`);
console.log(`Tagged v${version}. Push it with: git push origin v${version}`);
