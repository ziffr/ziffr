// A Breakdown with parents as the export writes it (spec 0041, ticket 12): parts name their parent, and one the file's reader would refuse is left off whole and counted.
import { describe, expect, it } from "vitest";
import { exportedBreakdown } from "./workspace-export";

const row = (id: number, parent: number | null, label: string, value = 1) => ({ id, parent, label, value });

describe("exportedBreakdown", () => {
  it("writes a flat Breakdown as it did, leaving out a label that does not fit", () => {
    expect(exportedBreakdown([row(1, null, "A"), row(2, null, "x".repeat(61)), row(3, null, "B")])).toEqual({ rows: [{ label: "A", value: 1 }, { label: "B", value: 1 }], left: false });
    expect(exportedBreakdown([])).toEqual({ rows: [], left: false });
  });
  it("writes parts under their parent's label", () => {
    expect(exportedBreakdown([row(1, null, "DE"), row(2, 1, "Berlin"), row(3, null, "AT")])).toEqual({ rows: [{ label: "DE", value: 1 }, { label: "Berlin", value: 1, parent: "DE" }, { label: "AT", value: 1 }], left: false });
  });
  it("leaves the whole Breakdown off, and says so, when a name does not fit, a parent is missing or the reader would refuse it", () => {
    expect(exportedBreakdown([row(1, null, "x".repeat(61)), row(2, 1, "Berlin")])).toEqual({ rows: [], left: true });
    expect(exportedBreakdown([row(2, 1, "Berlin"), row(3, null, "AT")])).toEqual({ rows: [], left: true });
    // A name used twice, which a flat Breakdown allows.
    expect(exportedBreakdown([row(1, null, "DE"), row(2, null, "de"), row(3, 1, "Berlin")])).toEqual({ rows: [], left: true });
  });
});
