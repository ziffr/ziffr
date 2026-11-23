// The Help panel's data (spec 0050): the search index is current with docs/user-guide and covers every chapter, the route
// table points at real chapters and real pages, and searches find the chapter a person would expect.
// UPDATE_REFERENCE=1 rewrites the generated index (pnpm --filter @ziffr/web help:index).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildHelpIndex, chapterSections, plainText, type HelpIndex } from "./help-index-build";
import { HELP_ROUTES, chapterForPath } from "./help-routes";
import { searchHelp } from "./help-search";
import { CHAPTER_FILE } from "./user-guide-render";

const guideDir = fileURLToPath(new URL("../../../../docs/user-guide", import.meta.url));
const appDir = fileURLToPath(new URL("../app", import.meta.url));
const indexPath = fileURLToPath(new URL("./help-index.generated.json", import.meta.url));
const files = readdirSync(guideDir).filter((f) => CHAPTER_FILE.test(f)).map((name) => ({ name, markdown: readFileSync(join(guideDir, name), "utf8") }));
const built = buildHelpIndex(files);
const json = JSON.stringify(built) + "\n";
// Written before the tests read it, so one run with UPDATE_REFERENCE=1 is enough.
if (process.env.UPDATE_REFERENCE === "1") writeFileSync(indexPath, json);

/** Every page.tsx under the app folder as a route pattern, e.g. `/metrics/[slug]`. */
function pageRoutes(dir = appDir, at = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pageRoutes(join(dir, e.name), `${at}/${e.name}`) : e.name === "page.tsx" ? [at || "/"] : []);
}

describe("the help index", () => {
  it("matches the generated file", () => {
    expect(readFileSync(indexPath, "utf8"), "help-index.generated.json is out of date: run pnpm --filter @ziffr/web help:index").toBe(json);
  });
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as HelpIndex;
  it("covers every chapter file, each with sections and a title", () => {
    expect(index.chapters.map((c) => c.slug)).toEqual(files.map((f) => CHAPTER_FILE.exec(f.name)![2]));
    for (const c of index.chapters.filter((c) => c.slug !== "words-in-ziffr")) {
      expect(c.title, c.slug).not.toBe("");
      expect(c.sections.length, c.slug).toBeGreaterThan(0);
    }
  });
  it("stays small enough to ship", () => {
    expect(readFileSync(indexPath, "utf8").length).toBeLessThan(260_000);
  });
  it("keeps code and tables out of the text", () => {
    expect(plainText("Before\n\n```sh\nrm -rf /\n```\n\n| a | b |\n| - | - |\n\nAfter **bold** [link](x.md)")).toBe("Before\nAfter bold link");
    const s = chapterSections("# T\n\nLead.\n\n## One\n\n```\n## not a heading\n```\n\ntext\n\n### Two\n\nmore", "T");
    expect(s.map((x) => [x.id, x.heading, x.text])).toEqual([["", "T", "Lead."], ["one", "One", "text"], ["two", "Two", "more"]]);
  });
});

describe("the route table", () => {
  it("points only at chapters that exist", () => {
    const slugs = new Set(built.chapters.map((c) => c.slug));
    for (const [prefix, slug] of HELP_ROUTES) expect(slugs.has(slug), `${prefix} → ${slug}`).toBe(true);
  });
  it("lists only routes that exist as pages", () => {
    const pages = pageRoutes();
    for (const [prefix] of HELP_ROUTES) {
      const exists = pages.some((p) => p === prefix || p.startsWith(prefix + "/"));
      expect(exists, `${prefix} has no page`).toBe(true);
    }
  });
  it("matches the longest prefix", () => {
    expect(chapterForPath("/")).toBe("dashboards");
    expect(chapterForPath("/metrics/revenue/2026-03")).toBe("metrics");
    expect(chapterForPath("/settings/packs")).toBe("packs");
    expect(chapterForPath("/settings/profile")).toBe("your-settings");
    expect(chapterForPath("/settings/keys")).toBe("workspace-settings");
    expect(chapterForPath("/settingsx")).toBeNull();
    expect(chapterForPath("/guide/metrics")).toBeNull();
  });
});

describe("searching the help", () => {
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as HelpIndex;
  it("finds the chapter a person would expect", () => {
    expect(searchHelp(index, "pack marketplace")[0]?.chapter).toBe("packs");
    expect(searchHelp(index, "paste values spreadsheet")[0]?.chapter).toBe("metrics");
    expect(searchHelp(index, "audit log")[0]?.chapter).toBe("workspace-settings");
    expect(searchHelp(index, "deck theme").some((h) => h.chapter === "decks-and-themes")).toBe(true);
  });
  it("needs every word, returns nothing for nothing, and snippets stay short", () => {
    expect(searchHelp(index, "zzzqqq")).toEqual([]);
    expect(searchHelp(index, "  ")).toEqual([]);
    for (const h of searchHelp(index, "metric")) expect(h.snippet.length).toBeLessThan(200);
  });
});
