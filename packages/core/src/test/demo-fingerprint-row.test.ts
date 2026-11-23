import { describe, expect, it } from "vitest";
import { idFreeRows, withoutIdsAndTimes } from "./demo-fingerprint-row";

describe("the demo walk's id-free fingerprint", () => {
  it("leaves out made ids and write times but keeps chosen ids and every value", () => {
    const row = { id: 7, workspace_id: "d3e00000-0000-4000-8000-000000000001", owner_id: "sara", metric_id: 12, name: "Revenue", created_at: "2026-11-23T10:00:00Z", period_start: "2026-10-01", value: 4.5 };
    expect(withoutIdsAndTimes(row)).toEqual({ name: "Revenue", owner_id: "sara", period_start: "2026-10-01", value: 4.5 });
  });

  it("looks inside stored JSON and lists of ids", () => {
    expect(withoutIdsAndTimes({ config: { widgets: [{ metricId: 3, title: "A", takenAt: "x" }], metric_ids: [1, 2] } })).toEqual({ config: { widgets: [{ title: "A" }] } });
  });

  it("makes two seeds with different ids and a different order compare equal, and a changed value differ", () => {
    const a = [{ id: 1, name: "A", v: 1 }, { id: 2, name: "B", v: 2 }];
    const b = [{ id: 40, name: "B", v: 2 }, { id: 41, name: "A", v: 1 }];
    expect(idFreeRows(a)).toBe(idFreeRows(b));
    expect(idFreeRows(a)).not.toBe(idFreeRows([{ id: 1, name: "A", v: 1 }, { id: 2, name: "B", v: 3 }]));
  });
});
