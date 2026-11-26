// What of a Total a Snapshot and a View Link give (spec 0058, "The same rule everywhere"; GLOSSARY: Total), worked by
// hand: what each period rested on, who is given it, that closing takes it back, and that nothing goes out where nobody
// judged it.
import { describe, expect, it } from "vitest";
import { canvas, metric, months } from "./test/fixtures";
import { NOT_SHOWN } from "./total-rules";
import { allowedBy, gateTotals, mayReadMessage, restsFor } from "./total-views";
import type { TotalPart } from "./totals";
import { shownData } from "./view-links";
import type { Metric } from "./types";

const ana = metric({ id: 1, slug: "ana", name: "Commit, Ana" });
const team = (targets: "own" | "parts" = "own", open = false) => metric({ id: 9, slug: "team", name: "Commit", formula: "{ana} {eva}", total: { targets, open } });
const change = metric({ id: 10, slug: "change", name: "Change", formula: "change({team}) + {ana}", reads_total: true });
// Eva counts from February.
const PARTS: Record<number, TotalPart[]> = { 9: [{ part: 1, first: "2026-01-01", last: null }, { part: 2, first: "2026-02-01", last: null }] };
const numbers = (t: Metric) => canvas([t, change, ana], { team: months("2026-01", [1, 2, 3]), change: months("2026-02", [1, 1]), ana: months("2026-01", [1, 1, 1]) }, {
  targets: { 9: months("2026-01", [5, 6, 7]), 1: months("2026-01", [4]) }, pending: { 9: ["2026-01-01", "2026-03-01"], 1: ["2026-01-01"] },
});

describe("what a copy keeps of a Total", () => {
  const data = numbers(team());
  const rests = restsFor(data, data.metrics, PARTS);

  it("is which Metrics each period counted, and for a formula the period before as well", () => {
    expect(rests[9]["2026-01-01"]).toEqual([{ total: 9, parts: [1] }]);
    expect(rests[9]["2026-02-01"]).toEqual([{ total: 9, parts: [1, 2] }]);
    expect(rests[10]["2026-02-01"]).toEqual([{ total: 9, parts: [1, 2] }]);
    expect(Object.keys(rests)).toEqual(["9", "10"]);
    // A Metric that is not among those known has no list: nothing is counted, so nothing is given.
    expect(restsFor(data, [], PARTS)[10]["2026-02-01"]).toEqual([]);
    expect(restsFor(data, data.metrics, {})[9]["2026-01-01"]).toEqual([{ total: 9, parts: [] }]);
    // A formula with no target series and no values rests on nothing yet.
    expect(restsFor({ metrics: [change], series: {}, targets: {}, pending: {} }, data.metrics, PARTS)[10]).toEqual({});
  });
  it("gives a period to whoever sees every Metric counted in it, or to anyone while the Total is open", () => {
    const onlyAna = allowedBy(rests, new Set(), (id) => id === 1);
    expect([onlyAna(9, "2026-01-01"), onlyAna(9, "2026-02-01"), onlyAna(10, "2026-02-01")]).toEqual([true, false, false]);
    const open = allowedBy(rests, new Set([9]), () => false);
    expect([open(9, "2026-02-01"), open(10, "2026-02-01")]).toEqual([true, true]);
    // A period it kept nothing about, a Metric it kept nothing of, a period that counted nothing, and no copy at all.
    expect([open(9, "2025-01-01"), open(1, "2026-01-01")]).toEqual([false, false]);
    expect(allowedBy(restsFor(data, data.metrics, {}), new Set([9]), () => true)(9, "2026-01-01")).toBe(false);
    expect(allowedBy(undefined, new Set([9]), () => true)(9, "2026-01-01")).toBe(false);
  });
});

describe("a message that waited", () => {
  // Eva counted in January only: she has left the Total since.
  const left: Record<number, TotalPart[]> = { 9: [{ part: 1, first: "2026-01-01", last: null }, { part: 2, first: "2026-01-01", last: "2026-01-01" }] };
  const kept = (periods: string[], t = team()) => restsFor({ metrics: [t], series: { team: periods.map((period) => ({ period, value: 0 })) }, targets: {}, pending: {} }, [t, ana], left);
  const onlyAna = (id: number) => id === 1;
  const may = (t: Metric, rests: unknown) => mayReadMessage([t, ana], t, rests, onlyAna);

  it("is judged by what its periods counted, a Metric that has left since included", () => {
    expect(may(team(), kept(["2026-02-01"]))).toBe(true);
    expect(may(team(), kept(["2026-01-01"]))).toBe(false);
    // A change quotes the period before as well.
    expect(may(team(), kept(["2026-02-01", "2026-01-01"]))).toBe(false);
    expect(mayReadMessage([team()], team(), kept(["2026-01-01"]), () => true)).toBe(true);
    expect(may(team("own", true), kept(["2026-01-01"]))).toBe(true);
  });
  it("is not sent where it kept nothing of what it quotes, and any other Metric's always is", () => {
    expect([may(team(), undefined), may(team(), null), may(team(), {}), may(team(), { 9: {} })]).toEqual([false, false, false, false]);
    expect(may(ana, null)).toBe(true);
  });
  it("is still judged by what it kept where the Metric rests on no Total any more", () => {
    // A formula that read the Total when the message was written, and reads only Ana now.
    const before = metric({ id: 10, slug: "change", name: "Change", formula: "{team}", reads_total: true });
    const rests = restsFor({ metrics: [before], series: { change: [{ period: "2026-01-01", value: 0 }] }, targets: {}, pending: {} }, [team(), before, ana], left);
    const now = metric({ id: 10, slug: "change", name: "Change", formula: "{ana}" });
    expect(mayReadMessage([team(), now, ana], now, rests, onlyAna)).toBe(false);
    expect(mayReadMessage([team(), now, ana], now, rests, () => true)).toBe(true);
    expect(mayReadMessage([team("own", true), now, ana], now, rests, onlyAna)).toBe(true);
    expect(mayReadMessage([now], now, { 10: {} }, () => true)).toBe(false);
  });
});

describe("what goes out of a canvas", () => {
  it("is nothing that rests on a Total where nobody judged it, but its own target", () => {
    const out = gateTotals(numbers(team()));
    expect([out.series.team, out.series.change, out.series.ana.length]).toEqual([[], [], 3]);
    expect(out.targets[9]).toHaveLength(3);
    expect(out.pending).toEqual({ 9: [], 1: ["2026-01-01"] });
    expect(out.metrics[0].total!.note).toBe(NOT_SHOWN);
    expect(gateTotals(numbers(team("parts"))).targets[9]).toEqual([]);
  });
  it("is the periods given, with their added-up targets and marks, and no word where some are", () => {
    const data = numbers(team("parts"));
    const out = gateTotals(data, allowedBy(restsFor(data, data.metrics, PARTS), new Set(), (id) => id === 1));
    expect(out.series.team.map((p) => p.period)).toEqual(["2026-01-01"]);
    expect(out.targets[9].map((p) => p.period)).toEqual(["2026-01-01"]);
    expect(out.pending[9]).toEqual(["2026-01-01"]);
    expect(out.metrics[0].total!.note).toBeUndefined();
  });
  it("adds nothing for a Total the canvas holds no numbers of", () => {
    const out = gateTotals({ metrics: [team()], series: {}, targets: {}, pending: {} });
    expect([out.series, out.targets, out.pending]).toEqual([{}, {}, {}]);
    expect(out.metrics[0].total!.note).toBe(NOT_SHOWN);
  });
  it("leaves a canvas without a Total as it is", () => {
    const plain = canvas([ana], { ana: months("2026-01", [1]) });
    expect(gateTotals(plain)).toBe(plain);
  });
  it("is cut the same way for a View Link, which names no Metric it does not show and carries nothing of what it rested on", () => {
    const data = { ...numbers(team()), rests: restsFor(numbers(team()), numbers(team()).metrics, PARTS) };
    const sent = shownData(data, new Set([9]), null);
    expect(sent.series).toEqual({ team: [] });
    expect(JSON.stringify(sent)).not.toMatch(/rests|\{eva\}|\{ana\}/);
    expect(shownData(data, new Set([9]), null, () => true).series.team).toHaveLength(3);
  });
});
