#!/usr/bin/env node
// The next release (ADR 0014): its version and the text of its GitHub release, from the release notes added to
// .changeset/ since the last release tag. Changes nothing: the Release workflow tags and publishes with what it
// prints, and anyone can run it to see what the button would release.
//   node scripts/next-release.mjs           the version, then the notes
//   node scripts/next-release.mjs --json    { previous, version, tag, notes, count }
// In GitHub Actions it also writes `version`, `tag` and `notes` to $GITHUB_OUTPUT. Needs the full git history.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { changesetPaths, nextRelease } from "./release-lib.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** The newest release tag `vX.Y.Z` that `ref` holds. */
export function previousTag(cwd = ".", ref = "HEAD") {
  return git(cwd, "describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*", ref);
}

/** The release notes added since `tag` up to `ref`, as `{ name, text }`. Only files added count: a note that was
 * there at the last release was released with it (or before 0.12.0, removed by it), and stays until a pull request
 * cleans it up. Read from `ref`, not the working tree, so a local edit cannot slip into the notes. */
export function changesetsSince(tag, cwd = ".", ref = "HEAD") {
  const added = git(cwd, "diff", "--diff-filter=A", "--name-only", `${tag}..${ref}`, "--", ".changeset").split("\n");
  return changesetPaths(added).map((name) => ({ name, text: git(cwd, "show", `${ref}:${name}`) }));
}

/** The next release of the repository at `cwd`, as of `ref`, on `day` (YYYY-MM-DD, UTC today by default). */
export function releaseOf({ cwd = ".", ref = "HEAD", day = new Date().toISOString().slice(0, 10) } = {}) {
  const previous = previousTag(cwd, ref);
  return nextRelease({ previous, files: changesetsSince(previous, cwd, ref), day });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const release = releaseOf();
    if (process.env.GITHUB_OUTPUT) {
      // Notes span lines: a delimiter nobody can write into a release note.
      const end = `EOF_${randomUUID()}`;
      appendFileSync(process.env.GITHUB_OUTPUT, `version=${release.version}\ntag=${release.tag}\nnotes<<${end}\n${release.notes}\n${end}\n`);
    }
    if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(release, null, 2) + "\n");
    else process.stdout.write(`${release.tag} (after ${release.previous}, ${release.count} release notes)\n\n${release.notes}`);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
