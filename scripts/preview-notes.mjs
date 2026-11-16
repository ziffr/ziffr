#!/usr/bin/env node
// Prints the text of the rolling Preview pre-release (.github/workflows/preview.yml): the release notes waiting in
// .changeset/ under the version they would make, then every commit since the last release tag. Needs the full git
// history (fetch-depth: 0). Usage: node scripts/preview-notes.mjs owner/repo
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nextVersion, parseChangeset, renderPreview } from "./release-lib.mjs";

const repo = process.argv[2];
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw new Error("Give the repository as owner/name.");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const notes = readdirSync(".changeset")
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .map((f) => parseChangeset(readFileSync(join(".changeset", f), "utf8")))
  .filter(Boolean);
const current = JSON.parse(readFileSync("package.json", "utf8")).version;
const since = git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*");
const commits = git("log", "--no-merges", "--format=%H%x09%s", `${since}..HEAD`)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [sha, ...rest] = line.split("\t");
    return { sha, subject: rest.join("\t") };
  });

process.stdout.write(
  renderPreview({ notes, next: nextVersion(current, notes), since, commits, repo, day: new Date().toISOString().slice(0, 10) }),
);
