// Download the values of chosen Metrics (spec 0056): who may, which Metrics are in the file, and what is written down.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { EXPORT_METRICS, exportMetricValues } from "./metric-values-export";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c().catch(() => {}); });

/** A Workspace with Sara (member) who owns Revenue, Ben (member) who owns Secret, and a Guest. */
async function base() {
  const w = await workspace("Export");
  cleanups.push(w.cleanup);
  const sara = await w.person("member");
  const ben = await w.person("member");
  const guest = await w.person("guest");
  const revenue = await w.metric(sara, { name: "Revenue" });
  const costs = await w.metric(sara, { name: "Costs" });
  const secret = await w.metric(ben, { name: "Ben's secret" });
  await w.value(revenue.id, "2026-09-01", 1200.5, sara);
  await w.value(revenue.id, "2026-10-01", 1300, sara);
  await w.value(costs.id, "2026-09-01", 40, sara);
  await w.value(secret.id, "2026-09-01", 99, ben);
  return { w, sara, ben, guest, revenue, costs, secret };
}

describe("exportMetricValues", () => {
  it("gives a person the values of the chosen Metrics they see, and only those", async () => {
    const { w, sara, revenue, costs, secret } = await base();
    const { csv, metrics, rows } = await exportMetricValues(w.actor(sara, "member"), [revenue.slug, secret.slug]);
    expect(metrics).toBe(1);
    expect(rows).toBe(2);
    expect(csv.split("\r\n")[0]).toBe('"metric","name","period","period_start","value","unit","source","recorded_at","period_end","condensed_from"');
    expect(csv).toContain("1200.5");
    expect(csv).toContain("2026-10-01");
    // Costs was not chosen; Ben's Metric is not Sara's to see, and nothing says it exists.
    expect(csv).not.toContain(costs.slug);
    expect(csv).not.toContain("Ben's secret");
  });

  it("answers a Metric that is unknown and one the person may not see in the same words", async () => {
    const { w, sara, secret } = await base();
    const unseen = await exportMetricValues(w.actor(sara, "member"), [secret.slug]).catch((e: Error) => e.message);
    const unknown = await exportMetricValues(w.actor(sara, "member"), ["no-such-metric"]).catch((e: Error) => e.message);
    expect(unseen).toBe("Pick at least one Metric you can see.");
    expect(unknown).toBe(unseen);
  });

  it("lets a Guest download what is shared with them, and nothing else", async () => {
    const { w, guest, revenue, costs } = await base();
    await expect(exportMetricValues(w.actor(guest, "guest"), [revenue.slug])).rejects.toThrow("Pick at least one Metric you can see.");
    await w.share(revenue.id, guest);
    const { csv } = await exportMetricValues(w.actor(guest, "guest"), [revenue.slug, costs.slug]);
    expect(csv).toContain("1200.5");
    expect(csv).not.toContain(costs.slug);
  });

  it("includes an Archived Metric's values, and gives nothing to someone without a membership", async () => {
    const { w, sara, revenue } = await base();
    await w.patchMetric(revenue.id, { archived_at: new Date().toISOString() });
    expect((await exportMetricValues(w.actor(sara, "member"), [revenue.slug])).rows).toBe(2);
    await w.dropMember(sara);
    await expect(exportMetricValues(w.actor(sara, "member"), [revenue.slug])).rejects.toBeInstanceOf(Forbidden);
  });

  it("refuses an Access Key, the demo and a list that is too long", async () => {
    const { w, sara, revenue } = await base();
    await expect(exportMetricValues({ ...w.actor(sara, "member"), key: { id: "k", scopes: ["read"] } } as never, [revenue.slug])).rejects.toBeInstanceOf(Forbidden);
    await expect(exportMetricValues({ ...w.actor(sara, "member"), workspaceId: DEMO_WORKSPACE_ID }, [revenue.slug])).rejects.toThrow();
    await expect(exportMetricValues(w.actor(sara, "member"), Array.from({ length: EXPORT_METRICS + 1 }, (_, i) => `m-${i}`))).rejects.toThrow(`at most ${EXPORT_METRICS}`);
  });

  it("writes each download in the Audit Log, in counts and without a name or a value", async () => {
    const { w, sara, revenue, costs } = await base();
    await exportMetricValues(w.actor(sara, "member"), [revenue.slug, costs.slug]);
    const { data } = await db().from("audit_events").select("kind, details, object_name").eq("workspace_id", w.id).eq("kind", "export.metric_values");
    expect(data).toHaveLength(1);
    expect(data![0].details).toEqual({ metrics: 2, rows: 3 });
    expect(JSON.stringify(data)).not.toContain("1200");
  });
});
