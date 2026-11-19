#!/usr/bin/env node
// Prints the text of the rolling Preview pre-release (.github/workflows/preview.yml): the release notes added to
// .changeset/ since the last release tag, under the version they would make (the same notes the Release button would
// take, scripts/next-release.mjs), then every commit since that tag. Needs the full git history (fetch-depth: 0).
// Usage: node scripts/preview-notes.mjs owner/repo
import { execFileSync } from "node:child_process";
import { changesetsSince, previousTag } from "./next-release.mjs";
import { nextVersion, parseChangeset, renderPreview } from "./release-lib.mjs";

const repo = process.argv[2];
if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw new Error("Give the repository as owner/name.");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const since = previousTag();
// A file that is no release note is left out here; the Release button refuses it, and CI before it.
const notes = changesetsSince(since).map((f) => parseChangeset(f.text)).filter(Boolean);
const commits = git("log", "--no-merges", "--format=%H%x09%s", `${since}..HEAD`)
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [sha, ...rest] = line.split("\t");
    return { sha, subject: rest.join("\t") };
  });

process.stdout.write(
  renderPreview({ notes, next: nextVersion(since.slice(1), notes), since, commits, repo, day: new Date().toISOString().slice(0, 10) }),
);
