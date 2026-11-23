// @ts-nocheck
// Every formula the database is seeded with is one checkFormula takes (spec 0022): the demo's Derived Metrics are
// written in SQL, outside the core, so this is where they are checked. The trial's are checked as they are written.
import { describe, expect, it } from "vitest";
import { checkFormula } from "./formula";
import { DEMO_WORKSPACE_ID } from "./team";
import { getMetrics } from "./workspace-data";

describe("seeded formulas", () => {
  it("are all read whole, over Metrics of one period that combine", async () => {
    const metrics = await getMetrics(DEMO_WORKSPACE_ID);
    const derived = metrics.filter((m) => m.formula);
    expect(derived.length).toBeGreaterThan(0);
    for (const m of derived) expect([m.slug, checkFormula(m.formula!, metrics, m)]).toEqual([m.slug, null]);
  });
});
