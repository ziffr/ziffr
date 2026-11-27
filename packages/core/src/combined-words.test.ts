// The words of a Combined Prompt (spec 0064; GLOSSARY: Combined Prompt): how many figures one message holds, their
// order, and what the subject and text say.
import { describe, expect, it } from "vitest";
import { combinedChunks, combinedOrder, combinedWords, type CombinedLine } from "./combined-words";

const line = (over: Partial<CombinedLine> = {}): CombinedLine => ({ metric: "Revenue", period: "October 2026", due: "2026-11-04", stillMissing: false, forName: null, replyHere: true, form: true, ...over });
const numbered = (lines: CombinedLine[]) => lines.map((l, i) => ({ ...l, position: i + 1 }));
const figures = (n: number, form = true) => Array.from({ length: n }, (_, i) => ({ i, form }));

describe("how many figures one message holds", () => {
  it("holds at most 50", () => {
    expect(combinedChunks("email", figures(120)).map((c) => c.length)).toEqual([50, 50, 20]);
    expect(combinedChunks("email", [])).toEqual([]);
  });
  it("splits a chat message earlier only when more figures than it lists cannot be answered on the form", () => {
    expect(combinedChunks("slack", figures(45)).map((c) => c.length)).toEqual([45]);
    expect(combinedChunks("telegram", figures(45, false)).map((c) => c.length)).toEqual([20, 20, 5]);
  });
});

describe("the order", () => {
  it("lists what a reply records first, new before still missing", () => {
    const lines = [line({ metric: "a", replyHere: false }), line({ metric: "b", stillMissing: true }), line({ metric: "c" })];
    expect(combinedOrder("email", lines).map((l) => l.metric)).toEqual(["c", "b", "a"]);
  });
  it("keeps what the form does not take among the 20 a chat message lists", () => {
    const lines = [...Array.from({ length: 25 }, (_, i) => line({ metric: `m${i}` })), line({ metric: "chat only", form: false })];
    expect(combinedOrder("slack", lines).slice(0, 20).map((l) => l.metric)).toContain("chat only");
  });
});

describe("the words", () => {
  const words = (lines: CombinedLine[], via: "email" | "slack" = "email", link: string | null = "https://ziffr.example/f/x") =>
    combinedWords({ via, firstName: "Sara", lines: numbered(lines), link, today: "2026-11-01" });

  it("names the count and the first figure, numbers each line and says how to answer", () => {
    const w = words([line(), line({ metric: "Open tickets", period: "week of 26 Oct 2026", due: "2026-10-30", stillMissing: true }), line({ metric: "NPS", forName: "Ann" })]);
    expect(w.subject).toBe("3 numbers due: Revenue and 2 more");
    expect(w.body).toContain("Hi Sara,");
    expect(w.body).toContain("1. Revenue, October 2026, due 4 Nov");
    expect(w.body).toContain("2. Open tickets, week of 26 Oct 2026, was due 30 Oct");
    expect(w.body).toContain("3. NPS, October 2026, due 4 Nov, for Ann");
    expect(w.body).toContain("New");
    expect(w.body).toContain("Still missing");
    expect(w.body).toContain('Reply with one line for each, such as "1: 45". Words under a number are its note.');
    expect(w.body).toContain("Or enter them on one page: https://ziffr.example/f/x");
  });
  it("says still missing on the line when there is only one part", () => {
    const w = words([line({ stillMissing: true }), line({ metric: "NPS", stillMissing: true })]);
    expect(w.body).toContain("1. Revenue, October 2026, still missing, due 4 Nov");
  });
  it("sets apart what only the form takes, and offers no link while there is none", () => {
    const w = words([line(), line({ metric: "Costs", replyHere: false })], "email", null);
    expect(w.body).toContain("Only on the form\n2. Costs");
    expect(w.body).not.toContain("on one page");
  });
  it("lists 20 in a chat message and counts the rest", () => {
    const w = words(Array.from({ length: 32 }, (_, i) => line({ metric: `m${i}` })), "slack");
    expect(w.body).toContain("and 12 more on the form");
    expect(w.body).not.toContain("21. ");
  });
  it("lists fewer in a chat message with long names, so the link at its end is never cut off", () => {
    const w = words(Array.from({ length: 20 }, (_, i) => line({ metric: `${i} ${"&".repeat(60)}` })), "slack");
    expect(w.body.replace(/&/g, "&amp;").length).toBeLessThanOrEqual(2600);
    expect(w.body).toMatch(/and \d+ more on the form\n/);
    expect(w.body.endsWith("https://ziffr.example/f/x")).toBe(true);
  });
  it("keeps a closed figure in its place and names it only when it may be named", () => {
    const w = words([line({ closed: { words: "Answered on Email", named: true } }), line({ metric: "Secret", closed: { words: "No longer asked", named: false } }), line({ metric: "NPS" })]);
    expect(w.body).toContain("1. Revenue, October 2026: Answered on Email");
    expect(w.body).toContain("2. No longer asked");
    expect(w.body).not.toContain("Secret");
    expect(w.subject).toBe("1 number due: NPS");
  });
});
