// Archived Metrics against the real database (spec 0029, ticket #264; GLOSSARY: Archived Metric): who archives and
// brings back, that values are refused by every Source and by the database itself, that Workflows, Prompts and
// reminders skip them, and that the API lists them only when asked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type FeedActor } from "./actor";
import { actorForSecret } from "./access-keys";
import { listMetrics, getMetric } from "./api";
import { setMetricArchivedWithKey } from "./api-metrics";
import { submitObservation } from "./api-submissions";
import { archiveMetric, ARCHIVED_REFUSAL, canArchiveMetric, restoreMetric } from "./archived-metrics";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { addFeedToMetric, createFeed, createFeedKey, submitFeedObservations } from "./feeds";
import { askForMissingValues } from "./questions";
import { remindDueTasks } from "./scheduled-runs";
import { decideCorrection, submitValue, type SubmissionEffects } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { valuesOf, workspace } from "./test/db-fixtures";
import { runWorkflows } from "./workflow-engine";
import { saveWorkflow } from "./workflows";
import { shiftPeriod } from "./periods";
import { share } from "./sharing";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const effects = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });
const prompts = async (metricId: number) => (await db().from("prompts").select("id").eq("metric_id", metricId)).data ?? [];
const archivedAt = async (metricId: number) => (await db().from("metrics").select("archived_at, archived_by").eq("id", metricId).single()).data;
const auditKinds = async (wsId: string) => ((await db().from("audit_events").select("kind").eq("workspace_id", wsId).order("id")).data ?? []).map((e) => e.kind as string);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const thisMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;

/** A workspace with an Owner, an Admin, a Member who owns a Metric, another Member, a Guest and a Contact who submits. */
async function setup() {
  const w = await ws();
  const sara = await w.person("owner"); const adam = await w.person("admin"); const ben = await w.person("member"); const dan = await w.person("member"); const gus = await w.person("guest");
  const cleo = await w.contact({ email: "cleo@field.test", slack_handle: "@cleo" });
  const m = await w.metric(ben, { name: "Field visits" });
  const code = await w.token(m.id, cleo);
  return { w, sara, adam, ben, dan, gus, cleo, m, code };
}

describe("archiving and bringing back", () => {
  it("is for Owners, Admins and the Metric's owner; never other Members, Guests or another workspace", async () => {
    const { w, sara, adam, ben, dan, gus, m } = await setup();
    // Owners and Admins archive the Metrics they see, here shared with them.
    await share(w.actor(ben, "member"), "metric", m.id, sara, "viewer");
    await share(w.actor(ben, "member"), "metric", m.id, adam, "viewer");
    await expect(archiveMetric(w.actor(dan, "member"), m.id)).rejects.toThrow(Forbidden);
    await expect(archiveMetric(w.actor(gus, "guest"), m.id)).rejects.toThrow(Forbidden);
    const other = await ws(); const zoe = await other.person("owner");
    await expect(archiveMetric(other.actor(zoe), m.id)).rejects.toEqual(new Forbidden());
    expect(await canArchiveMetric(w.actor(dan, "member"), m.id)).toBe(false);
    // An Admin who does not see a Metric cannot archive it either, and learns nothing about it.
    const hidden = await w.metric(sara, { name: "Payroll" });
    await expect(archiveMetric(w.actor(adam, "admin"), hidden.id)).rejects.toEqual(new Forbidden());
    await expect(archiveMetric(w.actor(dan, "member"), hidden.id)).rejects.toEqual(new Forbidden());
    expect(await canArchiveMetric(w.actor(ben, "member"), m.id)).toBe(true);

    expect(await archiveMetric(w.actor(ben, "member"), m.id)).toEqual({ archived: true });
    expect(await archivedAt(m.id)).toEqual({ archived_at: expect.any(String), archived_by: ben });
    // A second press changes nothing and records nothing.
    expect(await archiveMetric(w.actor(sara), m.id)).toEqual({ archived: false });
    await expect(restoreMetric(w.actor(dan, "member"), m.id)).rejects.toThrow(Forbidden);
    expect(await restoreMetric(w.actor(adam, "admin"), m.id)).toEqual({ restored: true });
    expect(await archivedAt(m.id)).toEqual({ archived_at: null, archived_by: null });
    expect(await restoreMetric(w.actor(adam, "admin"), m.id)).toEqual({ restored: false });
    expect(await archiveMetric(w.actor(sara), m.id)).toEqual({ archived: true });

    expect((await auditKinds(w.id)).filter((k) => k.startsWith("metric."))).toEqual(["metric.archived", "metric.restored", "metric.archived"]);
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "metric").eq("object_id", m.id).order("version");
    expect((versions ?? []).map((v) => v.message)).toEqual(["Archived", "Brought back from the archive", "Archived"]);
  });

  it("keeps the values, and refuses the demo", async () => {
    const { w, ben, m } = await setup();
    await w.value(m.id, "2026-09-01", 4);
    await archiveMetric(w.actor(ben, "member"), m.id);
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([4]);
    const { data: demoMetric } = await db().from("metrics").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).limit(1).single();
    const { data: demoOwner } = await db().from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("role", "owner").limit(1).single();
    await expect(archiveMetric({ personId: demoOwner!.user_id, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, demoMetric!.id)).rejects.toThrow("The demo can't be changed.");
  });
});

describe("an Archived Metric takes no values", () => {
  it("from the form link, email, Slack, Telegram and a Correction", async () => {
    const { w, ben, cleo, m, code } = await setup();
    await archiveMetric(w.actor(ben, "member"), m.id);
    for (const r of [
      await submitValue({ source: "web_form", sender: code, text: "12" }, effects()),
      await submitValue({ source: "mail", sender: "cleo@field.test", text: "7", workspaceId: w.id }, effects()),
      await submitValue({ source: "slack", sender: "@cleo", text: "7", workspaceId: w.id }, effects()),
      await submitValue({ source: "telegram", sender: "123", text: "7", workspaceId: w.id }, effects(), cleo),
    ]) expect(r).toMatchObject({ ok: false, outcome: "rejected_archived", detail: ARCHIVED_REFUSAL });
    expect(await valuesOf(m.id)).toEqual([]);
    const { data: log } = await db().from("intake_log").select("outcome").eq("workspace_id", w.id);
    expect((log ?? []).map((l) => l.outcome)).toEqual(Array(4).fill("rejected_archived"));

    // A Correction proposed before archiving is not accepted while it is archived; it stays proposed.
    const { data: a } = await db().from("actions").insert({ metric_id: m.id, period_start: "2026-09-01", asker_id: cleo, assignee_id: ben, kind: "question", purpose: "approval", question: "Late value", workspace_id: w.id }).select("id").single();
    const { data: msg } = await db().from("thread_messages").insert({ action_id: a!.id, author_id: cleo, body: "Late", correction_value: 9, correction_status: "proposed", workspace_id: w.id }).select("id").single();
    await expect(decideCorrection(w.actor(ben, "member"), msg!.id, true, { notifyDecision: vi.fn(async () => {}), afterValue: vi.fn(async () => []) })).rejects.toThrow(ARCHIVED_REFUSAL);
    expect((await db().from("thread_messages").select("correction_status").eq("id", msg!.id).single()).data?.correction_status).toBe("proposed");

    // Brought back, it takes values again.
    await restoreMetric(w.actor(ben, "member"), m.id);
    expect((await submitValue({ source: "web_form", sender: code, text: "12" }, effects())).ok).toBe(true);
  });

  it("from a program's key, and a Feed's other Metrics go on", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const kept = await w.metric(sara, { name: "Orders", sources: ["api"] });
    const archived = await w.metric(sara, { name: "Leads", sources: ["api"] });
    await w.token(archived.id, sara);
    const { id: feedId } = await createFeed(w.actor(sara), "CRM");
    await addFeedToMetric(w.actor(sara), kept.id, feedId);
    await addFeedToMetric(w.actor(sara), archived.id, feedId);
    const { secret } = await createFeedKey(w.actor(sara), feedId, { name: "Nightly", expiresOn: inDays(30) });
    const feed = (await actorForSecret(secret)) as FeedActor;
    await archiveMetric(w.actor(sara), archived.id);

    expect(await submitObservation(w.actor(sara), archived.slug, { value: 3 }, effects())).toEqual({ ok: false, reason: "refused", detail: ARCHIVED_REFUSAL });
    const results = await submitFeedObservations(feed, [{ metric: kept.slug, value: 5 }, { metric: archived.slug, value: 6 }], effects());
    expect(results).toMatchObject([{ metric: kept.slug, status: "recorded" }, { metric: archived.slug, status: "refused", code: "archived", detail: ARCHIVED_REFUSAL }]);
    expect((await valuesOf(kept.id)).map((v) => v.value)).toEqual([5]);
    expect(await valuesOf(archived.id)).toEqual([]);
  });

  it("in the database too: a new or changed value is refused, removing values is not", async () => {
    const { w, ben, m } = await setup();
    const id = await w.value(m.id, "2026-09-01", 4);
    await archiveMetric(w.actor(ben, "member"), m.id);
    const insert = await db().from("observations").insert({ metric_id: m.id, period_start: "2026-10-01", value: 1, source: "api", workspace_id: w.id });
    expect(insert.error?.code).toBe("ZF440");
    const update = await db().from("observations").update({ value: 5 }).eq("id", id);
    expect(update.error?.code).toBe("ZF440");
    expect((await db().from("observations").update({ period_start: "2026-08-01" }).eq("id", id)).error?.code).toBe("ZF440");
    const rpc = await db().rpc("record_value", { p_metric: m.id, p_period: "2026-09-01", p_op: "overwrite", p_new_id: 0, p_value: 6, p_value_sealed: null, p_submitter: null, p_source: "api", p_access_key: null, p_imported: false, p_expect_id: id, p_expect_count: 1, p_expect_value: "4", p_expect_rows: 0, p_rows: [] });
    expect(rpc.error?.code).toBe("ZF440");
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([4]);
    expect((await db().from("observations").delete().eq("id", id)).error).toBeNull();
  });
});

describe("an Archived Metric asks for nothing", () => {
  it("no Prompt from its Workflow, Ask for missing values or a direct ask, and no task reminder", async () => {
    const { w, sara, ben, cleo, m } = await setup();
    const workflowId = await saveWorkflow(w.actor(sara), null, "Monthly", { dueWorkingDays: 3, steps: [{ type: "remind", daysBefore: 1 }, { type: "escalate", daysAfter: 1, to: "owner" }] } as never);
    await db().from("metrics").update({ workflow_id: workflowId }).eq("id", m.id);
    // A Prompt queued before archiving does not go out after it.
    expect(await deliverPrompt({ metricId: m.id, submitterId: cleo, senderId: sara, queue: true })).toMatchObject({ connector: "email" });
    await db().from("deliveries").update({ mail_state: "queued" }).eq("workspace_id", w.id);
    // One whose Prompt row is missing is found by its form link.
    const { data: one } = await db().from("deliveries").select("id").eq("workspace_id", w.id).limit(1).single();
    await db().from("deliveries").update({ prompt_id: null }).eq("id", one!.id);
    await archiveMetric(w.actor(ben, "member"), m.id);
    expect((await db().from("deliveries").select("mail_state, last_error").eq("workspace_id", w.id)).data).toEqual([{ mail_state: "failed", last_error: "The Metric was archived before it went out." }]);
    const asked = (await prompts(m.id)).length;
    const asOf = shiftPeriod(thisMonth(), "day", 20);
    expect(await runWorkflows(w.id, asOf, sara)).toEqual([]);
    expect(await askForMissingValues(w.actor(sara))).toEqual({ asked: 0, stopped: 0 });
    expect(await deliverPrompt({ metricId: m.id, submitterId: cleo, senderId: sara })).toBe(false);
    expect((await prompts(m.id)).length).toBe(asked);
    const { data: escalations } = await db().from("actions").select("id").eq("metric_id", m.id);
    expect(escalations).toEqual([]);

    expect((await db().from("actions").insert({ metric_id: m.id, period_start: thisMonth(), asker_id: sara, assignee_id: ben, kind: "task", question: "Check the visits", due_date: inDays(1), workspace_id: w.id })).error).toBeNull();
    expect(await remindDueTasks(w.id, inDays(0))).toBe(0);
    // Brought back, it is asked for again.
    await restoreMetric(w.actor(ben, "member"), m.id);
    expect(await remindDueTasks(w.id, inDays(0))).toBe(1);
    expect((await runWorkflows(w.id, asOf, sara)).length).toBeGreaterThan(0);
    expect((await prompts(m.id)).length).toBeGreaterThan(asked);
  });
});

describe("the API", () => {
  it("lists Archived Metrics only when asked, and archives and brings back as the key's creator", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const a = await w.metric(sara, { name: "A" }); const b = await w.metric(sara, { name: "B" });
    await archiveMetric(w.actor(sara), b.id);
    const slugs = async (archived?: boolean) => (await listMetrics(w.actor(sara), { limit: 50, archived })).items.map((m) => m.slug);
    expect(await slugs()).toEqual([a.slug]);
    expect(await slugs(true)).toEqual([b.slug]);
    expect(await getMetric(w.actor(sara), b.slug)).toMatchObject({ slug: b.slug, archived: true });

    const key = { ...w.actor(sara), key: { id: "1", scopes: ["metrics:read", "metrics:write"] } };
    expect(await setMetricArchivedWithKey(key, b.slug, false)).toMatchObject({ slug: b.slug, archived: false });
    expect(await setMetricArchivedWithKey(key, a.slug, true)).toMatchObject({ slug: a.slug, archived: true });
    // Without the scope, and for a Member who neither owns it nor administers, it is refused.
    await expect(setMetricArchivedWithKey({ ...key, key: { id: "1", scopes: ["metrics:read"] } }, a.slug, false)).rejects.toThrow(Forbidden);
    await share(w.actor(sara), "metric", a.id, ben, "viewer");
    await expect(setMetricArchivedWithKey({ ...w.actor(ben, "member"), key: { id: "2", scopes: ["metrics:write"] } }, a.slug, false)).rejects.toThrow("Only Owners, Admins and the Metric's owner");
  });
});
