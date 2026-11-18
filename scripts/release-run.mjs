#!/usr/bin/env node
// The first job of the Release button (.github/workflows/release.yml, ADR 0004): makes the release commit, gets it
// into main and tags it. It runs on GitHub with the workflow's own token, never on a person's computer.
//   1. It turns the notes in .changeset/ into a new CHANGELOG.md section, sets the product version in every package
//      and the Docker files, and commits that on a branch `release/vX.Y.Z`.
//   2. main takes changes only through pull requests whose checks pass, for everyone, so it opens the release pull
//      request and starts CI on its branch. A pull request or push made with the workflow's token starts no run of
//      its own (GitHub's rule against loops); starting a workflow by name is the one exception.
//   3. Once the checks pass, it merges exactly the commit they passed on, tags the merged commit vX.Y.Z after checking
//      it holds only release files, and pushes the tag. The later jobs of the same run publish it.
// Pressed again after a failure, it carries on: a merged release without its tag is tagged; a release pull request
// an earlier run left open (its checks failed) is closed and made again from today's main.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { insertSection, nextVersion, parseChangeset, renderSection, setDockerVersion } from "./release-lib.mjs";

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    throw new Error(`${cmd} ${args.join(" ")} failed${e.stderr?.trim() ? `:\n${e.stderr.trim()}` : ""}`);
  }
};
const git = (...args) => run("git", args);
const gh = (...args) => run("gh", args);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const output = (name, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
const summary = (text) => appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n`);
const PACKAGES = ["package.json", "apps/web/package.json", "packages/core/package.json"];
const DOCKER = ["docker/compose.yml", "docker/install.sh"];
/** The only files a release commit may change. */
const RELEASE_FILE = (f) => f === "CHANGELOG.md" || f.startsWith(".changeset/") || PACKAGES.includes(f) || DOCKER.includes(f);
/** The checks main requires (the ruleset "main"); all of them must have passed on the release commit. */
const REQUIRED = ["check", "core-db", "numbers"];
const BOT = "app/github-actions";

const tagged = (v) => Boolean(git("ls-remote", "--tags", "origin", `refs/tags/v${v}`));

/** Tags the release commit `sha` of `version` and pushes the tag, after checking that it holds only release files. */
function tag(version, sha) {
  const other = git("show", "--name-only", "--format=", sha).split("\n").filter((f) => f && !RELEASE_FILE(f));
  if (other.length) throw new Error(`The release commit ${sha} changes files a release does not (${other.slice(0, 5).join(", ")}): not tagging it.`);
  git("tag", "-a", `v${version}`, "-m", `Ziffr ${version}`, sha);
  git("push", "-q", "origin", `v${version}`);
  output("version", version);
  output("sha", sha);
  summary(`Tagged **v${version}** on ${sha}.`);
}

git("config", "user.name", "github-actions[bot]");
git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com");

// A release merged by an earlier run that stopped before its tag.
const head = git("rev-parse", "HEAD");
const merged = /^Release (\d+\.\d+\.\d+) \(#\d+\)$/.exec(git("log", "-1", "--format=%s"))?.[1];
if (merged && !tagged(merged)) {
  tag(merged, head);
  process.exit(0);
}

// A release pull request an earlier run left open: made again from today's main.
for (const pr of JSON.parse(gh("pr", "list", "--state", "open", "--json", "number,headRefName,author", "--limit", "100"))) {
  if (/^release\/v\d+\.\d+\.\d+$/.test(pr.headRefName) && pr.author?.login === BOT) {
    gh("pr", "close", String(pr.number), "--delete-branch", "--comment", "Replaced by a new run of the Release button.");
  }
}

// 1. The release commit.
const files = readdirSync(".changeset").filter((f) => f.endsWith(".md") && f !== "README.md");
const notes = files.map((f) => {
  const n = parseChangeset(readFileSync(join(".changeset", f), "utf8"));
  if (!n) throw new Error(`.changeset/${f} is not a release note (see .changeset/README.md).`);
  return n;
});
if (!notes.length) throw new Error("No release notes are waiting in .changeset/: nothing to release.");
const version = nextVersion(JSON.parse(readFileSync("package.json", "utf8")).version, notes);
if (tagged(version)) throw new Error(`v${version} is tagged already.`);
const section = renderSection(version, new Date().toISOString().slice(0, 10), notes);
summary(section);

const branch = `release/v${version}`;
writeFileSync("CHANGELOG.md", insertSection(readFileSync("CHANGELOG.md", "utf8"), section));
for (const p of PACKAGES) writeFileSync(p, readFileSync(p, "utf8").replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
for (const p of DOCKER) writeFileSync(p, setDockerVersion(readFileSync(p, "utf8"), version));
for (const f of files) rmSync(join(".changeset", f));
git("switch", "-q", "-c", branch);
git("add", "-A", "CHANGELOG.md", ".changeset", ...PACKAGES, ...DOCKER);
git("commit", "-q", "-m", `Release ${version}`);
const sha = git("rev-parse", "HEAD");
git("push", "-q", "--force", "origin", branch);

// 2. The pull request, and CI on its branch.
const url = gh("pr", "create", "--head", branch, "--base", "main", "--title", `Release ${version}`,
  "--body", `The release of ${version}: its CHANGELOG.md section, the version in every package and the Docker files (ADR 0004). Made by the Release button.`);
const number = url.split("/").pop();
summary(`Release pull request: ${url}`);
gh("workflow", "run", "ci.yml", "--ref", branch);

// 3. Waits for the required checks on that commit, then merges it.
for (let i = 0; ; i++) {
  if (i > 180) throw new Error(`The checks of ${url} did not finish within an hour.`);
  await pause(20_000);
  let checks;
  try {
    checks = JSON.parse(gh("pr", "checks", number, "--json", "name,bucket,link"));
  } catch {
    continue; // none reported yet
  }
  const failed = checks.filter((c) => c.bucket === "fail" || c.bucket === "cancel");
  if (failed.length) throw new Error(`A check of ${url} failed: ${failed.map((c) => `${c.name} ${c.link}`).join(", ")}. Fix it on main and press Release again.`);
  if (REQUIRED.every((name) => checks.some((c) => c.name === name && c.bucket === "pass"))) break;
}
gh("pr", "merge", number, "--squash", "--delete-branch", "--match-head-commit", sha, "--subject", `Release ${version} (#${number})`);
let mergeSha = "";
for (let i = 0; i < 30 && !mergeSha; i++) {
  mergeSha = JSON.parse(gh("pr", "view", number, "--json", "mergeCommit")).mergeCommit?.oid ?? "";
  if (!mergeSha) await pause(2000);
}
if (!mergeSha) throw new Error(`${url} is merged, but GitHub gives no merge commit yet. Press Release again to tag it.`);
git("fetch", "-q", "origin", "main");
tag(version, mergeSha);
// The merge was pushed with the workflow's token, which starts no Preview run of its own.
gh("workflow", "run", "preview.yml", "--ref", "main");
