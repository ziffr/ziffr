// The Pack Guide as a page draws it (spec 0058, GLOSSARY: Pack Guide): Ziffr's section titles in their order, headings,
// paragraphs, lists and bold words, and a stranger's words only ever as text.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PackGuideView } from "./pack-guide";
import type { PackGuide } from "@ziffr/pack/pack-guide";

const draw = (guide: PackGuide, author = "Ziffr") => renderToStaticMarkup(<PackGuideView guide={guide} author={author} />);
const guide: PackGuide = {
  questions: [{ type: "text", text: "Can I change it?" }],
  firstSteps: [{ type: "heading", text: "Start here" }, { type: "list", numbered: true, items: ["Open **Packs**.", "Choose Set up."] }],
  whatItsFor: [{ type: "text", text: "A weekly **forecast** call." }],
  beforeYouStart: [{ type: "list", items: ["A quota"] }],
  eachPart: [{ type: "list", items: ["Commit"] }],
};

describe("a Pack Guide on a page", () => {
  it("shows Ziffr's titles in the guide's order, whatever order the file has, with headings, lists and bold words", () => {
    const html = draw(guide);
    const at = ["What it&#x27;s for", "What you need", "First steps", "Each part", "Questions"].map((t) => html.indexOf(`>${t}</summary>`));
    expect(at.every((i, n) => i > 0 && (n === 0 || i > at[n - 1]))).toBe(true);
    expect(html).toContain("<h4 class=\"pt-1 font-semibold\">Start here</h4>");
    expect(html).toMatch(/<ol[^>]*list-decimal/);
    expect(html).toMatch(/<ul[^>]*list-disc/);
    expect(html).toContain("<strong class=\"font-semibold\">forecast</strong>");
    expect(html).not.toContain("**");
    expect(html).toContain("written by Ziffr");
  });

  it("opens what it is for and the first steps, and the first section when it has neither", () => {
    const opened = (html: string) => [...html.matchAll(/<details open=""[^>]*><summary[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(opened(draw(guide))).toEqual(["What it&#x27;s for", "First steps"]);
    expect(opened(draw({ eachPart: guide.eachPart, questions: guide.questions }))).toEqual(["Each part"]);
  });

  it("draws markup, Markdown links and addresses as the words they are, never as an element or a link", () => {
    // The check refuses all of these; the page must not depend on it.
    const hostile = "<img src=x onerror=alert(1)> [here](javascript:alert(1)) **<a href='https://evil.example'>bold</a>** https://evil.example";
    const html = draw({ whatItsFor: [{ type: "text", text: hostile }, { type: "heading", text: "<script>x()</script>" }, { type: "list", items: [hostile] }] }, "<b>them</b>");
    for (const tag of ["<img", "<a ", "<script", "<b>"]) expect(html, tag).not.toContain(tag);
    expect(html).not.toContain("href=\"");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("draws nothing when no section is filled", () => {
    expect(draw({})).toBe("");
  });
});
