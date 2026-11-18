#!/usr/bin/env node
// `pnpm release` (ADR 0004): makes a release in one command, as far as the maintainer's approval on GitHub.
//   1. On a clean main, up to date with origin/main, it shows the version and the waiting release notes and asks.
//   2. It turns the notes in .changeset/ into a new CHANGELOG.md section, sets the product version in every package,
//      and commits that on a branch `release/vX.Y.Z`. main takes changes only through pull requests whose checks pass
//      (no one can bypass them), so the release goes in by pull request too: it pushes the branch, opens the pull
//      request, waits for its checks and merges it.
//   3. It tags the merged commit vX.Y.Z (after checking it is that release) and pushes the tag, which starts the
//      release run (.github/workflows/release.yml); that run waits for the maintainer's approval in the `release`
//      environment.
// Run again after an interruption, it carries on where it stopped: an open release pull request, a merged release
// without its tag, or a tag not pushed yet. `--yes` skips the question.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { insertSection, nextVersion, parseChangeset, renderSection, setDockerVersion } from "./release-lib.mjs";

const REPO = "ziffr/ziffr";
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();
const git = (...args) => run("git", args);
const gh = (...args) => run("gh", [...args, "-R", REPO]);
const live = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const PACKAGES = ["package.json", "apps/web/package.json", "packages/core/package.json"];
// The image docker/compose.yml starts and the release docker/install.sh downloads from (spec 0015).
const DOCKER = ["docker/compose.yml", "docker/install.sh"];
const yes = process.argv.includes("--yes");

const versionOnDisk = () => JSON.parse(readFileSync("package.json", "utf8")).version;
const step = (text) => console.log(`\n→ ${text}`);

async function ask(question) {
  if (yes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

/** Back on main, up to date with origin/main. */
function syncMain() {
  git("switch", "-q", "main");
  git("fetch", "-q", "origin", "main", "--tags");
  git("merge", "-q", "--ff-only", "origin/main");
}

/** Step 1 and 2: the release commit on its branch, pushed, with its pull request. Returns the version. */
async function prepare() {
  const files = readdirSync(".changeset").filter((f) => f.endsWith(".md") && f !== "README.md");
  const notes = files.map((f) => {
    const n = parseChangeset(readFileSync(join(".changeset", f), "utf8"));
    if (!n) throw new Error(`.changeset/${f} is not a release note (see .changeset/README.md).`);
    return n;
  });
  if (!notes.length) throw new Error("No release notes are waiting in .changeset/: nothing to release.");
  const version = nextVersion(versionOnDisk(), notes);
  const day = new Date().toISOString().slice(0, 10);
  const section = renderSection(version, day, notes);

  console.log(`\n${section}`);
  if (!(await ask(`Release ${version} with these ${notes.length} notes?`))) throw new Error("Nothing released.");

  step(`Preparing ${version} on release/v${version}`);
  writeFileSync("CHANGELOG.md", insertSection(readFileSync("CHANGELOG.md", "utf8"), section));
  for (const p of PACKAGES) writeFileSync(p, readFileSync(p, "utf8").replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
  for (const p of DOCKER) writeFileSync(p, setDockerVersion(readFileSync(p, "utf8"), version));
  for (const f of files) rmSync(join(".changeset", f));
  git("switch", "-q", "-c", `release/v${version}`);
  git("add", "-A", "CHANGELOG.md", ".changeset", ...PACKAGES, ...DOCKER);
  git("commit", "-q", "-m", `Release ${version}`);

  step("Pushing the branch and opening the pull request");
  git("push", "-q", "-u", "origin", `release/v${version}`);
  gh("pr", "create", "--head", `release/v${version}`, "--base", "main", "--label", "no-release-note", "--title", `Release ${version}`,
    "--body", `The release of ${version}: its CHANGELOG.md section, the version in every package and the Docker files (ADR 0004). Made by \`pnpm release\`.`);
  return version;
}

/** Waits for the release pull request's required checks and merges it. */
async function mergeWhenGreen(version) {
  const branch = `release/v${version}`;
  step(`Waiting for the checks of the release pull request (a few minutes)`);
  // A new pull request has no checks for a moment, and watching it then ends at once.
  for (let i = 0; i < 30; i++) {
    try {
      if (JSON.parse(gh("pr", "checks", branch, "--required", "--json", "name")).length) break;
    } catch { /* none reported yet */ }
    await pause(5000);
  }
  try {
    live("gh", ["pr", "checks", branch, "-R", REPO, "--watch", "--required", "--interval", "20"]);
  } catch {
    throw new Error(`A required check of the release pull request failed: see \`gh pr checks ${branch} -R ${REPO}\`. Fix it on main, then run pnpm release again.`);
  }
  step("Merging the release pull request");
  gh("pr", "merge", branch, "--squash", "--delete-branch");
}

/** Step 3: tags main's merged release commit and pushes the tag. */
function tagAndPush(version) {
  syncMain();
  const subject = git("log", "-1", "--format=%s");
  // A squash merge adds the pull request's number: "Release 0.10.0 (#130)".
  if (!new RegExp(`^Release ${version.replace(/\./g, "\\.")}( \\(#\\d+\\))?$`).test(subject))
    throw new Error(`main's latest commit is "${subject}", not the release of ${version}.`);
  for (const p of PACKAGES) if (JSON.parse(readFileSync(p, "utf8")).version !== version) throw new Error(`${p} is not at ${version}.`);
  if (!git("tag", "--list", `v${version}`)) {
    step(`Tagging v${version}`);
    git("tag", "-a", `v${version}`, "-m", `Ziffr ${version}`);
  }
  step(`Pushing v${version}, which starts the release run`);
  git("push", "-q", "origin", `v${version}`);
}

if (git("status", "--porcelain")) throw new Error("Commit or set aside your changes first: a release starts from a clean tree.");
syncMain();

// Where a release that was interrupted stopped, if one was.
const open = JSON.parse(gh("pr", "list", "--state", "open", "--json", "headRefName", "--limit", "100"))
  .map((p) => p.headRefName).find((b) => /^release\/v\d+\.\d+\.\d+$/.test(b));
const merged = /^Release (\d+\.\d+\.\d+)( \(#\d+\))?$/.exec(git("log", "-1", "--format=%s"))?.[1];
const pushedTag = (v) => Boolean(run("git", ["ls-remote", "--tags", "origin", `refs/tags/v${v}`]));

let version;
if (merged && !pushedTag(merged)) {
  version = merged;
  console.log(`Carrying on with ${version}: its pull request is merged, its tag is not pushed yet.`);
} else if (open) {
  version = open.slice("release/v".length);
  console.log(`Carrying on with ${version}: its pull request is open.`);
  await mergeWhenGreen(version);
} else {
  version = await prepare();
  await mergeWhenGreen(version);
}
tagAndPush(version);

// The run the tag started, once GitHub lists it.
let url = `https://github.com/${REPO}/actions/workflows/release.yml`;
for (let i = 0; i < 12; i++) {
  const found = JSON.parse(gh("run", "list", "--workflow", "release.yml", "--limit", "5", "--json", "url,headBranch")).find((r) => r.headBranch === `v${version}`);
  if (found) { url = found.url; break; }
  await pause(5000);
}
console.log(`\nReleased ${version} as far as your approval. Approve the run in the \`release\` environment:\n  ${url}\n(Review deployments → Approve.) The image is built after the full mutation run, which gates it.`);
