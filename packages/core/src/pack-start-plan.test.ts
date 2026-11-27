import { describe, expect, it } from "vitest";
import { planStart, targetPeriods, type StartContext } from "./pack-start-plan";
import type { StartChoices, StartDeclarations, StartPerson, StartRoom } from "./pack-start-steps";
import { JANUARY } from "./periods";

const ROOM: StartRoom = { metrics: null, trial: null, practice: false };
const TRIAL: StartRoom = { metrics: 25, trial: { metricCap: 25, places: 4, others: 1 }, practice: false };

// A small team Pack: a line for each seller, a lead who approves and sees a dashboard, a Total and an asked number.
const TEAM: StartDeclarations = {
  name: "Team",
  metrics: [
    { key: "commit", name: "Commit", period: "week", takesValues: true, per: "rep", submitters: ["seller"], standIn: "lead", viewers: ["lead"], ask: { question: "Quota?", name: "Quota", every: "quarter" } },
    { key: "team", name: "Team commit", period: "week", takesValues: false, total: { of: "commit", targets: "parts" }, viewers: ["lead"] },
  ],
  positions: [{ key: "lead", name: "Lead" }, { key: "seller", name: "Seller", per: "rep" }],
  repeats: [{ key: "rep", name: "Seller", max: 10 }],
  dashboards: [{ key: "board", name: "Board", viewers: ["lead"], slots: [{ suggests: "team", multiple: false }] }],
  workflows: [{ key: "weekly", name: "Weekly", approvers: 1, approveBy: ["lead"] }],
};

const CONTEXT: StartContext = {
  me: { id: "me", name: "Olive Owner" },
  people: [
    { id: "me", name: "Olive Owner", kind: "member" },
    { id: "mia", name: "Mia Member", kind: "member" },
    { id: "gus", name: "Gus Guest", kind: "guest" },
    { id: "cora", name: "Cora Contact", kind: "contact" },
  ],
  byEmail: new Map([["olive@example.com", "me"], ["mia@example.com", "mia"], ["cora@example.com", "cora"]]),
};

const someone = (name: string, email: string): StartPerson => ({ who: "new", name, email });
const answers = (lead: StartPerson, ...sellers: StartPerson[]): StartChoices => ({ who: [{ position: "lead", person: lead }], lines: sellers.map((person) => ({ repeat: "rep", person })) });
const plan = (choices: StartChoices, room = ROOM, d = TEAM) => planStart(d, room, choices, CONTEXT);

describe("who holds what", () => {
  it("adds a new seller as a Contact who submits, and offers no invitation outside a trial", () => {
    const p = plan(answers({ who: "me" }, someone("Sam Seller", "Sam@Example.com ")));
    expect(p.problems).toEqual([]);
    expect(p.contacts).toEqual(["new:sam@example.com"]);
    expect(p.lines).toEqual([{ repeat: "rep", name: "Sam Seller", fills: [{ position: "seller", people: ["new:sam@example.com"] }] }]);
    expect(p.invite).toEqual([]);
    expect(p.asked).toEqual([{ person: "new:sam@example.com", metrics: ["Commit, Sam Seller"] }]);
    expect(p.metrics.map((m) => m.workflow)).toEqual([null, "pack"]);
  });

  it("offers a seller of a trial an invitation as Guest", () => {
    const p = plan(answers({ who: "me" }, someone("Sam Seller", "sam@example.com")), TRIAL);
    expect(p.invite).toEqual([{ person: "new:sam@example.com", role: "guest" }]);
  });

  it("keeps the person setting up in a Position that takes a role until someone new has joined", () => {
    const p = plan(answers(someone("Lea Lead", "lea@example.com"), { who: "me" }));
    expect(p.fills).toEqual([{ position: "lead", people: ["me"] }]);
    expect(p.contacts).toEqual(["new:lea@example.com"]);
    expect(p.invite).toEqual([{ person: "new:lea@example.com", role: "member" }]);
    expect(p.held).toEqual([expect.objectContaining({ position: "lead", for: "new:lea@example.com", line: null })]);
    expect(p.notes).toContain("You approve until Lea Lead has joined.");
    expect(p.workflows).toEqual([{ key: "weekly", name: "Weekly", line: null, approvers: ["me"] }]);
  });

  it("does the same on a second try, when the new person is a Contact by now", () => {
    const p = plan(answers(someone("Cora", "cora@example.com"), { who: "me" }));
    expect(p.problems).toEqual([]);
    expect(p.fills).toEqual([{ position: "lead", people: ["me"] }]);
    expect(p.contacts).toEqual([]);
    expect(p.invite).toEqual([{ person: "cora", role: "member" }]);
  });

  it("refuses a Contact or a Guest where the Position refuses them", () => {
    expect(plan(answers({ who: "here", id: "cora" }, { who: "me" })).problems[0]).toContain("A Contact cannot");
    expect(plan(answers({ who: "here", id: "gus" }, { who: "me" })).problems[0]).toContain("A Guest cannot stand in");
  });

  it("takes an address that is here as that person, and one's own as “I do”", () => {
    const p = plan(answers(someone("x", "mia@example.com"), someone("y", "olive@example.com")));
    expect(p.problems).toEqual([]);
    expect(p.fills).toEqual([{ position: "lead", people: ["mia"] }]);
    expect(p.lines[0]).toMatchObject({ name: "Olive Owner", fills: [{ position: "seller", people: ["me"] }] });
    expect(p.contacts).toEqual([]);
  });

  it("refuses two lines with one address, and gives two people of one name their own lines", () => {
    expect(plan(answers({ who: "me" }, someone("A", "a@example.com"), someone("B", "a@example.com"))).problems[0]).toContain("each line is another person");
    expect(plan(answers({ who: "me" }, someone("Alex", "a@example.com"), someone("Alex", "b@example.com"))).lines.map((l) => l.name)).toEqual(["Alex", "Alex 2"]);
  });

  it("takes nobody new into a Practice Workspace", () => {
    expect(plan(answers({ who: "me" }, someone("Sam", "sam@example.com")), { ...ROOM, practice: true }).problems[0]).toContain("takes no new people");
  });

  it("refuses a bad address, an unknown person, an unanswered question and more lines than there is room for", () => {
    expect(plan(answers({ who: "me" }, someone("Sam", "not an address"))).problems[0]).toContain("does not look right");
    expect(plan(answers({ who: "here", id: "stranger" }, { who: "me" })).problems[0]).toBe("Pick someone who is in this Workspace.");
    expect(plan({ lines: [{ repeat: "rep", person: { who: "me" } }] }).problems).toContain("Say who it is.");
    const six = Array.from({ length: 6 }, (_, i) => someone(`S${i}`, `s${i}@example.com`));
    expect(plan(answers({ who: "me" }, ...six), TRIAL).problems[0]).toContain("room for 5");
  });

  it("keeps a name out of a Metric's name where it is not plain text", () => {
    expect(plan(answers({ who: "me" }, someone("Sam <Sales> [x]", "sam@example.com"))).lines[0].name).toBe("Sam Sales x");
  });
});

describe("providers, Workflows, Shares and numbers", () => {
  const PLAIN: StartDeclarations = { name: "Plain", metrics: [{ key: "n", name: "Number", period: "month", takesValues: true }], workflows: [{ key: "w", name: "Close", approvers: 2 }], dashboards: [{ key: "d", name: "Board", slots: [{ suggests: "n", multiple: false }] }] };

  it("asks who provides, at most five others beside oneself, and says when nobody was said", () => {
    expect(plan({}, ROOM, PLAIN).problems).toContain("Say who provides these numbers.");
    const others = Array.from({ length: 6 }, (_, i) => someone(`P${i}`, `p${i}@example.com`));
    expect(plan({ providers: others }, ROOM, PLAIN).problems[0]).toContain("at most 5 other people");
    expect(plan({ providers: [{ who: "me" }, ...others.slice(0, 5)] }, ROOM, PLAIN).problems).toEqual([]);
  });

  it("leaves out a Workflow that needs more Approvers than the answers give, and then asks by period", () => {
    const p = plan({ providers: [{ who: "here", id: "cora" }] }, ROOM, PLAIN);
    expect(p.leftOut).toEqual([{ name: "the Workflow Close", why: "It needs 2 Approvers, and the answers give 1." }]);
    expect(p.metrics).toEqual([expect.objectContaining({ submitters: ["cora"], workflow: "period" })]);
  });

  it("asks nobody for now", () => {
    const p = plan({ providers: [] }, ROOM, PLAIN);
    expect(p.asked).toEqual([]);
    expect(p.metrics[0].workflow).toBeNull();
  });

  it("proposes Shares only between people who can be shared with, off where they show more", () => {
    const p = plan(answers({ who: "here", id: "mia" }, someone("Sam", "sam@example.com")));
    expect(p.shares.map((s) => [s.item, s.person, s.suggested])).toEqual([["Team commit", "mia", false], ["Commit, Sam", "mia", false], ["Board", "mia", false]]);
    expect(p.shares[2].id).toBe(JSON.stringify(["dashboard", "board", "", "mia", "viewer"]));
    expect(plan(answers({ who: "me" }, { who: "here", id: "mia" })).shares).toEqual([]);
  });

  it("writes an asked number to its line, and refuses one that is not asked or not a number", () => {
    const base = answers({ who: "me" }, someone("Sam", "sam@example.com"));
    expect(plan({ ...base, numbers: [{ metric: "commit", line: 0, value: 120000 }] }).targets).toEqual([{ metric: "commit", line: "Sam", value: 120000 }]);
    for (const wrong of [{ metric: "team", value: 1 }, { metric: "commit", value: 1 }, { metric: "commit", line: 3, value: 1 }, { metric: "commit", line: 0, value: Number.POSITIVE_INFINITY }]) {
      expect(plan({ ...base, numbers: [wrong] }).problems).not.toEqual([]);
    }
  });
});

describe("the periods a number asked is the target of", () => {
  it("covers every week of the quarter, and the last ended one where that is earlier", () => {
    const weeks = targetPeriods("2026-10-01", "week", "quarter", JANUARY, JANUARY);
    expect(weeks[0]).toBe("2026-09-21");
    expect(weeks.at(-1)).toBe("2026-12-28");
    expect(weeks).toHaveLength(15);
  });

  it("starts with the span's first period later in the span", () => {
    expect(targetPeriods("2026-11-27", "month", "quarter", JANUARY, JANUARY)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(targetPeriods("2026-11-27", "quarter", "quarter", JANUARY, JANUARY)).toEqual(["2026-07-01", "2026-10-01"]);
  });

  it("follows the Workspace's year", () => {
    expect(targetPeriods("2026-11-27", "quarter", "year", 4, 4)).toEqual(["2026-04-01", "2026-07-01", "2026-10-01", "2027-01-01"]);
  });
});
