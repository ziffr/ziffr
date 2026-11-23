// The pareto mark's numbers (GLOSSARY: Breakdown): sorting, grouping past ten, the running share and where 80 % is reached.
import { describe, expect, it } from "vitest";
import { paretoModel } from "./pareto";

const write = (v: number) => String(v);
const rows = (...values: number[]) => values.map((value, i) => ({ label: `R${i + 1}`, value }));
const model = (...values: number[]) => {
  const r = paretoModel({ name: "Tickets", rows: rows(...values), write });
  if (!r.ok) throw new Error(r.reason);
  return r;
};

describe("paretoModel", () => {
  it("sorts largest first and gives the running share of the total", () => {
    const m = model(10, 50, 40);
    expect(m.bars.map((b) => b.label)).toEqual(["R2", "R3", "R1"]);
    expect(m.bars.map((b) => b.cumulative)).toEqual([0.5, 0.9, 1]);
    expect(m.bars.map((b) => b.share)).toEqual([0.5, 0.4, 0.1]);
  });

  it("says how many rows make up 80 %, counting a row that reaches it exactly", () => {
    expect(model(50, 30, 20).needed).toBe(2);
    expect(model(50, 30, 20).caption).toBe("2 of 3 rows make up 80 %.");
    expect(model(90, 5, 5).caption).toBe("1 of 3 rows makes up 80 %.");
    expect(model(1, 1, 1, 1, 1).needed).toBe(4);
  });

  it("reaches 80 % at the bar where the running share first gets there", () => {
    expect(model(50, 30, 20).reaches).toBe(1);
    expect(model(90, 5, 5).reaches).toBe(0);
  });

  it("leaves out rows of 0 and refuses a Breakdown with a negative row", () => {
    expect(model(5, 0, 5).bars).toHaveLength(2);
    expect(paretoModel({ name: "x", rows: rows(5, -1), write })).toEqual({ ok: false, reason: "Pareto needs positive rows." });
    expect(paretoModel({ name: "x", rows: rows(0, 0), write }).ok).toBe(false);
    expect(paretoModel({ name: "x", rows: [], write }).ok).toBe(false);
  });

  it("groups rows past ten into one Other bar at the end, which makes the line reach 100 %", () => {
    const m = model(...Array.from({ length: 12 }, (_, i) => 12 - i));
    expect(m.bars).toHaveLength(11);
    expect(m.bars.slice(0, 10).map((b) => b.value)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect(m.bars[10]).toMatchObject({ label: "Other", value: 3, other: true, cumulative: 1 });
    expect(m.bars.slice(0, 10).every((b) => !b.other)).toBe(true);
    expect(m.rows).toBe(12);
  });

  it("keeps Other at the end even when it is larger than the rows before it, and counts the 80 % over all rows", () => {
    // Ten rows of 2 and ten of 1: Other (10) is larger than the last row drawn (2).
    const m = model(...Array(10).fill(2), ...Array(10).fill(1));
    expect(m.bars[10].other).toBe(true);
    expect(m.bars[10].value).toBeGreaterThan(m.bars[9].value);
    // 80 % of 30 is 24: ten rows of 2 make 20, four more of 1 make 24: 14 rows. The line reaches it inside Other.
    expect(m.needed).toBe(14);
    expect(m.reaches).toBe(10);
    expect(m.caption).toBe("14 of 20 rows make up 80 %.");
  });

  it("draws exactly ten rows without an Other bar", () => {
    const m = model(...Array(10).fill(1));
    expect(m.bars).toHaveLength(10);
    expect(m.bars.some((b) => b.other)).toBe(false);
    expect(m.bars[9].cumulative).toBe(1);
  });

  it("puts every bar, its running share and the caption in the text alternative", () => {
    const m = model(60, 30, 10);
    expect(m.alt).toContain("Pareto of Tickets");
    expect(m.alt).toContain("R1 60, 60 % so far");
    expect(m.alt).toContain("R3 10, 100 % so far");
    expect(m.alt).toContain("2 of 3 rows make up 80 %.");
  });

  it("writes a single row as all of it", () => {
    const m = model(7);
    expect(m.bars[0].cumulative).toBe(1);
    expect(m.caption).toBe("1 of 1 row makes up 80 %.");
  });
});
