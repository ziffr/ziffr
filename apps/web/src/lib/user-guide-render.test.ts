// The user guide's rendering (docs/user-guide): links between chapters, and nothing a chapter can run in a browser.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHAPTER_FILE, GLOSSARY_MARKER, chapterPart, chapterTitle, glossaryForGuide, glossaryTerms, headingId, linkTarget, renderGuide } from "./user-guide-render";

describe("the user guide", () => {
  it("turns links to chapter files into links inside the app", () => {
    expect(linkTarget("04-connecting.md")).toEqual({ href: "/guide/connecting", external: false });
    expect(linkTarget("./04-connecting.md#feeds-numbers-from-other-systems")).toEqual({ href: "/guide/connecting#feeds-numbers-from-other-systems", external: false });
    expect(renderGuide("[Next](02-concepts.md)")).toContain('<a href="/guide/concepts">Next</a>');
  });

  it("opens outside links in a new tab and drops unsafe ones", () => {
    expect(renderGuide("[Slack](https://slack.com)")).toContain('target="_blank" rel="noopener noreferrer"');
    const html = renderGuide("[click](javascript:alert(1)) and [x](//evil.example) and [y](/\\evil.example)");
    expect(html).not.toContain("href");
    expect(html).toContain("click");
  });

  it("shows raw HTML as text", () => {
    const html = renderGuide('Hello <script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("hides comments, and reads a chapter's part from one", () => {
    const md = "<!-- part: Screen by screen -->\n<!-- screens: apps/web/src/app/metrics/** -->\n# Metrics\n\nText.";
    expect(renderGuide(md)).not.toContain("screens");
    expect(renderGuide(md)).not.toContain("&lt;!--");
    expect(chapterPart(md)).toBe("Screen by screen");
    expect(chapterPart("# No part")).toBeNull();
    expect(chapterTitle(md, "metrics")).toBe("Metrics");
  });

  it("gives headings ids and chapters titles", () => {
    expect(renderGuide("## Feeds: numbers from other systems")).toContain('id="feeds-numbers-from-other-systems"');
    expect(headingId("From a data warehouse")).toBe("from-a-data-warehouse");
    expect(chapterTitle("Intro\n\n# What Ziffr is\n\ntext", "what-ziffr-is")).toBe("What Ziffr is");
    expect(chapterTitle("no heading", "getting-started")).toBe("getting started");
  });

  it("takes in the glossary with its terms as headings and its avoided words as words seen elsewhere", () => {
    const glossary = "# Ziffr\n\nIntro.\n\n## Language\n\n### Input\n\n**Feed**:\nA program outside Ziffr.\n_Avoid_: Integration, sync, workflow, connector (a Connector is how Ziffr reaches people)\n\n**Workflow**:\nA path.\n_Avoid_: Feed\n";
    const out = glossaryForGuide(glossary);
    expect(out).not.toContain("Intro.");
    expect(out).toContain("## Input");
    expect(out).toContain("### Feed");
    expect(out).toContain("*Elsewhere you may see:* Integration, sync, connector\n");
    expect(out).not.toMatch(/_Avoid_|Elsewhere you may see:\* Feed/);
    expect(renderGuide(out)).toContain('<h3 id="feed">Feed</h3>');
  });

  it("links the first bold mention of each glossary term to its entry", () => {
    const terms = glossaryTerms("**Stand-in**:\nx\n\n**Metric**:\ny\n");
    const html = renderGuide("A **Stand-ins** and **Stand-in**, a **Metric**, **Owner** and **[Metric](04-connecting.md)**.", { href: "/guide/words", terms });
    expect(html.match(/href="\/guide\/words#stand-in"/g)).toHaveLength(1);
    expect(html).toContain('href="/guide/words#metric" class="guide-term"><strong>Metric</strong>');
    expect(html).toContain("<strong>Owner</strong>");
    expect(html).not.toContain("<a href=\"/guide/words#metric\" class=\"guide-term\"><strong><a");
  });

  it("knows every term of the real glossary", () => {
    const text = readFileSync(fileURLToPath(new URL("../../../../GLOSSARY.md", import.meta.url)), "utf8");
    const terms = glossaryTerms(text);
    expect(terms.get("stand-in")).toBe("stand-in");
    expect(terms.get("mcp server")).toBe("mcp-server");
    const html = renderGuide(glossaryForGuide(text));
    for (const id of terms.values()) expect(html, id).toContain(`id="${id}"`);
  });

  it("has chapters whose links to each other all lead somewhere", () => {
    const dir = fileURLToPath(new URL("../../../../docs/user-guide/", import.meta.url));
    const files = readdirSync(dir).filter((f) => CHAPTER_FILE.test(f));
    expect(files.length).toBeGreaterThan(0);
    // Each chapter as the app shows it, the glossary chapter with GLOSSARY.md taken in, so links to a section can be checked.
    const glossary = readFileSync(dir + "../../GLOSSARY.md", "utf8");
    const pages = new Map(files.map((f) => [CHAPTER_FILE.exec(f)![2], renderGuide(readFileSync(dir + f, "utf8").replace(GLOSSARY_MARKER, () => glossaryForGuide(glossary)))]));
    for (const [from, html] of pages) {
      for (const [, slug, id] of html.matchAll(/href="\/guide\/([a-z0-9-]+)(?:#([a-z0-9-]+))?"/g)) {
        expect([...pages.keys()], `${from} links to ${slug}`).toContain(slug);
        if (id) expect(pages.get(slug), `${from} links to ${slug}#${id}`).toContain(`id="${id}"`);
      }
    }
  });
});
