// A Metric's description, Sources and Workflow changed with a key (ticket #612; GLOSSARY: Workflow, Due Date, Source):
// the same rules and permissions as the app's Edit details and Workflow dropdown, checked before the first change.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type Scope, type KeyActor } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { createMetricWithKey, MetricChangeRefused, updateMetricWithKey } from "./api-metrics";
import { WorkflowChoiceRefused } from "./api-metric-workflow";
import { getMetric } from "./api";
import { submitObservation } from "./api-submissions";
import { db } from "./db";
import { metricEffects, type MetricEffects } from "./metrics";
import { share } from "./sharing";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { opened, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const fx = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });
const EDIT: Scope[] = ["metrics:read", "metrics:edit"];

async function keyFor(w: Awaited<ReturnType<typeof ws>>, person: string, scopes: Scope[] = EDIT, role: "owner" | "member" = "member") {
  const { secret } = await createAccessKey(w.actor(person, role), { name: "Assistant", scopes, expiresOn: inDays(30) });
  return (await actorForKey(secret)) as KeyActor;
}
const publish = [{ type: "publish" as const, lock: false }];
const approving = (approver: string) => [{ type: "approve" as const, approvers: [approver], values: "every" as const, nobodyElse: "self-check" as const }, ...publish];

describe("changing a Metric's description with a key", () => {
  it("changes name, description, unit, format and rule, keeps the slug, and refuses a period once there are values", async () => {
    const w = await ws(); const ben = await w.person("member"); const sara = await w.person("owner");
    const mine = await w.metric(ben, { name: "Revenue" });
    const saras = await w.metric(sara, { name: "Payroll" });
    const key = await keyFor(w, ben, ["metrics:read", "metrics:edit", "values:submit"]);
    const done = await updateMetricWithKey(key, mine.slug, { name: "Net revenue", description: "After refunds", unit: "EUR", format: "currency", submission_rule: "add", period: "quarter" });
    expect(done).toMatchObject({ slug: mine.slug, name: "Net revenue", description: "After refunds", unit: "EUR", format: "currency", period: "quarter", workflow: null, next_due: null });
    const [row] = await opened("metrics", w.id, (await db().from("metrics").select("id, name, description, submission_rule").eq("id", mine.id)).data, { dropId: true });
    expect(row).toMatchObject({ name: "Net revenue", description: "After refunds", submission_rule: "add" });
    // Words the core would quietly ignore are said, and nothing is changed by a refused call.
    for (const bad of [{ format: "table" }, { name: "  " }, { unit: "x".repeat(21) }, { polarity: "sideways" }, { period: "decade" }]) {
      await expect(updateMetricWithKey(key, mine.slug, bad as never)).rejects.toBeInstanceOf(MetricChangeRefused);
    }
    // Once the Metric has values, its period stays: the core's reason reaches the program as a refusal, not a fault.
    await db().from("observations").insert({ metric_id: mine.id, period_start: "2026-01-01", value: 3, source: "api", workspace_id: w.id });
    await expect(updateMetricWithKey(key, mine.slug, { period: "month" })).rejects.toThrow(/cannot change once the Metric has values/);
    await expect(updateMetricWithKey(key, mine.slug, { period: "month" })).rejects.toBeInstanceOf(MetricChangeRefused);
    // Someone else's hidden Metric is not found; a viewer sees it and may not change it; a guest's key changes nothing.
    await expect(updateMetricWithKey(key, saras.slug, { name: "x" })).rejects.toEqual(expect.any(Forbidden));
    await share(w.actor(sara, "owner"), "metric", saras.id, ben, "viewer");
    await expect(updateMetricWithKey(key, saras.slug, { name: "x" })).rejects.toThrow(/owner and its Editors/);
    await expect(updateMetricWithKey({ ...key, role: "guest" }, mine.slug, { name: "x" })).rejects.toThrow(/may not change Metrics/);
    // The history names the key.
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "metric").eq("object_id", mine.id);
    expect(versions?.map((v) => v.message).join(" ")).toContain("key “Assistant”");
  });

  it("changes the Sources, and a refused value says which ones the Metric takes and how to change them", async () => {
    const w = await ws(); const ben = await w.person("member");
    const key = await keyFor(w, ben, [...EDIT, "values:submit", "metrics:write"]);
    const made = await createMetricWithKey(key, { name: "Calls", sources: ["web_form", "mail"], submit: true }, fx());
    expect(made.sources).toEqual(["web_form", "mail"]);
    const refused = await submitObservation(key, made.slug, { value: 5 });
    expect(refused).toMatchObject({ ok: false, reason: "refused" });
    expect(refused.detail).toMatch(/doesn’t accept values from the API\. It accepts values from: Web form, Mail\./);
    expect(refused.detail).toMatch(/update_metric/);
    // A key that may not read is told nothing of the Metric's Sources.
    const writer = await keyFor(w, ben, ["values:submit"]);
    expect((await submitObservation(writer, made.slug, { value: 5 }))).toMatchObject({ ok: false, detail: "This Metric does not take values from the API." });
    expect((await updateMetricWithKey(key, made.slug, { sources: ["web_form", "mail", "api"] })).sources).toEqual(["web_form", "mail", "api"]);
    expect(await submitObservation(key, made.slug, { value: 5 })).toMatchObject({ ok: true, status: "recorded" });
  });
});

describe("a Metric's Workflow with a key", () => {
  it("is given by id or exact name when creating and changing, shows its next Due Date, and only its owner changes it", async () => {
    const w = await ws(); const ben = await w.person("member"); const sara = await w.person("owner");
    const daily = await saveWorkflow(w.actor(ben, "member"), null, "Ask me each day", { dueWorkingDays: 2, steps: publish });
    const saras = await saveWorkflow(w.actor(sara, "owner"), null, "Finance close", { dueWorkingDays: 0, steps: publish });
    const key = await keyFor(w, ben, ["metrics:read", "metrics:edit", "metrics:write"]);
    const made = await createMetricWithKey(key, { name: "Signups", period: "week", workflow: "ask ME each day" }, fx());
    expect(made.workflow).toEqual({ id: daily, name: "Ask me each day", yours: true });
    // The Due Date of the week Ziffr asks for now, or of the next one when that has passed: always today or later.
    expect(made.next_due!.date >= new Date().toISOString().slice(0, 10)).toBe(true);
    expect(made.next_due).toMatchObject({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), period: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect((await getMetric(key, made.slug)).workflow?.name).toBe("Ask me each day");

    const none = await updateMetricWithKey(key, made.slug, { workflow: null });
    expect(none).toMatchObject({ workflow: null, next_due: null });
    expect((await updateMetricWithKey(key, made.slug, { workflow: daily })).workflow?.id).toBe(daily);
    const { data: audit } = await db().from("audit_events").select("kind, access_key_id").eq("workspace_id", w.id).eq("kind", "metric.workflow_set");
    expect(audit?.length).toBe(3);
    // The Audit Log names the key, so a person's change is told from their key's.
    expect(audit?.every((a) => a.access_key_id !== null)).toBe(true);
    // The write insists on the Workflow the check saw: one moved meanwhile is not overwritten.
    const { data: row } = await db().from("metrics").select("id").eq("workspace_id", w.id).eq("slug", made.slug).single();
    await expect(setMetricWorkflow(w.actor(ben, "member"), row!.id, null, { from: null })).rejects.toThrow(/changed meanwhile/);

    // Not one of the creator's own (another person's, a missing one, a name used twice) and nothing is created or changed.
    await expect(updateMetricWithKey(key, made.slug, { workflow: saras })).rejects.toBeInstanceOf(WorkflowChoiceRefused);
    await expect(updateMetricWithKey(key, made.slug, { workflow: "Finance close" })).rejects.toBeInstanceOf(WorkflowChoiceRefused);
    await saveWorkflow(w.actor(ben, "member"), null, "Ask me each day", { dueWorkingDays: 0, steps: publish });
    await expect(updateMetricWithKey(key, made.slug, { workflow: "Ask me each day" })).rejects.toThrow(/more than one Workflow/);
    await expect(createMetricWithKey(key, { name: "Ghost", workflow: "Nothing" }, fx())).rejects.toBeInstanceOf(WorkflowChoiceRefused);
    expect((await db().from("metrics").select("id").eq("workspace_id", w.id).eq("name", "Ghost")).data).toEqual([]);
    // The patch is all or nothing: a refused Workflow leaves the name as it was.
    await expect(updateMetricWithKey(key, made.slug, { name: "Renamed", workflow: "Nothing" })).rejects.toBeInstanceOf(WorkflowChoiceRefused);
    expect((await getMetric(key, made.slug)).name).toBe("Signups");

    // An Editor changes the description, not the schedule; a Derived Metric has none; a scope of metrics:write alone creates, not assigns.
    const edited = await w.metric(sara, { name: "Leads" });
    await share(w.actor(sara, "owner"), "metric", edited.id, ben, "editor");
    expect((await updateMetricWithKey(key, edited.slug, { description: "x" })).description).toBe("x");
    await expect(updateMetricWithKey(key, edited.slug, { workflow: daily })).rejects.toThrow(/Only the Metric's owner sets its Workflow/);
    const writeOnly = await keyFor(w, ben, ["metrics:read", "metrics:write"]);
    await expect(createMetricWithKey(writeOnly, { name: "Late", workflow: daily }, fx())).rejects.toThrow(/lacks the scope "Change metrics"/);
    const derived = await w.metric(ben, { name: "Ratio" });
    await db().from("metrics").update({ formula: "1+1" }).eq("id", derived.id);
    await expect(updateMetricWithKey(key, derived.slug, { workflow: daily })).rejects.toThrow(/Derived Metric/);
  });

  it("is not joined or left by a key that cannot choose who approves", async () => {
    const w = await ws(); const ben = await w.person("member"); const sara = await w.person("owner");
    const plain = await saveWorkflow(w.actor(ben, "member"), null, "Plain", { dueWorkingDays: 1, steps: publish });
    const approves = await saveWorkflow(w.actor(ben, "member"), null, "Approved", { dueWorkingDays: 1, steps: approving(sara) });
    const metric = await w.metric(ben, { name: "Revenue" });
    const key = await keyFor(w, ben);
    // A Workflow that decides who sees values is joined in Ziffr; so is leaving it, which would drop its Approvals.
    await expect(updateMetricWithKey(key, metric.slug, { workflow: approves })).rejects.toThrow(/Approve or Tell step/);
    expect((await getMetric(key, metric.slug)).workflow).toBeNull();
    await setMetricWorkflow(w.actor(ben, "member"), metric.id, approves);
    await expect(updateMetricWithKey(key, metric.slug, { workflow: plain })).rejects.toThrow(/out of a Workflow that has an Approve or Tell step/);
    await expect(updateMetricWithKey(key, metric.slug, { workflow: null })).rejects.toBeInstanceOf(WorkflowChoiceRefused);
    expect((await getMetric(key, metric.slug)).workflow?.name).toBe("Approved");
  });

  it("shows another person's Workflow by name only, and no Due Date for an Archived Metric", async () => {
    const w = await ws(); const ben = await w.person("member"); const sara = await w.person("owner");
    const saras = await saveWorkflow(w.actor(sara, "owner"), null, "Finance close", { dueWorkingDays: 3, steps: publish });
    const metric = await w.metric(ben, { name: "Orders" });
    await setMetricWorkflow(w.actor(ben, "member"), metric.id, saras);
    const key = await keyFor(w, ben);
    expect((await getMetric(key, metric.slug)).workflow).toEqual({ id: saras, name: "Finance close", yours: false });
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", metric.id);
    expect(await getMetric(key, metric.slug)).toMatchObject({ workflow: { name: "Finance close" }, next_due: null });
  });
});
