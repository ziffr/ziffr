// The pure parts of the advisory AI review (#578): the size cap, the chapters, the prompt, the comment.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANSWER_LIMIT, MARKER, buildPrompt, capDiff, commentBody, touchedChapters } from "./ai-review-lib.mjs";

test("a small diff is kept whole", () => {
  assert.deepEqual(capDiff("a\nb\n", 100), { text: "a\nb\n", cut: false });
});

test("a large diff is cut at a line end and says so", () => {
  const r = capDiff("aaaa\nbbbb\ncccc\n", 12);
  assert.equal(r.cut, true);
  assert.equal(r.text, "aaaa\nbbbb");
  assert.ok(capDiff("x".repeat(50), 10).text.length <= 10);
});

const chapters = [
  { file: "docs/user-guide/02-concepts.md", screens: ["apps/web/src/app/metrics/**"], text: "concepts" },
  { file: "docs/user-guide/03-how.md", screens: ["apps/web/src/app/other/**"], text: "how" },
];

test("chapters: those that describe a changed screen and those changed themselves", () => {
  assert.deepEqual(touchedChapters(["apps/web/src/app/metrics/page.tsx"], chapters).map((c) => c.file), ["docs/user-guide/02-concepts.md"]);
  assert.deepEqual(touchedChapters(["docs/user-guide/03-how.md"], chapters).map((c) => c.file), ["docs/user-guide/03-how.md"]);
  assert.deepEqual(touchedChapters(["packages/core/src/x.ts"], chapters), []);
});

test("chapters stop at the size limit", () => {
  const files = ["apps/web/src/app/metrics/page.tsx", "apps/web/src/app/other/page.tsx"];
  assert.equal(touchedChapters(files, chapters, 8).length, 1);
});

test("the prompt holds the docs, the title, the files and the capped diff, and treats them as data", () => {
  const { system, user } = buildPrompt({
    title: "Add a thing", files: ["a.ts", "b.ts"], diff: "d".repeat(70_000), agents: "AGENTS TEXT", glossary: "GLOSSARY TEXT", chapters: [chapters[0]],
  });
  assert.match(user, /AGENTS TEXT/);
  assert.match(user, /GLOSSARY TEXT/);
  assert.match(user, /<chapter file="docs\/user-guide\/02-concepts.md">/);
  assert.match(user, /<changed_files count="2">\na.ts\nb.ts/);
  assert.match(user, /<diff cut="true">/);
  assert.ok(user.length < 60_000 + 2_000);
  assert.match(system, /untrusted/);
  assert.match(system, /Avoid/);
});

test("without chapters the prompt says none were touched", () => {
  const { user } = buildPrompt({ title: "t", files: [], diff: "x", agents: "a", glossary: "g", chapters: [] });
  assert.match(user, /\(none touched\)/);
  assert.match(user, /<diff cut="false">/);
});

test("the comment carries the marker, no live @mentions, and a size limit", () => {
  const body = commentBody(`ping @someone ${"x".repeat(ANSWER_LIMIT * 2)}`, "claude-haiku-5-5");
  assert.ok(body.startsWith(MARKER));
  assert.ok(!/@someone/.test(body));
  assert.ok(body.length < ANSWER_LIMIT + 300);
});
