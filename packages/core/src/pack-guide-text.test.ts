// A Pack Guide as a person writes it in Export as Pack (spec 0058, #1230): the fields become the file's blocks, a web
// address or markup is refused at its section and line, the list of contents names what it is given, and a guide goes to
// the fields and back unchanged.
import { describe, expect, it } from "vitest";
import { PACK_GUIDE_LIMITS, type PackGuide } from "@ziffr/pack/pack-guide";
import { contentsText, GUIDE_FIELD_MAX, guideFromText, guideToText } from "./pack-guide-text";
import { checkPack, type Pack } from "./pack";
import { PACK } from "./pack.test";

/** The guide as a Pack's file would be checked with it, by the very check every file meets. */
const passes = (guide: PackGuide) => {
  const res = checkPack(JSON.stringify({ ...PACK, format: "ziffr.pack/2", guide } satisfies Pack));
  return res.ok ? [] : res.problems;
};

describe("what a person writes", () => {
  it("becomes headings, paragraphs, lists and numbered steps that pass the file's check", () => {
    const { guide, problems } = guideFromText({
      whatItsFor: "  For a **weekly** call.\r\nOne more line.\t",
      firstSteps: "# Start here\n1. Open Packs.\n2) Choose **Set up**.\n\n3. Done.\n\n1. A second list.",
      beforeYouStart: "- A quota\n* A person\n• A day\n\n- Another list\n#1 is a paragraph\n-5 degrees is one too",
      eachPart: "   \n\n",
    });
    expect(problems).toEqual([]);
    expect(guide).toEqual({
      whatItsFor: [{ type: "text", text: "For a **weekly** call." }, { type: "text", text: "One more line." }],
      beforeYouStart: [{ type: "list", items: ["A quota", "A person", "A day"] }, { type: "list", items: ["Another list"] }, { type: "text", text: "#1 is a paragraph" }, { type: "text", text: "-5 degrees is one too" }],
      firstSteps: [{ type: "heading", text: "Start here" }, { type: "list", numbered: true, items: ["Open Packs.", "Choose **Set up**.", "Done."] }, { type: "list", numbered: true, items: ["A second list."] }],
    });
    expect(passes(guide!)).toEqual([]);
  });

  it("is no guide when every field is empty, or when what came is no such thing", () => {
    for (const input of [undefined, null, "a text", 7, [], {}, { whatItsFor: "" }, { whatItsFor: " \n ", questions: null }, { pricing: "Free." }, JSON.parse('{"__proto__":"x"}')])
      expect(guideFromText(input), JSON.stringify(input)).toEqual({ guide: null, problems: [] });
  });

  it.each([
    ["a web address", "Read https://evil.example first."],
    ["a bare address", "Read evil.com first."],
    ["an e-mail address", "Write to boss@evil.example today."],
    ["a Markdown link", "Read [this](page) first."],
    ["HTML", "<img src=x onerror=alert(1)>"],
    ["code", "Run `rm -rf` now."],
    ["a template", "Hello {name}."],
    ["a line separator", "One. Two."],
    ["characters that turn text around", "Pay ‮eno now."],
    ["an address split by bold marks", "Open evil.**com** now."],
    ["bold without its pair", "Open **Packs."],
    ["a paragraph too long", "x".repeat(PACK_GUIDE_LIMITS.text + 1)],
  ])("refuses %s, in words, at its section and line", (_what, line) => {
    for (const [prefix, what] of [["", "This paragraph "], ["- ", "This list entry "]]) {
      const { guide, problems } = guideFromText({ questions: `Fine.\n\n${prefix}${line}` });
      expect(guide).toBeNull();
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatchObject({ section: "questions", line: 3 });
      expect(problems[0].message.startsWith(what), problems[0].message).toBe(true);
    }
  });

  it("names a heading, a list, a section and the whole guide that are over their limits", () => {
    expect(guideFromText({ questions: `# ${"x".repeat(81)}` }).problems).toEqual([{ section: "questions", line: 1, message: "This heading has 81 characters; at most 80 are allowed." }]);
    expect(guideFromText({ questions: "#" }).problems).toEqual([{ section: "questions", line: 1, message: "This heading must not be empty." }]);
    expect(guideFromText({ questions: Array.from({ length: 21 }, () => "- x").join("\n") }).problems).toEqual([{ section: "questions", line: 1, message: "This list has 21 entries; at most 20 are allowed." }]);
    expect(guideFromText({ questions: Array.from({ length: 61 }, () => "x").join("\n") }).problems).toEqual([{ section: "questions", line: null, message: "This section has 61 entries; at most 60 are allowed." }]);
    const full = Array.from({ length: 60 }, () => "x".repeat(600)).join("\n");
    expect(guideFromText({ questions: full }).problems).toContainEqual({ section: null, line: null, message: expect.stringMatching(/^The guide is [\d,]+ bytes; at most 32,768 are allowed\.$/) });
    expect(guideFromText({ questions: "x".repeat(GUIDE_FIELD_MAX + 1) }).problems).toEqual([{ section: "questions", line: null, message: expect.stringContaining("more than a whole guide may hold") }]);
    expect(guideFromText({ questions: 7 }).problems).toEqual([{ section: "questions", line: null, message: "This section is not a text." }]);
  });

  it("goes back into the fields as it was, so exporting an installed guide again writes the same guide", () => {
    const guide: PackGuide = {
      whatItsFor: [{ type: "text", text: "For a **weekly** call." }, { type: "text", text: "Two." }],
      firstSteps: [{ type: "heading", text: "Start here" }, { type: "list", numbered: true, items: ["One.", "Two."] }, { type: "list", numbered: true, items: ["Again."] }],
      eachPart: [{ type: "list", items: ["A", "B"] }, { type: "list", items: ["C"] }],
      questions: [{ type: "heading", text: "Why?" }, { type: "text", text: "Because." }],
    };
    expect(guideFromText(guideToText(guide))).toEqual({ guide, problems: [] });
  });
});

describe("the list of what goes into the file", () => {
  it("names every item given, by kind, and passes as a guide", () => {
    const text = contentsText(PACK.contents);
    for (const name of PACK.contents.metrics!.map((m) => m.metric.name)) expect(text).toContain(`- ${name}`);
    expect(text).toContain("# Metrics");
    expect(text).toContain("# Dashboards");
    expect(text).toContain(`- ${PACK.contents.themes![0].theme.name}`);
    expect(text).not.toContain("# Views");
    const { guide, problems } = guideFromText({ eachPart: text });
    expect(problems).toEqual([]);
    expect(passes(guide!)).toEqual([]);
    expect(contentsText({})).toBe("");
  });

  it("splits long lists, never lets a name make bold marks, and stops before it fills the guide", () => {
    const metrics = Array.from({ length: 50 }, (_x, i) => ({ metric: { name: `Evil**.com ${i}` } }));
    const split = guideFromText({ eachPart: contentsText({ metrics }) });
    expect(split.problems).toEqual([]);
    expect(split.guide!.eachPart!.map((b) => (b.type === "list" ? b.items.length : b.type))).toEqual(["heading", 20, 20, 10]);
    expect(JSON.stringify(split.guide)).not.toContain("**");
    const many = Array.from({ length: 50 }, () => ({ template: { name: "ü".repeat(80) } }));
    const long = contentsText({ dashboards: many, decks: many, workflows: many });
    expect(long).toMatch(/And \d+ more\.$/);
    expect(guideFromText({ eachPart: long }).problems).toEqual([]);
  });
});
