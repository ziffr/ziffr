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

/** The tags of the published GitHub releases (drafts left out), or null where GitHub cannot be asked, as in the
 * script's own tests. ZIFFR_RELEASE_PUBLISHED_TAGS (space-separated) stands in for GitHub. */
export function publishedTags(cwd = ".") {
  const given = process.env.ZIFFR_RELEASE_PUBLISHED_TAGS;
  if (given !== undefined) return new Set(given.split(/\s+/).filter(Boolean));
  try {
    const out = execFileSync("gh", ["release", "list", "--exclude-drafts", "--limit", "500", "--json", "tagName", "--jq", ".[].tagName"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return new Set(out.split("\n").filter(Boolean));
  } catch {
    return null;
  }
}

/** The newest release tag `vX.Y.Z` that `ref` holds and that was published as a GitHub release. A run that tagged
 * but failed before publishing (0.12.0's image check) leaves a tag with no release: its notes were never published,
 * so the next release counts from the release before it and takes them along. */
export function previousTag(cwd = ".", ref = "HEAD", published = publishedTags(cwd)) {
  const tags = git(cwd, "tag", "--merged", ref, "--list", "v[0-9]*.[0-9]*.[0-9]*", "--sort=-v:refname").split("\n").filter(Boolean);
  if (!tags.length) throw new Error(`No release tag like v0.11.0 is in ${ref}'s history.`);
  return (published && tags.find((t) => published.has(t))) || tags[0];
}

/** Whether the tag exists already: tags are never moved, so a version a failed run took is skipped. */
const tagExists = (cwd, tag) => {
  try { git(cwd, "rev-parse", "--verify", "--quiet", `refs/tags/${tag}`); return true; } catch { return false; }
};

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
  const release = nextRelease({ previous, files: changesetsSince(previous, cwd, ref), day });
  // A version a failed run already tagged is taken: the next patch version that is free.
  while (tagExists(cwd, release.tag)) {
    const [major, minor, patch] = release.version.split(".").map(Number);
    release.version = `${major}.${minor}.${patch + 1}`;
    release.tag = `v${release.version}`;
  }
  return release;
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
