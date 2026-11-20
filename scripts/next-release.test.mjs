// Tests for the next release (ADR 0014) against a throwaway git repository: which notes count, which tag is the
// previous one, and that only committed notes are read. Run with `pnpm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseOf } from "./next-release.mjs";

const note = (bump, text) => `---\n"@ziffr/web": ${bump}\n---\n\n${text}\n`;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "ziffr-release-"));
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "tag.gpgSign=false", "-c", "commit.gpgSign=false", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  mkdirSync(join(dir, ".changeset"));
  const write = (name, text) => writeFileSync(join(dir, name), text);
  const commit = (msg) => { git("add", "-A"); git("commit", "-q", "-m", msg); };
  return { dir, git, write, commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the next release counts only the notes added since the newest release tag", (t) => {
  const r = repo();
  t.after(r.done);
  r.write(".changeset/README.md", "# Notes\n");
  r.write(".changeset/config.json", "{}\n");
  r.write(".changeset/old.md", note("minor", "Released with 0.11.0 and never cleaned up."));
  r.commit("before");
  r.git("tag", "-a", "v0.11.0", "-m", "Ziffr 0.11.0");
  r.git("tag", "sdk-v0.1.0");
  r.write(".changeset/fix.md", note("patch", "A fix."));
  r.write(".changeset/old.md", note("minor", "Edited after the release, still released already."));
  r.commit("after");
  // Not committed: never part of a release.
  r.write(".changeset/local.md", note("minor", "Only on this computer."));

  const release = releaseOf({ cwd: r.dir, day: "2026-11-20" });
  assert.equal(release.previous, "v0.11.0");
  assert.equal(release.version, "0.11.1");
  assert.equal(release.count, 1);
  assert.match(release.notes, /- A fix\./);
  assert.doesNotMatch(release.notes, /Released with|Edited after|Only on this computer/);
});

test("a note added and removed again since the tag is not released, and nothing added refuses", (t) => {
  const r = repo();
  t.after(r.done);
  r.write("README.md", "x\n");
  r.commit("first");
  r.git("tag", "-a", "v0.12.0", "-m", "Ziffr 0.12.0");
  r.write(".changeset/gone.md", note("minor", "Reverted."));
  r.commit("add");
  r.git("rm", "-q", ".changeset/gone.md");
  r.commit("remove");
  assert.throws(() => releaseOf({ cwd: r.dir, day: "2026-11-20" }), /No release notes were added to \.changeset\/ since v0\.12\.0/);
});

test("a tag whose run failed before publishing is skipped: its notes come along and its version is not reused", (t) => {
  const r = repo();
  t.after(r.done);
  r.write("README.md", "x\n");
  r.commit("first");
  r.git("tag", "-a", "v0.11.0", "-m", "Ziffr 0.11.0");
  r.write(".changeset/feature.md", note("minor", "A feature."));
  r.commit("feature");
  // The run tagged v0.12.0, then its image check failed: no GitHub release.
  r.git("tag", "-a", "v0.12.0", "-m", "Ziffr 0.12.0");
  r.write(".changeset/fix.md", note("patch", "The fix for that check."));
  r.commit("fix");

  const saved = process.env.ZIFFR_RELEASE_PUBLISHED_TAGS;
  process.env.ZIFFR_RELEASE_PUBLISHED_TAGS = "v0.11.0";
  t.after(() => { if (saved === undefined) delete process.env.ZIFFR_RELEASE_PUBLISHED_TAGS; else process.env.ZIFFR_RELEASE_PUBLISHED_TAGS = saved; });
  const release = releaseOf({ cwd: r.dir, day: "2026-11-20" });
  assert.equal(release.previous, "v0.11.0");
  assert.equal(release.count, 2);
  assert.match(release.notes, /- A feature\./);
  assert.match(release.notes, /- The fix for that check\./);
  assert.equal(release.tag, "v0.12.1");
});
