// The Help panel's chapter route (spec 0050): a listed chapter comes back rendered, anything else is refused and
// no file outside the guide's folder is ever read.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { GET } from "./route";

beforeAll(() => {
  const dir = mkdtempSync(path.join(tmpdir(), "guide-"));
  writeFileSync(path.join(dir, "01-first.md"), "# First chapter\n\nSee [the second](02-second.md#part-two) and [out](https://example.com).\n\n## Part two\n\nText.\n");
  writeFileSync(path.join(dir, "02-second.md"), "# Second\n\nHi.\n");
  // A file next to the guide folder that must stay unreadable.
  writeFileSync(path.join(dir, "..", "secret-guide-test.md"), "secret");
  process.env.ZIFFR_USER_GUIDE_DIR = dir;
});

const ask = (chapter: string) => GET(new Request("http://x/api/guide/" + encodeURIComponent(chapter)), { params: Promise.resolve({ chapter }) });

describe("GET /api/guide/[chapter]", () => {
  it("returns a listed chapter rendered, with cache headers", async () => {
    const res = await ask("first");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age");
    const body = await res.json();
    expect(body).toMatchObject({ slug: "first", title: "First chapter", href: "/guide/first" });
    expect(body.html).toContain('<h2 id="part-two">Part two</h2>');
    expect(body.html).toContain('href="/guide/second#part-two"');
    expect(body.html).toContain('target="_blank"');
  });

  it("refuses unknown chapters and path tricks", async () => {
    for (const bad of ["nope", "../secret-guide-test", "..%2Fsecret-guide-test", "01-first.md", "first/../second", "FIRST", "a".repeat(200), ""]) {
      const res = await ask(bad);
      expect(res.status, bad).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });
});
