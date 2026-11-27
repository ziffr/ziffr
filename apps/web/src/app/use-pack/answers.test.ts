// @vitest-environment happy-dom
// The answers of a guided Pack set-up (spec 0068; GLOSSARY: Pack, Position, Repeat): what they start as, what they
// send, why a screen cannot go on, a pasted list, and what is kept in the tab.
import { beforeEach, describe, expect, it } from "vitest";
import { planStart } from "@ziffr/core/pack-start-plan";
import { startSteps, type StartDeclarations, type StartRoom } from "@ziffr/core/pack-start-steps";
import { addPasted, eligible, limitWords, readPeopleList, startAnswers, stepProblem, tickedShares, toChoices, type Answers, type LinesStep } from "./answers";
import { draftKey, dropAllDrafts, keepDraft, loadDraft, readDraft } from "./draft";
import { packRefOf } from "./switch";
import { askedWhen } from "./when";

const room: StartRoom = { metrics: null, trial: null, practice: false };

const forecast: StartDeclarations = {
  name: "Sales forecast",
  metrics: [
    { key: "commit", name: "Commit", period: "week", takesValues: true, per: "rep", submitters: ["seller"], ask: { question: "What is each quota this quarter?", name: "Quota", every: "quarter" } },
    { key: "team", name: "Team commit", period: "week", takesValues: false, total: { of: "commit", targets: "parts" } },
  ],
  positions: [{ key: "lead", name: "Sales lead" }, { key: "seller", name: "Salesperson", per: "rep" }],
  repeats: [{ key: "rep", name: "Salesperson", max: 3 }],
  workflows: [{ key: "weekly", name: "Weekly forecast", approvers: 1, approveBy: ["lead"] }],
};
const plain: StartDeclarations = {
  name: "Shop",
  metrics: [{ key: "sales", name: "Sales", period: "month", takesValues: true, comesFrom: "system" }, { key: "visits", name: "Visits", period: "month", takesValues: true }],
  feeds: [{ template: "google-sheets", fills: ["sales"] }],
};

const steps = startSteps(forecast, room);
const lines = steps.find((s): s is LinesStep => s.step === "lines")!;
const named = (a: Answers, people: [string, string][]): Answers => ({ ...a, next: 100, lines: { rep: people.map(([name, email], i) => ({ id: 10 + i, name: "", person: { who: "new", here: "", name, email }, others: {} })) } });

beforeEach(() => window.sessionStorage.clear());

describe("the answers", () => {
  it("start with what each step preselects and one empty line, which is not sent", () => {
    const start = startAnswers(steps, room);
    expect(start.lines.rep).toHaveLength(1);
    expect(toChoices(start, steps, "1,234.5")).toEqual({ who: [{ position: "lead", person: { who: "me" } }] });
    expect(stepProblem(lines, start)).toBe("Add at least one.");
  });

  it("count a number's line among the lines sent, and send none after Add later", () => {
    const a = named(startAnswers(steps, room), [["", ""], ["Ana", "ana@x.test"], ["Ben", "ben@x.test"]]);
    const typed = { ...a, numbers: { "commit|11": "1,500", "commit|12": "2k" } };
    const sent = toChoices(typed, steps, "1,234.5");
    expect(sent.lines).toHaveLength(2);
    expect(sent.numbers).toEqual([{ metric: "commit", line: 0, value: 1500 }, { metric: "commit", line: 1, value: 2000 }]);
    expect(toChoices({ ...typed, later: true }, steps, "1,234.5").numbers).toBeUndefined();
    // Read in the person's Number Style.
    expect(toChoices(typed, steps, "1.234,5").numbers![0].value).toBe(1.5);
    expect(planStart(forecast, room, sent, { me: { id: "me-id", name: "Mia" }, people: [] }).problems).toEqual([]);
  });

  it("say what a line misses, and that two lines are two people", () => {
    const start = startAnswers(steps, room);
    expect(stepProblem(lines, named(start, [["Ana", ""]]))).toBe("Add an email address for Ana.");
    expect(stepProblem(lines, named(start, [["Ana", "nonsense"]]))).toBe("That email address does not look right for Ana.");
    expect(stepProblem(lines, named(start, [["Ana", "a@x.test"], ["Bo", "A@x.test"]]))).toMatch(/same person/);
    expect(stepProblem(lines, named(start, [["Ana", "a@x.test"]]))).toBeNull();
  });

  it("say why providers or a number cannot go on", () => {
    const shop = startSteps(plain, room);
    const providers = shop.find((s) => s.step === "providers")!;
    const start = startAnswers(shop, room);
    expect(stepProblem(providers, start)).toBeNull();
    expect(stepProblem(providers, { ...start, providers: { ...start.providers, me: false } })).toMatch(/Nobody for now/);
    expect(toChoices({ ...start, providers: { me: false, others: false, nobody: true, people: [] } }, shop, "1,234.5").providers).toEqual([]);
    const numbers = steps.find((s) => s.step === "numbers")!;
    expect(stepProblem(numbers, { ...startAnswers(steps, room), numbers: { "commit|1": "abc" } })).toMatch(/not a number/);
  });

  it("offer only those who may take a Position, and tick only the proposed Shares until told otherwise", () => {
    const people = [{ id: "m", name: "Mo", kind: "member" as const }, { id: "c", name: "Cy", kind: "contact" as const }];
    expect(eligible(people, ["approve"]).map((p) => p.id)).toEqual(["m"]);
    expect(eligible(people, ["submit"])).toHaveLength(2);
    expect(tickedShares([{ id: "a", suggested: true }, { id: "b", suggested: false }], { shares: { b: true, a: false } })).toEqual(["b"]);
  });

  it("word the room by what bounds it", () => {
    expect(limitWords({ allowed: 4, because: "metrics" }, true)).toBe("4 places in your trial");
    expect(limitWords({ allowed: 3, because: "pack" }, true)).toBe("This Pack takes at most 3");
    expect(limitWords({ allowed: 0, because: "metrics" }, false)).toBe("There is no room for more numbers here.");
  });
});

describe("a pasted list", () => {
  it("reads the usual ways of writing a person, and says what it cannot read", () => {
    const read = readPeopleList("Ana Silva, ana@x.test\nBo Li <bo@x.test>\nSmith, Cy\tcy@x.test\ndee.dee@x.test\nno address here\n");
    expect(read.people).toEqual([
      { name: "Ana Silva", email: "ana@x.test" }, { name: "Bo Li", email: "bo@x.test" }, { name: "Cy Smith", email: "cy@x.test" }, { name: "Dee Dee", email: "dee.dee@x.test" },
    ]);
    expect(read.unread).toEqual(["no address here"]);
  });

  it("takes the empty line's place, skips an address listed twice and stops at the room there is", () => {
    const done = addPasted(lines, startAnswers(steps, room), "A, a@x.test\nA, a@x.test\nB, b@x.test\nC, c@x.test\nD, d@x.test");
    expect(done.added).toBe(3);
    expect(done.answers.lines.rep.map((l) => l.person.email)).toEqual(["a@x.test", "b@x.test", "c@x.test"]);
    expect(done.left).toEqual(["D, d@x.test"]);
    expect(new Set(done.answers.lines.rep.map((l) => l.id)).size).toBe(3);
  });
});

describe("what the tab keeps", () => {
  const key = draftKey("p", "w", "ziffr/sales-forecast");
  const start = startAnswers(steps, room);

  it("is the answers, without the confirmation, with numbers on their lines", () => {
    const a = { ...named(start, [["Ana", "ana@x.test"]]), numbers: { "commit|10": "5" }, confirmed: true };
    keepDraft(key, a);
    const back = loadDraft(key, start, steps)!;
    expect(back.confirmed).toBe(false);
    expect(back.lines.rep[0].person.email).toBe("ana@x.test");
    expect(back.numbers).toEqual({ [`commit|${back.lines.rep[0].id}`]: "5" });
  });

  it("is checked field by field", () => {
    expect(readDraft("not json", start, steps)).toBeNull();
    const back = readDraft(JSON.stringify({ lines: { rep: [{ person: { who: "admin" } }], other: [{}] }, source: "elsewhere", shares: { a: "yes" }, numbers: { x: 1 } }), start, steps)!;
    expect(back.lines.rep[0].person.who).toBe("new");
    expect(back.lines.other).toBeUndefined();
    expect(back.source).toBe(start.source);
    expect(back.shares).toEqual({});
    expect(back.numbers).toEqual({});
  });

  it("is forgotten at the sign-in page, and nothing else is", () => {
    keepDraft(key, start);
    window.sessionStorage.setItem("other", "1");
    dropAllDrafts();
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(window.sessionStorage.getItem("other")).toBe("1");
  });
});

describe("addresses and days", () => {
  it("reads which Pack an address names", () => {
    expect(packRefOf("ziffr--sales-forecast")).toEqual({ included: "ziffr/sales-forecast" });
    expect(packRefOf("12")).toEqual({ install: 12 });
    for (const bad of ["0", "ziffr", "a--b--c", "../x", "A--b", "1e3"]) expect(packRefOf(bad)).toBeNull();
  });

  it("says when people are asked: by the Pack's Workflow from the next daily run, else on the period's days", () => {
    const clock = { today: "2026-11-27", hour: 12, timeZone: "Europe/Berlin", runHour: 8, todayRan: true };
    const pack = askedWhen({ metrics: [{ key: "commit", name: "c", line: null, submitters: ["me"], workflow: "pack" }] }, forecast, clock);
    expect(pack).toEqual(["After each week ends, from the daily run on 28 Nov 2026, about 08:00 (Europe/Berlin)."]);
    const period = askedWhen({ metrics: [{ key: "visits", name: "v", line: null, submitters: ["me"], workflow: "period" }] }, plain, clock);
    expect(period).toEqual(["On the 1st of each month, about 08:00 (Europe/Berlin), first on 1 Dec 2026."]);
    expect(askedWhen({ metrics: [{ key: "commit", name: "c", line: null, submitters: [], workflow: null }] }, forecast, clock)).toEqual([]);
  });
});
