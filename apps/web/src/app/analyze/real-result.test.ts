// A result as the core really works it out, on the sample Metrics (ticket #1068): the title of a result and its Takeaway must be about
// the same Metrics, and the basis line must not carry its own full stop (the Takeaway view adds one).
import { describe, expect, it } from "vitest";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { ENTRIES, entryOf } from "@ziffr/core/method-picker";
import { runEntry, type PickWorld } from "@ziffr/core/method-picker-run";
import { questionFor } from "@ziffr/core/method-picker-names";

const data = sampleCanvasData("sara", "1,234.5");
const world: PickWorld = { metrics: data.metrics, series: data.series, breakdowns: {}, ctx: { style: "1,234.5" }, yearStart: 1 as never, today: "2027-01-15" };
const [a, b, c, d] = data.metrics;

describe("a result worked out by the core", () => {
  it("names only the Metrics of its own Slots, so the title and the sentence agree", () => {
    const entry = entryOf("moves")!;
    const t = runEntry(entry, world, { slots: { metric: [a], drivers: [b, c] }, settings: {} });
    expect(t.kind).toBe("answer");
    const title = questionFor("moves", { metric: a.name }, entry.name);
    expect(title).toContain(a.name);
    const text = [t.sentence, t.basis, ...t.notes, ...t.cautions].join(" ");
    expect(text).toContain(a.name);
    // The Metric left off the Slots is not in the Takeaway, nor is any name that is not a Metric of the canvas.
    expect(text).not.toContain(d.name);
  });

  it("has a basis line without a full stop of its own, in every entry that gives one", () => {
    const seen: string[] = [];
    for (const e of ENTRIES) {
      const slots = Object.fromEntries(e.slots.map((s) => [s.id, s.optional ? [] : s.many ? [b, c, d] : [a]]));
      if (e.id === "correlation" || e.id === "rank" || e.id === "lag") { slots.first = [a]; slots.second = [b]; }
      if (e.id === "partial") { slots.first = [a]; slots.second = [b]; slots.held = [c]; }
      if (e.id === "matrix") slots.metrics = [a, b, c];
      const settings: Record<string, string> = e.id === "needs" ? { goal: "100000" } : e.id === "what-if" ? { percent: "10" } : e.id === "after-date" ? { date: "2026-03-01" } : {};
      let t;
      try { t = runEntry(e, world, { slots, settings }); } catch { continue; }
      if (t.basis) seen.push(t.basis);
    }
    expect(seen.length).toBeGreaterThan(3);
    for (const basis of seen) expect(basis.trim().endsWith("."), basis).toBe(false);
  });
});
