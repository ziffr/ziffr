// Tests for the release rules (ADR 0004). Run with `pnpm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeDate, insertSection, nextVersion, parseChangeset, renderSection, sectionOf } from "./release-lib.mjs";

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

test("the section puts self-hoster notes first, developer notes last, and ends with the AGPL date", () => {
  const s = renderSection("0.2.0", "2026-11-13", [
    { bump: "minor", note: "Developers: the core has tests." },
    { bump: "minor", note: "People sign in." },
    { bump: "patch", note: "Form links cannot be guessed." },
    { bump: "minor", note: "Self-hosters: run the new migrations." },
  ]);
  const order = ["For self-hosters", "New and changed", "Fixed", "For developers"].map((h) => s.indexOf(h));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(!order.includes(-1));
  assert.match(s, /- Run the new migrations\./);
  assert.ok(!s.includes("Self-hosters:") && !s.includes("Developers:"));
  assert.match(s, /AGPL-3.0 on 2029-11-13\.\n$/);
});

test("the release notes are exactly the changelog section of that version", () => {
  const intro = "# Changelog\n\nIntro.\n\n";
  const older = "## 0.1.0 (2026-10-01)\n\n- First.\n";
  const section = renderSection("0.2.0", "2026-11-13", [{ bump: "minor", note: "Second." }]);
  const log = insertSection(intro + older, section);
  assert.ok(log.startsWith(intro + "## 0.2.0"));
  assert.equal(sectionOf(log, "0.2.0"), section.split("\n").slice(1).join("\n").trim() + "\n");
  assert.equal(sectionOf(log, "0.1.0"), "- First.\n");
  assert.equal(sectionOf(log, "9.9.9"), null);
});
