// The example question of an empty canvas (ticket #1068): derived from the picker's list, never written out with Metric names.
import { describe, expect, it } from "vitest";
import type { Metric } from "@ziffr/core/types";
import { EXAMPLE_METRICS, exampleCandidates, pickExample } from "./example";
import { fact, listFor } from "./picker.fixtures";

const metric = (id: number, slug: string, archived = false) => ({ id, slug, archived_at: archived ? "2026-01-01" : null }) as unknown as Metric;
const points = (n: number) => Array.from({ length: n }, (_, i) => ({ period: `2026-${i}`, value: i }));

describe("the Metrics the example is tried on", () => {
  it("are the ones with the most values, at most four, archived and empty ones left out", () => {
    const metrics = [metric(1, "a"), metric(2, "b"), metric(3, "c"), metric(4, "d"), metric(5, "e"), metric(6, "f", true), metric(7, "g")];
    const series = { a: points(3), b: points(9), c: points(9), d: points(1), e: points(5), f: points(50), g: [] } as never;
    const got = exampleCandidates({ metrics, series });
    expect(got).toEqual([2, 3, 5, 1]);
    expect(got.length).toBeLessThanOrEqual(EXAMPLE_METRICS);
  });
});

describe("pickExample", () => {
  it("takes the first fitting entry that explains one Metric by others, with the Metrics of its Slots, in the words of the list", () => {
    const list = listFor([fact(10, "Cost"), fact(11, "Visits"), fact(12, "Price")]);
    const example = pickExample(list)!;
    const entry = list.groups.flatMap((g) => g.entries).find((e) => e.id === example.entry)!;
    // Nothing is written out here: the title is the list's own wording of the entry, and the entry is one of the registry's.
    expect(example.title).toBe(entry.name);
    expect(entry.slots.some((s) => s.id === "metric") && entry.slots.some((s) => s.many)).toBe(true);
    expect(entry.fit.ok).toBe(true);
    expect(example.title).toContain("Cost");
    expect(example.explains).toBe(10);
    expect(example.ids).toEqual([10, 11, 12]);
  });

  it("is a different Metric's question when another Metric is the one to explain first", () => {
    const example = pickExample(listFor([fact(5, "Revenue"), fact(6, "Orders")]))!;
    expect(example.explains).toBe(5);
    expect(example.title).toContain("Revenue");
  });

  it("is nothing when the Workspace has too little for any question that uses more than one Metric to fit", () => {
    expect(pickExample(listFor([]))).toBeNull();
    expect(pickExample(listFor([fact(1, "Only one")]))).toBeNull();
    // Two Metrics, too few values for any Method to fit.
    expect(pickExample(listFor([fact(1, "A", { periods: 1 }), fact(2, "B", { periods: 1 })]))).toBeNull();
  });
});
