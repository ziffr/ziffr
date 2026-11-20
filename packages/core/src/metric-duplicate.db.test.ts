// Duplicating a Metric through the core, against the real database: what the copy takes from the original (its
// description, Workflow, Submitters), what it never takes (values, Shares, Target Series, history), and who may.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createMetric, metricDraftFrom, metricEffects, saveSeriesRows, type MetricEffects } from "./metrics";
import { share } from "./sharing";
import { saveWorkflow } from "./workflows";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
// The real first Version; no Prompt goes out.
const fx = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });
const forbidden = expect.any(Forbidden);
const config = { dueWorkingDays: 3, steps: [] };

/** A described Metric with a Workflow, a Submitter, a stand-in, a value, a Share and a Target Series. */
async function original() {
  const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const cleo = await w.contact({ email: "c@t.test" });
  const workflowId = await saveWorkflow(w.actor(sara), null, "Monthly close", config as never);
  const m = await w.metric(sara, {
    name: "Cash", description: "Money in the bank at month end.", unit: "EUR", format: "currency", decimals: 2, period: "month",
    submission_rule: "reject", polarity: "target", aggregation: "last", target_min: 1000, target_max: 5000, attainment_method: null, sources: ["mail", "web_form"], workflow_id: workflowId,
  });
  await w.token(m.id, cleo);
  // A stand-in's Token covers one absence; it is not one of the Metric's Submitters.
  await db().from("tokens").insert({ code: `tk-test-${m.id}-standin`, metric_id: m.id, submitter_id: ben, stands_in_for: cleo });
  await w.value(m.id, "2026-10-01", 2500, cleo);
  await saveSeriesRows(w.actor(sara), m.id, "target", [{ period: "2026-12-01", value: 3000 }], "");
  return { w, sara, ben, cleo, m, workflowId };
}

describe("metricDraftFrom", () => {
  it("prefills the description, Workflow and regular Submitters, named as a copy", async () => {
    const { w, sara, cleo, m, workflowId } = await original();
    expect(await metricDraftFrom(w.actor(sara), m.id)).toEqual({
      original: "Cash", name: "Cash (copy)", description: "Money in the bank at month end.", unit: "EUR", unit_position: "after", format: "currency", decimals: 2, period: "month",
      submission_rule: "reject", polarity: "target", aggregation: "last", target_min: 1000, target_max: 5000, attainment_method: null, sources: ["mail", "web_form"],
      workflow: { id: workflowId, name: "Monthly close" }, submitters: [cleo], duplicateOf: m.id,
    });
  });
  it("refuses Guests, people who do not see the Metric, other workspaces and Derived Metrics", async () => {
    const { w, sara, m } = await original();
    const gus = await w.person("guest");
    await share(w.actor(sara), "metric", m.id, gus, "viewer");
    await expect(metricDraftFrom(w.actor(gus, "guest"), m.id)).rejects.toEqual(forbidden);
    const dan = await w.person("member");
    await expect(metricDraftFrom(w.actor(dan, "member"), m.id)).rejects.toEqual(forbidden);
    // A Member it is shared with may.
    await share(w.actor(sara), "metric", m.id, dan, "viewer");
    expect((await metricDraftFrom(w.actor(dan, "member"), m.id)).name).toBe("Cash (copy)");
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(metricDraftFrom(other.actor(zoe), m.id)).rejects.toEqual(forbidden);
    const derived = await w.metric(sara, { name: "Cash per head", formula: `{${m.slug}} / 2` });
    await expect(metricDraftFrom(w.actor(sara), derived.id)).rejects.toEqual(forbidden);
  });
});

describe("createMetric as a duplicate", () => {
  it("creates a Metric owned by the actor with the same description, and none of the values, Shares, Target Series or history", async () => {
    const { w, sara, cleo, m, workflowId } = await original();
    const dan = await w.person("member");
    await share(w.actor(sara), "metric", m.id, dan, "viewer");
    const draft = await metricDraftFrom(w.actor(dan, "member"), m.id);
    const effects = fx();
    const copy = await createMetric(w.actor(dan, "member"), {
      name: draft.name, description: draft.description, unit: draft.unit, unitPosition: draft.unit_position, format: draft.format, decimals: draft.decimals, period: draft.period,
      submissionRule: draft.submission_rule, polarity: draft.polarity, aggregation: draft.aggregation, targetMin: draft.target_min, targetMax: draft.target_max,
      sources: draft.sources, submitters: draft.submitters, workflowId: draft.workflow?.id, duplicateOf: draft.duplicateOf,
    }, effects);
    const { data: row } = await db().from("metrics").select("*").eq("id", copy.id).single();
    expect(row).toMatchObject({
      workspace_id: w.id, owner_id: dan, name: "Cash (copy)", slug: "cash-copy", unit: "EUR", format: "currency", decimals: 2, submission_rule: "reject",
      polarity: "target", aggregation: "last", target_min: 1000, target_max: 5000, attainment_method: null, sources: ["mail", "web_form"], workflow_id: workflowId, from_catalog_id: null, formula: null,
    });
    const [{ data: obs }, { data: shares }, { data: series }, { data: tokens }, { data: versions }] = await Promise.all([
      db().from("observations").select("id").eq("metric_id", copy.id),
      db().from("shares").select("id").eq("object_type", "metric").eq("object_id", copy.id),
      db().from("series_values").select("id").eq("metric_id", copy.id),
      db().from("tokens").select("submitter_id, stands_in_for").eq("metric_id", copy.id),
      db().from("versions").select("message, author_id").eq("object_type", "metric").eq("object_id", copy.id),
    ]);
    expect([obs, shares, series]).toEqual([[], [], []]);
    expect(tokens).toEqual([{ submitter_id: cleo, stands_in_for: null }]);
    expect(versions).toEqual([{ message: "Duplicated from “Cash”", author_id: dan }]);
    expect(effects.promptSubmitter).toHaveBeenCalledWith(copy.id, cleo, dan);
    // The original keeps what it had.
    const { data: kept } = await db().from("observations").select("id").eq("metric_id", m.id);
    expect(kept).toHaveLength(1);
  });
  it("refuses a duplicate of a Metric the actor does not see, and a Workflow of another workspace", async () => {
    const { w, m } = await original();
    const dan = await w.person("member");
    await expect(createMetric(w.actor(dan, "member"), { name: "Sneaky", duplicateOf: m.id }, fx())).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    const foreign = await saveWorkflow(other.actor(zoe), null, "Theirs", config as never);
    await expect(createMetric(w.actor(dan, "member"), { name: "Sneaky", workflowId: foreign }, fx())).rejects.toEqual(forbidden);
    const { data } = await db().from("metrics").select("id").eq("workspace_id", w.id).eq("owner_id", dan);
    expect(data).toEqual([]);
  });
});
