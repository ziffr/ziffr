// Tests for the release rules (ADR 0004, ADR 0014). Run with `pnpm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeDate, changesetPaths, nextRelease, nextVersion, parseChangeset, renderNotes, renderPreview, setDockerVersion } from "./release-lib.mjs";

test("a Changeset gives its largest bump and its note on one line", () => {
  assert.deepEqual(parseChangeset('---\n"@ziffr/web": patch\n"@ziffr/core": minor\n---\n\nPeople can\nsign in.\n'), { bump: "minor", note: "People can sign in." });
  assert.equal(parseChangeset("no front matter"), null);
  assert.equal(parseChangeset('---\n"@ziffr/web": patch\n---\n\n'), null);
});

test("the next version follows the largest bump, and a major before 1.0 is refused", () => {
  assert.equal(nextVersion("0.1.0", [{ bump: "patch" }]), "0.1.1");
  assert.equal(nextVersion("0.1.3", [{ bump: "patch" }, { bump: "minor" }]), "0.2.0");
  assert.equal(nextVersion("1.2.3", [{ bump: "major" }]), "2.0.0");
  assert.throws(() => nextVersion("0.4.0", [{ bump: "major" }]), /before 1.0/);
});

test("a version becomes AGPL-3.0 three years after its release", () => {
  assert.equal(changeDate("2026-11-13"), "2029-11-13");
});

test("the notes put self-hoster notes first, developer notes last, and end with the AGPL date", () => {
  const s = renderNotes("2026-11-13", [
    { bump: "minor", note: "Developers: the core has tests." },
    { bump: "minor", note: "People sign in." },
    { bump: "patch", note: "Form links cannot be guessed." },
    { bump: "minor", note: "Self-hosters: run the new migrations." },
  ]);
  const order = ["For self-hosters", "New and changed", "Fixed", "For developers"].map((h) => s.indexOf(h));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(!order.includes(-1));
  assert.ok(s.startsWith("### For self-hosters\n\n- Run the new migrations.\n"));
  assert.ok(!s.includes("Self-hosters:") && !s.includes("Developers:"));
  assert.match(s, /AGPL-3.0 on 2029-11-13\.\n$/);
});

const note = (bump, text) => `---\n"@ziffr/web": ${bump}\n---\n\n${text}\n`;

test("the next release takes its version from the previous tag and the largest bump among the added notes", () => {
  const files = [{ name: ".changeset/a.md", text: note("patch", "A fix.") }, { name: ".changeset/b.md", text: note("minor", "Something new.") }];
  const r = nextRelease({ previous: "v0.11.0", files, day: "2026-11-20" });
  assert.equal(r.version, "0.12.0");
  assert.equal(r.tag, "v0.12.0");
  assert.equal(r.count, 2);
  assert.match(r.notes, /### New and changed\n\n- Something new\.\n\n### Fixed\n\n- A fix\./);
  assert.equal(nextRelease({ previous: "v0.11.0", files: files.slice(0, 1), day: "2026-11-20" }).version, "0.11.1");
});

test("a release without notes, with a file that is no note, or after a tag that is no release is refused", () => {
  assert.throws(() => nextRelease({ previous: "v0.11.0", files: [], day: "2026-11-20" }), /nothing to release/);
  assert.throws(() => nextRelease({ previous: "v0.11.0", files: [{ name: ".changeset/x.md", text: "hello" }], day: "2026-11-20" }), /x\.md is not a release note/);
  assert.throws(() => nextRelease({ previous: "sdk-v0.1.0", files: [{ name: ".changeset/a.md", text: note("patch", "A.") }], day: "2026-11-20" }), /not a release tag/);
  assert.throws(() => nextRelease({ previous: "v0.11.0", files: [{ name: ".changeset/a.md", text: note("major", "A.") }], day: "2026-11-20" }), /before 1\.0/);
});

test("only Markdown files directly in .changeset are release notes, and not its README", () => {
  assert.deepEqual(changesetPaths([".changeset/a.md", ".changeset/README.md", ".changeset/config.json", ".changeset/x/y.md", "docs/a.md", ""]), [".changeset/a.md"]);
});

test("a release names its version in the Docker files it attaches, and nothing else changes", () => {
  const compose = "  image: ${ZIFFR_IMAGE:-ghcr.io/ziffr/ziffr:main}\n  db: public.ecr.aws/supabase/postgres:17.6.1.165\n";
  assert.equal(setDockerVersion(compose, "0.12.0"), "  image: ${ZIFFR_IMAGE:-ghcr.io/ziffr/ziffr:0.12.0}\n  db: public.ecr.aws/supabase/postgres:17.6.1.165\n");
  assert.equal(setDockerVersion("image: ghcr.io/ziffr/ziffr:0.11.0\n", "0.12.0"), "image: ghcr.io/ziffr/ziffr:0.12.0\n");
  const install = "set -eu\n\nZIFFR_VERSION=0.0.0-dev\nCOMPOSE_URL=\"…/v${ZIFFR_VERSION}/compose.yml\"\n";
  assert.equal(setDockerVersion(install, "0.12.0"), "set -eu\n\nZIFFR_VERSION=0.12.0\nCOMPOSE_URL=\"…/v${ZIFFR_VERSION}/compose.yml\"\n");
  assert.throws(() => setDockerVersion("nothing here\n", "0.12.0"), /No version/);
  assert.throws(() => setDockerVersion(compose, "v0.12.0"), /not a version/);
});

test("the Preview groups the waiting notes like a release and lists every commit since the last one", () => {
  const text = renderPreview({
    notes: [{ bump: "minor", note: "Dashboards can be printed." }, { bump: "patch", note: "Self-hosters: the clock logs less." }],
    next: "0.9.0",
    since: "v0.8.0",
    commits: [{ sha: "a".repeat(40), subject: "Print dashboards" }],
    repo: "ziffr/ziffr",
    day: "2026-11-20",
  });
  assert.match(text, /^What `main` holds on 2026-11-20, beyond v0\.8\.0: not a release/);
  assert.match(text, /## Coming in 0\.9\.0\n\n### For self-hosters\n\n- The clock logs less\.\n\n### New and changed\n\n- Dashboards can be printed\./);
  assert.match(text, /## Every change since v0\.8\.0\n\n- Print dashboards \(\[aaaaaaa\]\(https:\/\/github\.com\/ziffr\/ziffr\/commit\/a{40}\)\)/);
  assert.doesNotMatch(text, /AGPL/);
});

test("an empty Preview says so instead of showing empty lists", () => {
  const text = renderPreview({ notes: [], next: "0.8.1", since: "v0.8.0", commits: [], repo: "ziffr/ziffr", day: "2026-11-20" });
  assert.match(text, /Nothing people use or run has changed yet\./);
  assert.match(text, /None yet\./);
});
