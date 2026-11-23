// The quick starts are shortcuts into the picker (ticket #988): one list, held to the registry both ways.
import { describe, expect, it } from "vitest";
import { ENTRIES } from "./method-picker";
import { NOT_OFFERED_LINES, QUICK_STARTS } from "./quick-starts";

describe("quick starts", () => {
  it("each tile and chip names a picker entry, or says why a tile is not one", () => {
    for (const q of QUICK_STARTS) {
      if (q.entry === null) expect(q.because, `${q.id} has no entry and no reason`).toBeTruthy();
      else expect(ENTRIES.some((e) => e.id === q.entry), `${q.id} names ${q.entry}, which is not an entry`).toBe(true);
    }
  });

  it("each entry that declares a tile or a chip has exactly those quick starts", () => {
    for (const e of ENTRIES) {
      const kinds = QUICK_STARTS.filter((q) => q.entry === e.id).map((q) => q.kind);
      expect(new Set(kinds), `${e.id}'s quick starts`).toEqual(new Set(e.quick ?? []));
    }
  });

  it("has nothing locked: no tile for Impact analysis or Clustering, and the picker says in a line why clustering is not offered", () => {
    expect(QUICK_STARTS.map((q) => q.label.toLowerCase()).join(" ")).not.toMatch(/impact|clustering|coming soon/);
    expect(NOT_OFFERED_LINES.join(" ")).toContain("Clustering is not offered");
  });
});
