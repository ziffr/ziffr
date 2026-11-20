// Example 1 of the landing page in the demo (ticket #419; GLOSSARY: Demo Mode, Thread, Alert): the gross margin in October
// and why it dropped, as MCP reads it: values with who sent them and when, the Thread on one, and Mia's Alert. Apart from
// the other two examples because it needs the API's Thread functions.
import { beforeAll, describe, expect, it } from "vitest";
import { getMetric, getThreads, listObservations } from "./api";
import { db } from "./db";
import { seedDemoSnapshots } from "./demo-snapshots";
import { DEMO_WORKSPACE_ID } from "./team";
import type { Actor } from "./actor";

const sara: Actor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" };

beforeAll(async () => {
  const { error } = await db().rpc("demo_reset", { min_gap: "0 seconds" });
  expect(error).toBeNull();
  await seedDemoSnapshots();
}, 120_000);

describe("example 1: the gross margin in October, and why it dropped (MCP)", () => {
  it("is a monthly Metric with a target of 40 %", async () => {
    expect(await getMetric(sara, "gross-margin")).toMatchObject({ name: "Gross margin", period: "month", format: "percent", unit: "%", decimals: 1, target_min: 40 });
  });

  it("was 38.2 % in October, 2.1 points below September's 40.3 %, sent by Mia on 3 November, and has a Thread", async () => {
    const { items } = await listObservations(sara, "gross-margin", { from: "2026-09-01", to: "2026-10-01", limit: 10 });
    expect(items.map((i) => [i.period, i.value, i.has_thread])).toEqual([["2026-09-01", 40.3, false], ["2026-10-01", 38.2, true]]);
    expect(Math.round((items[0].value - items[1].value) * 10) / 10).toBe(2.1);
    expect(items[1]).toMatchObject({ submitter: "mia", submitter_name: "Mia Hartmann", submitted_at: "2026-11-03T10:15:00+00:00", source: "web_form" });
  });

  it("has Mia's Alert on it, below 95 % of the target, armed (firing is not seeded)", async () => {
    const { data } = await db().from("alerts").select("person_id, kind, level, state").eq("workspace_id", DEMO_WORKSPACE_ID).single();
    expect(data).toEqual({ person_id: "mia", kind: "share_of_target", level: "95", state: "armed" });
  });

  it("has Mia's words about shipping costs in the Thread on that value", async () => {
    const { threads } = await getThreads(sara, "gross-margin", "2026-10-01");
    expect(threads).toHaveLength(1);
    expect(threads[0].messages).toEqual([expect.objectContaining({ author: "mia", author_name: "Mia Hartmann", words: "Shipping costs went up after we changed carriers.", correction: null })]);
  });
});
