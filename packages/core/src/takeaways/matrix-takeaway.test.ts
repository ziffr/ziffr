// The Takeaway of the correlation matrix (ticket #988): every pair is the Correlation's own result, the sentence is the strongest pair's,
// every pair is under Show the numbers, and nothing is said that Correlation would not say.
import { describe, expect, it } from "vitest";
import { correlate } from "../correlation";
import { resolverFrom } from "../compare";
import { metric, months } from "../test/fixtures";
import { correlationTakeaway } from "./takeaway";
import { matrixTakeaway, MOST_IN_MATRIX } from "./matrix-takeaway";

const ctx = { style: "1,234.5" as const };
const wob = (k: number, n = 24) => Array.from({ length: n }, (_, i) => 100 + Math.round(Math.sin(i * k) * 20 + (i % 5) * 3));
const A = metric({ id: 1, slug: "a", name: "Visits" });
const B = metric({ id: 2, slug: "b", name: "Revenue" });
const C = metric({ id: 3, slug: "c", name: "Price" });
const series = { a: months("2024-01", wob(1)), b: months("2024-01", wob(1).map((v) => v * 2 + 5)), c: months("2024-01", wob(2.3)) };
const resolve = resolverFrom([A, B, C], series);
const opts = { yearStart: 1 as never };

describe("matrixTakeaway", () => {
  it("says the strongest pair's sentence, lists every pair, and holds the footer once", () => {
    const t = matrixTakeaway([A, B, C], resolve, opts, ctx);
    expect(t.kind).toBe("answer");
    const ab = correlationTakeaway(A, B, correlate(A, B, resolve, opts), ctx, { footer: false });
    // Visits and Revenue move in step by construction, so theirs is the strongest pair, worded exactly as Correlation words it.
    expect(t.sentence).toBe(ab.sentence);
    expect(t.numbers).toHaveLength(3);
    expect(t.numbers.map((n) => n.label)).toEqual(["Visits and Revenue", "Visits and Price", "Revenue and Price"]);
    expect(t.footer).toBe("This shows what has gone together, not what caused what.");
    expect(t.footer).not.toBe(ab.footer);
  });

  it("says nothing it must not", () => {
    const t = matrixTakeaway([A, B, C], resolve, opts, ctx);
    const all = [t.sentence, t.basis, ...t.cautions, ...t.notes, ...t.numbers.flatMap((n) => [n.label, n.text])].join(" ");
    expect(all).not.toMatch(/\bcause[ds]?\b|because|significan|p-value|regression|r²|coefficient|confiden/i);
  });

  it("lists a pair that cannot be compared with its reason, and refuses in words when no pair can be", () => {
    const flat = { ...series, c: months("2024-01", Array(24).fill(7)) };
    const some = matrixTakeaway([A, B, C], resolverFrom([A, B, C], flat), opts, ctx);
    expect(some.kind).toBe("answer");
    expect(some.numbers.filter((n) => !n.text.startsWith("r ")).length).toBe(2);
    const none = matrixTakeaway([A, B, C], resolverFrom([A, B, C], { a: [], b: [], c: [] }), opts, ctx);
    expect(none.kind).toBe("refusal");
    expect(none.refusal).toBeTruthy();
    expect(none.sentence).toBeNull();
  });

  it("takes at most twelve Metrics, which is sixty-six pairs", () => {
    expect(MOST_IN_MATRIX).toBe(12);
    expect((MOST_IN_MATRIX * (MOST_IN_MATRIX - 1)) / 2).toBe(66);
  });
});
