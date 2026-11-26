// A gap table of a Total (spec 0058 "Team totals", #1227; GLOSSARY: Total, Slide Element): one row for each Metric it
// adds up that the viewer sees, and what a View Link and a Snapshot get of its list.
import { describe, expect, it } from "vitest";
import { gapModel, OTHERS_NOT_SHOWN, type SlideContext } from "./slide-figures";
import { seenList } from "./total-lists";
import { shownData } from "./view-links";
import { checkDeckTemplateFileValue } from "./deck-template-file";
import { deckFile } from "./pack-export";
import type { CanvasData, Metric } from "./types";

const metric = (id: number, name: string, extra: Partial<Metric> = {}): Metric => ({
  id, slug: `m${id}`, name, owner_id: "o", formula: null, from_catalog_id: null, created_at: "2026-01-01", aggregation: "last", description: "",
  unit: "€", unit_position: "after", format: "currency", decimals: 0, period: "week", submission_rule: "overwrite", polarity: "higher", target_min: null, target_max: null, sources: [], attainment_method: null, ...extra,
});
const WEEK = "2026-11-23";
const BEFORE = "2026-11-16";

const total = metric(1, "Team commit", { total: { targets: "own", open: false } });
const anna = metric(2, "Commit, Anna", { target_min: 640_000 });
const ben = metric(3, "Commit, Ben", { target_min: 600_000, target_max: 700_000 });
const cara = metric(4, "Commit, Cara", { target_min: 500_000 });
const dan = metric(5, "Commit, Dan", { target_min: 100_000 });
const people = [anna, ben, cara, dan];
const counts = (m: Metric, first = BEFORE, last: string | null = null) => ({ part: m.id, first, last });

const canvas = (shown: Metric[], extra: Partial<CanvasData> = {}): CanvasData => ({
  viewer: "o", metrics: shown, numberStyle: "1,234.5", yearStart: 1, projections: {}, condensed: {}, pending: {}, locked: {}, breakdowns: {}, themes: [], people: [],
  targets: { [cara.id]: [{ period: WEEK, value: 550_000 }] },
  series: Object.fromEntries(shown.map((m) => [m.slug, m === anna ? [{ period: BEFORE, value: 1 }, { period: WEEK, value: 700_000 }] : m === ben ? [{ period: WEEK, value: 630_000 }] : m === cara ? [{ period: BEFORE, value: 2 }] : []])),
  totalLists: { [total.id]: { parts: people.filter((p) => shown.includes(p)).map((p) => counts(p)), others: [], hidden: false } },
  ...extra,
} as unknown as CanvasData);

const model = (data: CanvasData, of: Metric | null = total, extra: object = {}) => {
  const ctx: SlideContext = { data, metrics: [of] };
  return gapModel({ kind: "gap-table", total: true, ...extra }, ctx);
};
const rows = (g: ReturnType<typeof model>) => (g.denied ? [] : g.rows.map((r) => [r.label, r.goal, r.actual, r.gapText]));

describe("a gap table of a Total", () => {
  it("shows a row for each Metric counting in the latest period with a value, by gap, with that period's target", () => {
    const g = model(canvas([total, ...people]), total, { rowLabel: "Salesperson" });
    expect(g.denied).toBe(false);
    if (g.denied) return;
    expect(g.head).toEqual({ row: "Salesperson", goal: "Target", actual: "Commit", gap: "Commit minus target, k€" });
    // Ben's target is a range, so he has no gap; Cara and Dan sent nothing this week.
    expect(rows(g)).toEqual([["Anna", "640 k€", "700 k€", "+60"], ["Ben", "–", "630 k€", "–"], ["Cara", "550 k€", "–", "–"], ["Dan", "100 k€", "–", "–"]]);
    expect(g.note).toBeNull();
    expect(g.more).toBe(0);
  });

  it("leaves out a Metric that does not count in that period", () => {
    const data = canvas([total, ...people]);
    data.totalLists![total.id].parts = [counts(anna), counts(ben), counts(cara, BEFORE, BEFORE), counts(dan, "2026-11-30")];
    expect(rows(model(data)).map((r) => r[0])).toEqual(["Anna", "Ben"]);
  });

  it("shows only the rows the viewer sees, says that others are not shown, and adds nothing up", () => {
    const data = canvas([total, anna], { totalLists: { [total.id]: { parts: [counts(anna)], others: [WEEK], hidden: true } } });
    const g = model(data);
    expect(rows(g)).toEqual([["Anna", "640 k€", "700 k€", "+60"]]);
    expect(g.denied ? null : g.note).toBe(OTHERS_NOT_SHOWN);
    expect(JSON.stringify(g)).not.toMatch(/Ben|Cara|Dan|630/);
  });

  it("keeps whole names where they share no beginning", () => {
    const other = { ...ben, name: "Pipeline Ben" };
    const g = model(canvas([total, anna, other], { totalLists: { [total.id]: { parts: [counts(anna), counts(other)], others: [], hidden: false } } }));
    expect(rows(g).map((r) => r[0])).toEqual(["Commit, Anna", "Pipeline Ben"]);
    expect(g.denied ? null : g.head.actual).toBe("Team commit");
  });

  it("says that others are not shown also where no row is", () => {
    const g = model(canvas([total], { totalLists: { [total.id]: { parts: [], others: [], hidden: true } } }));
    expect(g).toMatchObject({ rows: [], empty: null, note: OTHERS_NOT_SHOWN });
    // One they see that has no value yet still says so.
    const anyway = model(canvas([total, dan], { totalLists: { [total.id]: { parts: [counts(dan)], others: [], hidden: true } } }));
    expect(anyway).toMatchObject({ rows: [], empty: "No value to show yet.", note: OTHERS_NOT_SHOWN });
  });

  it("is refused to someone who may not see the Total, and asks for a Total where the Metric is none", () => {
    expect(model(canvas([anna]), null)).toEqual({ denied: true });
    expect(model(canvas([anna]), anna)).toMatchObject({ rows: [], empty: "Commit, Anna is not a Total. Pick a Total for this table." });
  });

  it("holds at most 30 rows and names the rest", () => {
    const many = Array.from({ length: 34 }, (_, i) => metric(100 + i, `Commit, ${i}`));
    const data = canvas([total, ...many], { series: Object.fromEntries(many.map((m) => [m.slug, [{ period: WEEK, value: m.id }]])), totalLists: { [total.id]: { parts: many.map((m) => counts(m)), others: [], hidden: false } } });
    const g = model(data);
    expect(g.denied ? null : [g.rows.length, g.more]).toEqual([30, 4]);
  });
});

describe("a Total's list as a reader gets it", () => {
  const list = { parts: [counts(anna), counts(ben, WEEK), counts(cara, BEFORE, BEFORE)] };
  const periods = () => [BEFORE, WEEK];

  it("holds only the Metrics they see, and the periods in which it counts one they do not", () => {
    expect(seenList(list, (id) => id === anna.id, periods)).toEqual({ parts: [counts(anna)], others: [BEFORE, WEEK], hidden: true });
    expect(seenList(list, (id) => id !== ben.id, periods)).toEqual({ parts: [counts(anna), counts(cara, BEFORE, BEFORE)], others: [WEEK], hidden: true });
    expect(seenList(list, () => true, periods)).toEqual({ parts: list.parts, others: [], hidden: false });
  });

  it("is never widened by being cut again", () => {
    const once = seenList(list, (id) => id === anna.id, periods);
    expect(seenList(once, () => true, periods)).toEqual(once);
  });

  it("goes out with no Snapshot or other view that does not ask for it", () => {
    const data = canvas([total, ...people]);
    expect(shownData(data, new Set([total.id, anna.id]), null)).not.toHaveProperty("totalLists");
  });
});

describe("a gap table of a Total in a Deck Template file", () => {
  const shape = (element: object, slots: number[]) => ({ shape: "element" as const, x: 64, y: 85, w: 1152, h: 540, slots, element: element as never });
  const file = (element: object, slots = [0]) => deckFile({ name: "Forecast", slots: [{ label: "Team commit" }, { label: "Quota" }], slides: [{ shapes: [shape(element, slots)] }] });

  it("is written as ziffr.deck-template/3, which takes it with one Slot", () => {
    const doc = file({ kind: "gap-table", total: true });
    expect(doc.format).toBe("ziffr.deck-template/3");
    expect(checkDeckTemplateFileValue(doc).ok).toBe(true);
    expect(checkDeckTemplateFileValue(file({ kind: "gap-table", total: true }, [0, 1])).ok).toBe(false);
  });

  it("is refused in an older format, in words, and leaves a table of two Metrics in /2", () => {
    const old = checkDeckTemplateFileValue({ ...file({ kind: "gap-table", total: true }), format: "ziffr.deck-template/2" });
    expect(old.ok).toBe(false);
    expect(file({ kind: "gap-table" }, [0, 1]).format).toBe("ziffr.deck-template/2");
  });
});
