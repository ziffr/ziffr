// The demo shows every Workspace Role (#528; GLOSSARY: Workspace Role, Demo Mode): an Owner, an Admin, Members and a
// Guest who sees only what was shared with them. The demo is reset first, so this also tests the nightly reset.
import { beforeAll, describe, expect, it } from "vitest";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { getMetrics } from "./workspace-data";
import { DEMO_WORKSPACE_ID, demoRoles } from "./team";

beforeAll(async () => {
  const { error } = await db().rpc("demo_reset", { min_gap: "0 seconds" });
  expect(error).toBeNull();
}, 120_000);

describe("the demo's roles", () => {
  it("has an Owner, an Admin, Members and a Guest", async () => {
    const roles = await demoRoles();
    expect(roles).toMatchObject({ sara: "owner", ben: "admin", anna: "member", greta: "guest" });
  });

  it("shows the Guest only what is shared with them", async () => {
    const metrics = await getMetrics(DEMO_WORKSPACE_ID);
    const seen = [...(await visibleMetricIds(DEMO_WORKSPACE_ID, "greta", metrics))].map((id) => metrics.find((m) => m.id === id)?.slug).sort();
    expect(seen).toEqual(expect.arrayContaining(["orders", "revenue"]));
    expect(seen).not.toContain("churn-rate");
    expect(seen).not.toContain("refunds-weekly");
    expect(seen.length).toBeLessThan(metrics.length / 2);
  });
});
