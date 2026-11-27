// How the made-up numbers of Ziffr's own Packs belong together (spec 0063; GLOSSARY: Pack, Practice Workspace): the
// sales forecast stays possible (closed, commit, best case and pipeline in their order, closed starting again each
// quarter, a quota steady for a quarter, people above and below it), figures nobody is asked for reach the last ended
// period and leave room for those that are sent, a part is never more than its whole, and the tables name only entries
// their Pack has. Read from the Pack files themselves.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MADE_UP_LEVELS, MADE_UP_SHARES, madeUpLevel, madeUpOf, madeUpRelatives, madeUpTargetsOf, madeUpUntil, type MadeUpMember, type MadeUpSet } from "./practice-relations";
import { madeUpPeriods } from "./practice-numbers";
import { JANUARY, periodStart } from "./periods";
import { repoFile } from "./test/repo-file";
import type { YearStart } from "./types";

type Entry = { key: string; per?: string; total?: unknown; metric: { name: string; period: MadeUpMember["metric"]["period"]; polarity: MadeUpMember["metric"]["polarity"]; unit?: string; valueFormat?: string; decimals?: number; targetMin?: number; targetMax?: number; formula?: string } };
type PackFile = { id: string; contents: { metrics?: Entry[] } };
const PACKS: PackFile[] = readdirSync(repoFile("packs")).filter((f) => f.endsWith(".pack.json")).map((f) => JSON.parse(readFileSync(repoFile(`packs/${f}`), "utf8")));
const TODAY = "2026-11-27";

/** The Metrics a Set up of the Pack would make, those of a Repeat once for each line. */
function setOf(pack: PackFile, lines: string[] = ["Anna"], yearStart: YearStart = JANUARY): MadeUpSet {
  const member = (e: Entry, line: string | null): MadeUpMember => {
    const m = e.metric;
    const name = line ? `${m.name}, ${line}` : m.name;
    return { key: e.key, line, computed: Boolean(m.formula || e.total), values: new Map(), targets: new Map(), metric: { seed: name, period: m.period, polarity: m.polarity, unit: m.unit ?? "", format: m.valueFormat ?? "number", decimals: m.decimals ?? 0, targetMin: m.targetMin ?? null, targetMax: m.targetMax ?? null, level: madeUpLevel(pack.id, e.key) } };
  };
  const entries = pack.contents.metrics ?? [];
  return { pack: pack.id, yearStart, members: [...lines.flatMap((l) => entries.filter((e) => e.per).map((e) => member(e, l))), ...entries.filter((e) => !e.per).map((e) => member(e, null))] };
}

/** Fills a set as the Practice Workspace does: one Metric after another, each reading what the earlier ones were given. */
function fill(set: MadeUpSet, order: (members: MadeUpMember[]) => MadeUpMember[] = (m) => m, today = TODAY, valuesOf = (now: MadeUpSet, m: MadeUpMember) => madeUpOf(now, m, madeUpPeriods(m.metric.period, today, set.yearStart))): MadeUpSet {
  let members = [...set.members];
  for (const wanted of order([...set.members])) {
    const at = members.findIndex((m) => m.metric.seed === wanted.metric.seed);
    const m = members[at]!;
    const now = { ...set, members };
    const values = new Map([...m.values, ...valuesOf(now, m)]);
    const targets = madeUpTargetsOf(now, m, madeUpPeriods(m.metric.period, today, set.yearStart, true), values);
    members = members.map((x, i) => (i === at ? { ...m, values, targets: new Map([...m.targets, ...targets]) } : x));
  }
  return { ...set, members };
}

const forecast = PACKS.find((p) => p.id === "ziffr/sales-forecast")!;
const PEOPLE = ["Anna", "Ben", "Lena", "Mia", "Tom"];
const of = (set: MadeUpSet, key: string, line: string) => set.members.find((m) => m.key === key && m.line === line)!;

/** Every week of every salesperson, with its four numbers and its quota. */
function weeks(set: MadeUpSet, people: string[]) {
  return people.flatMap((person) => {
    const [commit, best, closed, pipeline] = ["commit", "best-case", "closed-quarter", "pipeline"].map((k) => of(set, k, person));
    return [...commit!.values.keys()].sort().map((week) => ({
      person, week, quarter: periodStart(week, "quarter", set.yearStart), quota: commit!.targets.get(week)!,
      commit: commit!.values.get(week)!, best: best!.values.get(week)!, closed: closed!.values.get(week)!, pipeline: pipeline!.values.get(week)!,
    }));
  });
}

/** Holds each week to what the Pack's definitions say. */
function expectPossible(all: ReturnType<typeof weeks>) {
  for (const w of all) {
    const at = `${w.person} ${w.week}`;
    expect([at, w.closed >= 0 && w.closed <= w.commit, w.commit <= w.best, w.pipeline >= w.best - w.closed]).toEqual([at, true, true, true]);
  }
  for (const [i, w] of all.entries()) {
    const before = all[i - 1];
    if (!before || before.person !== w.person || before.quarter !== w.quarter) continue;
    expect([w.person, w.week, w.closed >= before.closed]).toEqual([w.person, w.week, true]);
  }
}

describe("a made-up sales forecast", () => {
  const set = fill(setOf(forecast, PEOPLE));
  const all = weeks(set, PEOPLE);

  it.each([1, 2, 4, 10] as YearStart[])("keeps closed, commit, best case and pipeline in their order, for a year starting in month %s", (yearStart) => {
    const made = weeks(fill(setOf(forecast, PEOPLE, yearStart)), PEOPLE);
    expect(made.length).toBeGreaterThan(5 * 55);
    expectPossible(made);
  });

  it("starts closed again with every quarter", () => {
    const firsts = all.filter((w, i) => all[i - 1]?.person === w.person && all[i - 1]!.quarter !== w.quarter);
    expect(firsts.length).toBeGreaterThan(15);
    for (const w of firsts) expect(w.closed).toBeLessThan(w.quota * 0.2);
  });

  it("holds a quota steady for a quarter, to the end of this year", () => {
    for (const person of PEOPLE) {
      const targets = [...of(set, "commit", person).targets];
      expect(targets.at(-1)![0]).toBe("2026-12-28");
      const quarters = new Map<string, Set<number>>();
      for (const [week, quota] of targets) {
        const q = periodStart(week, "quarter", JANUARY);
        quarters.set(q, (quarters.get(q) ?? new Set()).add(quota));
      }
      for (const [q, quotas] of quarters) expect([person, q, quotas.size]).toEqual([person, q, 1]);
      for (const key of ["best-case", "closed-quarter", "pipeline"]) expect(of(set, key, person).targets.size).toBe(0);
    }
  });

  it("has people above their quota and people below it in every week", () => {
    for (const week of new Set(all.map((w) => w.week))) {
      const these = all.filter((w) => w.week === week);
      expect([week, these.some((w) => w.commit >= w.quota), these.some((w) => w.commit < w.quota)]).toEqual([week, true, true]);
    }
  });

  it("covers the team's quota in some weeks and not in others, with a pipeline coverage a team could have", () => {
    const team = [...new Set(all.map((w) => w.week))].map((week) => {
      const these = all.filter((w) => w.week === week);
      const sum = (k: "quota" | "commit" | "closed" | "pipeline") => these.reduce((n, w) => n + w[k], 0);
      return { week, share: sum("commit") / sum("quota"), coverage: sum("pipeline") / (sum("quota") - sum("closed")) };
    });
    expect(team.some((w) => w.share >= 1)).toBe(true);
    expect(team.some((w) => w.share < 1)).toBe(true);
    for (const w of team) {
      expect([w.week, w.share > 0.85 && w.share < 1.15, w.coverage > 0.8 && w.coverage < 15]).toEqual([w.week, true, true]);
    }
  });

  it("ends before the week a request asks for", () => {
    expect(all.map((w) => w.week).sort().at(-1)).toBe("2026-11-09");
  });

  it("is the same whatever order its Metrics are filled in", () => {
    const other = fill(setOf(forecast, PEOPLE), (m) => m.reverse());
    expect(weeks(other, PEOPLE)).toEqual(all);
  });

  it("takes the quotas that are there and gives the quarter's other weeks the same", () => {
    const start = setOf(forecast, ["Anna", "Ben"]);
    const typed = new Map([["2026-11-16", 120_000], ["2026-11-23", 120_000]]);
    const filled = fill({ ...start, members: start.members.map((m) => (m.key === "commit" && m.line === "Anna" ? { ...m, targets: typed } : m)) });
    const anna = of(filled, "commit", "Anna");
    expect(anna.targets.get("2026-10-05")).toBe(120_000);
    expect(anna.targets.get("2026-11-16")).toBe(120_000);
    // Earlier quarters lead up to it.
    expect(anna.targets.get("2026-07-06")).toBeLessThan(120_000);
    expect(anna.targets.get("2026-07-06")).toBeGreaterThan(110_000);
    expectPossible(weeks(filled, ["Anna", "Ben"]));
    expect(anna.values.get("2026-11-09")! / 120_000).toBeGreaterThan(0.95);
  });

  it("stays in its order around values that are there already", () => {
    const start = fill(setOf(forecast, ["Anna", "Ben"]));
    // Someone sent two weeks themselves: lower than what would be made up for the first, higher for the second.
    const typed: Record<string, [string, number][]> = { "closed-quarter": [["2026-10-19", 9_000]], commit: [["2026-11-02", 400_000]] };
    const again = setOf(forecast, ["Anna", "Ben"]);
    const filled = fill({ ...again, members: again.members.map((m) => (m.line === "Anna" && typed[m.key!] ? { ...m, values: new Map(typed[m.key!]), targets: of(start, m.key!, "Anna").targets } : m)) });
    expect(of(filled, "closed-quarter", "Anna").values.get("2026-10-19")).toBe(9_000);
    expect(of(filled, "commit", "Anna").values.get("2026-11-02")).toBe(400_000);
    expectPossible(weeks(filled, ["Anna", "Ben"]));
  });
});

/** Salespeople send their calls themselves; a system would send the other two. */
const ASKED = ["commit", "best-case"];
const asSetUp = (set: MadeUpSet, today: string, order?: (members: MadeUpMember[]) => MadeUpMember[]) => fill(set, order, today, (now, m) => madeUpUntil(now, m, today, ASKED.includes(m.key!)));

describe("a made-up sales forecast whose Closed and Pipeline nobody is asked for", () => {
  // Early, mid and late in a quarter, and right after it turns: the week that ended last, with the one before it.
  const DAYS = [[TODAY, "2026-11-16", "2026-11-09"], ["2026-12-30", "2026-12-21", "2026-12-14"], ["2027-01-06", "2026-12-28", "2026-12-21"], ["2027-01-13", "2027-01-04", "2026-12-28"], ["2026-10-14", "2026-10-05", "2026-09-28"]] as const;

  it.each(DAYS)("on %s: they reach the week of %s, the calls stop at the week of %s, and the running week stays empty", (today, ended, before) => {
    const set = asSetUp(setOf(forecast, PEOPLE), today);
    for (const m of set.members.filter((x) => x.line !== null)) {
      expect([m.key, m.line, [...m.values.keys()].sort().at(-1)]).toEqual([m.key, m.line, ASKED.includes(m.key!) ? before : ended]);
    }
  });

  it.each(DAYS)("on %s: the week of %s leaves room for the calls still to be sent after that of %s", (today, ended, before) => {
    const set = asSetUp(setOf(forecast, PEOPLE), today);
    const sameQuarter = periodStart(ended, "quarter", JANUARY) === periodStart(before, "quarter", JANUARY);
    for (const person of PEOPLE) {
      const closed = of(set, "closed-quarter", person).values;
      const pipeline = of(set, "pipeline", person).values.get(ended)!;
      const quota = of(set, "commit", person).targets.get(ended)!;
      const now = closed.get(ended)!;
      const earlier = sameQuarter ? closed.get(before)! : 0;
      // Closed has not run past a likely Commit, and never falls within its quarter.
      expect([person, now >= earlier, now <= Math.max(earlier, quota * 0.7) + 50]).toEqual([person, true, true]);
      // A Best case a quarter above quota still has its open deals in the Pipeline.
      expect([person, pipeline >= quota * 1.25 - now - 50]).toEqual([person, true]);
    }
  });

  it("keeps the weeks both sent and not in their order, whatever order the Metrics are filled in", () => {
    const set = asSetUp(setOf(forecast, PEOPLE), TODAY);
    const other = asSetUp(setOf(forecast, PEOPLE), TODAY, (m) => m.reverse());
    for (const m of set.members.filter((x) => x.line !== null)) expect([...of(other, m.key!, String(m.line)).values]).toEqual([...m.values]);
    for (const person of PEOPLE) {
      const [commit, best, closed, pipeline] = ["commit", "best-case", "closed-quarter", "pipeline"].map((k) => of(set, k, person).values);
      for (const [week, call] of commit!) expect([week, closed!.get(week)! <= call, call <= best!.get(week)!, pipeline!.get(week)! >= best!.get(week)! - closed!.get(week)!]).toEqual([week, true, true, true]);
    }
  });

  it("fits a call that was sent for the last ended week before the fill", () => {
    const start = setOf(forecast, ["Anna", "Ben"]);
    const sent = new Map([["2026-11-16", 20_000]]);
    const set = asSetUp({ ...start, members: start.members.map((m) => (m.line === "Anna" && ASKED.includes(m.key!) ? { ...m, values: sent } : m)) }, TODAY);
    const closed = of(set, "closed-quarter", "Anna").values.get("2026-11-16")!;
    expect(closed).toBeLessThanOrEqual(20_000);
    expect(of(set, "pipeline", "Anna").values.get("2026-11-16")!).toBeGreaterThanOrEqual(20_000 - closed);
  });
});

describe("a made-up part and its whole", () => {
  it.each(["open-invoices", "overdue-invoices"])("stay in their share when only %s is asked for", (asked) => {
    const finance = PACKS.find((p) => p.id === "ziffr/finance")!;
    const set = fill(setOf(finance), (m) => m, TODAY, (now, m) => madeUpUntil(now, m, TODAY, m.key === asked));
    const value = (key: string) => set.members.find((m) => m.key === key)!.values;
    let compared = 0;
    for (const [period, overdue] of value("overdue-invoices")) {
      const open = value("open-invoices").get(period);
      if (open === undefined) continue;
      compared++;
      expect([period, overdue <= open * 0.3]).toEqual([period, true]);
    }
    expect(compared).toBeGreaterThan(10);
  });
});

describe("the other Packs of Ziffr", () => {
  it("name only entries that their Pack has and that take values", () => {
    for (const table of [MADE_UP_SHARES, MADE_UP_LEVELS]) {
      for (const [id, entries] of table) {
        const pack = PACKS.find((p) => p.id === id);
        const keys = new Set((pack?.contents.metrics ?? []).filter((e) => !e.metric.formula && !e.total).map((e) => e.key));
        for (const key of Object.keys(entries)) {
          expect([id, key, keys.has(key)]).toEqual([id, key, true]);
          for (const other of madeUpRelatives(id, key)) expect([id, other, keys.has(other)]).toEqual([id, other, true]);
        }
      }
    }
  });

  it.each(PACKS.filter((p) => MADE_UP_SHARES.has(p.id)).map((p) => [p.id, p] as const))("keep every part of %s within its share of the whole", (id, pack) => {
    const set = fill(setOf(pack), (m) => m.reverse());
    for (const [key, [wholeKey, low, high]] of Object.entries(MADE_UP_SHARES.get(id)!)) {
      const part = set.members.find((m) => m.key === key)!;
      const whole = set.members.find((m) => m.key === wholeKey)!;
      let compared = 0;
      for (const [period, value] of part.values) {
        const total = whole.values.get(periodStart(period, whole.metric.period, JANUARY));
        if (total === undefined) continue;
        compared++;
        expect([key, period, value <= total * high, value >= Math.floor(total * low) - 1]).toEqual([key, period, true, true]);
      }
      expect(compared).toBeGreaterThan(10);
    }
  });

  it("never let the Sources of the values come to more than all values, nor the kinds of Workspace to more than all", () => {
    for (const [id, wholeKey, prefix] of [["ziffr/workspace-usage", "workspace-values", "workspace-values-"], ["ziffr/ziffr-operations", "workspaces", "workspaces-"]] as const) {
      const set = fill(setOf(PACKS.find((p) => p.id === id)!));
      const parts = set.members.filter((m) => m.key!.startsWith(prefix) && !["workspaces-active-7d", "workspaces-created", "workspaces-deleted"].includes(m.key!));
      expect(parts.length).toBeGreaterThanOrEqual(3);
      for (const [period, total] of set.members.find((m) => m.key === wholeKey)!.values) {
        expect([id, period, parts.reduce((n, m) => n + m.values.get(period)!, 0) <= total]).toEqual([id, period, true]);
      }
    }
  });

  it("make rates that can be: an hourly rate, the cost of a customer, an engagement score and an average order", () => {
    const latest = (id: string, key: string) => [...fill(setOf(PACKS.find((p) => p.id === id)!)).members.find((m) => m.key === key)!.values].at(-1)![1];
    for (const [id, key, low, high] of [["ziffr/agency", "hourly-rate", 50, 200], ["ziffr/saas-metrics", "cac", 200, 2500], ["ziffr/people", "engagement", 40, 100]] as const) {
      expect([key, latest(id, key) > low && latest(id, key) < high]).toEqual([key, true]);
    }
    const shop = fill(setOf(PACKS.find((p) => p.id === "ziffr/online-shop")!));
    const value = (key: string) => shop.members.find((m) => m.key === key)!.values;
    for (const [week, revenue] of value("revenue")) {
      const order = revenue / value("orders").get(week)!;
      expect([week, order >= 55 && order < 130]).toEqual([week, true]);
    }
  });

  it("set targets that some Metrics are ahead of and others behind", () => {
    const set = fill(setOf(PACKS.find((p) => p.id === "ziffr/sales")!));
    const ahead = set.members.filter((m) => m.targets.size).map((m) => {
      const both = [...m.values].filter(([p]) => m.targets.has(p));
      return both.reduce((n, [p, v]) => n + v / m.targets.get(p)!, 0) / both.length >= 1;
    });
    expect(ahead).toContain(true);
    expect(ahead).toContain(false);
  });
});
