// Feeds against the real database (spec 0012, tickets #158, #159, #160): who may make them and their keys, what a
// Feed Key may see and do, Imports skipping the Unusual Value check, the limits counted per Feed, and Workflows that
// never ask a Feed and tell the owner when its value is missing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type FeedActor } from "./actor";
import { actorForKey, actorForSecret, createAccessKey, listAccessKeys } from "./access-keys";
import { admitCall } from "./access-log";
import { db } from "./db";
import {
  addFeedToMetric, claimFeedBatch, createFeed, createFeedKey, deleteFeed, feedChoices, feedNames, feedOverview, FEED_VALUES_PER_DAY,
  finishFeedBatch, listFeeds, removeFeedFromMetric, renameFeed, revokeFeedKey, submitFeedObservations,
} from "./feeds";
import { accessLog } from "./access-log";
import { deliverPrompt } from "./deliveries";
import { metricDraftFrom } from "./metrics";
import { submissionForm } from "./page-data";
import { periodStart } from "./format";
import { shiftPeriod, dueDate } from "./workflow-rules";
import { runWorkspaceIfDue } from "./scheduled-runs";
import { submissionEffects, type SubmissionEffects } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { feedBatch, logCalls, valuesOf, workspace } from "./test/db-fixtures";
import { saveWorkflow, setMetricWorkflow } from "./workflows";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); vi.restoreAllMocks(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const thisMonth = () => periodStart(new Date(), "month");
const monthsAgo = (n: number) => shiftPeriod(thisMonth(), "month", -n);
/** Effects that send nothing but still run the Workflow, so checks and Approvals happen for real. */
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: submissionEffects.afterValue });

/** A workspace with an Owner, a Metric the Feed "CRM" submits to, and the Feed's key as an actor. */
async function withFeed(over: Record<string, unknown> = {}) {
  const w = await ws(); const sara = await w.person("owner");
  const m = await w.metric(sara, { sources: ["web_form", "api"], ...over });
  const { id: feedId } = await createFeed(w.actor(sara), "CRM");
  await addFeedToMetric(w.actor(sara), m.id, feedId);
  const { id: keyId, secret } = await createFeedKey(w.actor(sara), feedId, { name: "Nightly", expiresOn: inDays(30) });
  const feed = (await actorForSecret(secret)) as FeedActor;
  return { w, sara, m, feedId, keyId, secret, feed };
}

describe("making Feeds and their keys", () => {
  it("is for Owners and Admins only, never Members, Guests, keys or the demo", async () => {
    const w = await ws(); const sara = await w.person("owner"); const adam = await w.person("admin");
    const ben = await w.person("member"); const gus = await w.person("guest");
    const { id } = await createFeed(w.actor(adam, "admin"), "Warehouse");
    // Ben owns a Metric, and still may not make a Feed for it.
    await w.metric(ben);
    await expect(createFeed(w.actor(ben, "member"), "Mine")).rejects.toThrow(Forbidden);
    await expect(createFeed(w.actor(gus, "guest"), "Mine")).rejects.toThrow(Forbidden);
    await expect(createFeedKey(w.actor(ben, "member"), id, { name: "k", expiresOn: inDays(5) })).rejects.toThrow(Forbidden);
    await expect(createFeed({ personId: sara, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "Demo")).rejects.toThrow(Forbidden);
    await expect(createFeed({ ...w.actor(sara), key: { id: "1", scopes: ["metrics:read"] } } as never, "Key")).rejects.toThrow(Forbidden);
    expect((await listFeeds(w.actor(sara))).map((f) => f.name)).toEqual(["Warehouse"]);
    await expect(listFeeds(w.actor(ben, "member"))).rejects.toThrow(Forbidden);
    // Members see the names to choose from, nothing more; Guests not even that.
    expect(await feedChoices(w.actor(ben, "member"))).toEqual([{ id, name: "Warehouse" }]);
    expect(await feedChoices(w.actor(gus, "guest"))).toEqual([]);
  });
  it("shows a Feed Key's Access Log only to Owners and Admins, not to a creator who was demoted", async () => {
    const { w, sara, keyId } = await withFeed();
    expect(await accessLog(w.actor(sara), keyId)).toEqual([]);
    await w.person("owner"); // the workspace keeps an Owner when Sara steps down
    await w.setRole(sara, "member");
    await expect(accessLog(w.actor(sara, "member"), keyId)).rejects.toThrow(Forbidden);
  });
  it("keeps a Feed's keys out of the people's own key lists, and a person's revoking out of them", async () => {
    const { w, sara, keyId } = await withFeed();
    expect((await listAccessKeys(w.actor(sara))).map((k) => k.id)).not.toContain(keyId);
    expect((await listFeeds(w.actor(sara)))[0].keys.map((k) => k.id)).toEqual([keyId]);
  });
  it("cannot reach another workspace's Feed", async () => {
    const { feedId } = await withFeed();
    const other = await ws(); const olga = await other.person("owner");
    await expect(createFeedKey(other.actor(olga), feedId, { name: "k", expiresOn: inDays(5) })).rejects.toThrow(Forbidden);
    await expect(renameFeed(other.actor(olga), feedId, "Mine")).rejects.toThrow(Forbidden);
    await expect(deleteFeed(other.actor(olga), feedId)).rejects.toThrow(Forbidden);
    expect(await listFeeds(other.actor(olga))).toEqual([]);
  });
  it("gives a Feed Key no person: it is no KeyActor, and keeps working after its creator leaves", async () => {
    const { w, sara, feedId, secret } = await withFeed();
    expect(await actorForKey(secret)).toBeNull();
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", sara);
    expect(await actorForSecret(secret)).toMatchObject({ feed: true, feedId, workspaceId: w.id });
  });
  it("stops a key when it is revoked, when it ends, and every key when the Feed is deleted, keeping its values", async () => {
    const { w, sara, m, feedId, keyId, secret, feed } = await withFeed();
    expect(await submitFeedObservations(feed, [{ metric: m.slug, value: 5 }], quiet())).toMatchObject([{ status: "recorded" }]);
    const second = await createFeedKey(w.actor(sara), feedId, { name: "Spare", expiresOn: inDays(30) });
    await revokeFeedKey(w.actor(sara), keyId);
    expect(await actorForSecret(secret)).toBeNull();
    expect(await actorForSecret(second.secret)).not.toBeNull();
    await db().from("access_keys").update({ expires_on: "2020-01-01" }).eq("id", second.id);
    expect(await actorForSecret(second.secret)).toBeNull();
    await db().from("access_keys").update({ expires_on: inDays(30) }).eq("id", second.id);
    await deleteFeed(w.actor(sara), feedId);
    expect(await actorForSecret(second.secret)).toBeNull();
    expect(await valuesOf(m.id)).toMatchObject([{ value: 5, submitter_id: feedId }]);
    expect(await feedNames(w.actor(sara), [feedId, sara])).toEqual({ [feedId]: "CRM" });
    expect(await listFeeds(w.actor(sara))).toEqual([]);
  });
  it("renames a Feed, and its values show the new name", async () => {
    const { w, sara, feedId } = await withFeed();
    await renameFeed(w.actor(sara), feedId, "HubSpot");
    expect((await feedNames(w.actor(sara), [feedId]))[feedId]).toBe("HubSpot");
    const { data: p } = await db().from("profiles").select("name").eq("id", feedId).single();
    expect(p!.name).toBe("HubSpot");
  });
});

describe("a Feed as a Metric's Submitter", () => {
  it("is chosen by the Metric's owner or Editors, which turns its API Source on", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const eve = await w.person("member");
    const m = await w.metric(ben, { sources: ["slack"] });
    const { id: feedId } = await createFeed(w.actor(sara), "CRM");
    // Sara is an Owner of the workspace but neither owns nor edits this Metric.
    await expect(addFeedToMetric(w.actor(sara), m.id, feedId)).rejects.toThrow(Forbidden);
    await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: m.id, user_id: eve, role: "editor" });
    await addFeedToMetric(w.actor(eve, "member"), m.id, feedId);
    const { data: metric } = await db().from("metrics").select("sources").eq("id", m.id).single();
    expect(metric!.sources).toEqual(["slack", "api"]);
    await removeFeedFromMetric(w.actor(ben, "member"), m.id, feedId);
    const { count } = await db().from("tokens").select("id", { count: "exact", head: true }).eq("metric_id", m.id).eq("submitter_id", feedId);
    expect(count).toBe(0);
  });
  it("gets no Prompt, no form for its Token, and is not copied with the Metric", async () => {
    const { w, sara, m, feedId } = await withFeed();
    expect(await deliverPrompt({ metricId: m.id, submitterId: feedId, senderId: sara })).toBe(false);
    const { data: t } = await db().from("tokens").select("code").eq("metric_id", m.id).eq("submitter_id", feedId).single();
    expect(await submissionForm(t!.code)).toBeNull();
    const ben = await w.person("member"); await w.token(m.id, ben);
    expect((await metricDraftFrom(w.actor(sara), m.id)).submitters).toEqual([ben]);
  });
  it("is never asked for a value, and its missing value is the owner's to follow up", async () => {
    const { w, sara, m, feedId } = await withFeed({ name: "Pipeline", period: "month" });
    const config = { dueWorkingDays: 3, steps: [{ type: "remind" as const, daysBefore: 1 }, { type: "escalate" as const, to: "stand-in" as const, daysAfter: 1 }] };
    await setMetricWorkflow(w.actor(sara), m.id, await saveWorkflow(w.actor(sara), null, "Close", config));
    const due = dueDate("2026-11-01", "month", config);
    const at = (day: string) => new Date(`${day}T09:00:00Z`);
    const clock = { id: w.id, time_zone: "UTC", run_hour: 8 };
    expect(await runWorkspaceIfDue(clock, at("2026-12-01"))).toBe("ran");
    expect(await runWorkspaceIfDue(clock, at(shiftPeriod(due, "day", -1)))).toBe("ran");
    expect(await runWorkspaceIfDue(clock, at(shiftPeriod(due, "day", 2)))).toBe("ran");
    const { count: prompts } = await db().from("prompts").select("id", { count: "exact", head: true }).eq("metric_id", m.id).eq("submitter_id", feedId);
    expect(prompts).toBe(0);
    const { data: escalation } = await db().from("actions").select("assignee_id, question").eq("metric_id", m.id).eq("purpose", "escalation");
    expect(escalation).toEqual([{ assignee_id: sara, question: expect.stringContaining("the Feed CRM") }]);
  });
});

describe("what a Feed Key sees", () => {
  it("lists only its own Metrics that take API values, with the periods that have a value and no values", async () => {
    const { w, sara, m, feed, feedId } = await withFeed({ name: "Pipeline" });
    await w.value(m.id, monthsAgo(2), 100, sara);
    await w.value(m.id, monthsAgo(1), 120, sara);
    const off = await w.metric(sara, { sources: ["web_form"] }); await addFeedToMetric(w.actor(sara), off.id, feedId);
    await db().from("metrics").update({ sources: ["web_form"] }).eq("id", off.id);
    const derived = await w.metric(sara, { formula: `{${m.slug}} * 2`, sources: ["api"] }); await w.token(derived.id, feedId);
    await w.metric(sara, { sources: ["api"] }); // not the Feed's
    const overview = await feedOverview(feed, { limit: 50 });
    expect(overview.name).toBe("CRM");
    expect(overview.metrics.items).toEqual([{ slug: m.slug, name: "Pipeline", period: "month", unit: "", format: "number", decimals: 0, current: thisMonth(), due_working_days: null, filled: [monthsAgo(2), monthsAgo(1)] }]);
    expect(JSON.stringify(overview)).not.toMatch(/100|120/);
  });
  it("refuses a Metric of another workspace, one it does not feed, and one whose API is off, alike", async () => {
    const { w, sara, m, feed } = await withFeed();
    const other = await ws(); const olga = await other.person("owner"); const theirs = await other.metric(olga, { sources: ["api"] });
    const notMine = await w.metric(sara, { sources: ["api"] });
    const items = [{ metric: theirs.slug, value: 1 }, { metric: notMine.slug, value: 1 }, { metric: "no-such-metric", value: 1 }];
    expect(await submitFeedObservations(feed, items, quiet())).toEqual(items.map((i) => ({ metric: i.metric, period: null, status: "refused", code: "not_found", detail: expect.any(String) })));
    await db().from("metrics").update({ sources: ["web_form"] }).eq("id", m.id);
    expect(await submitFeedObservations(feed, [{ metric: m.slug, value: 1 }], quiet())).toMatchObject([{ status: "refused", code: "not_found" }]);
    expect(await valuesOf(theirs.id)).toEqual([]);
  });
});

describe("a Feed's batch", () => {
  it("records each item under the Feed and its key through the Submission Rule, one bad item stopping none", async () => {
    const { m, feed, feedId, keyId } = await withFeed({ submission_rule: "reject" });
    const r = await submitFeedObservations(feed, [
      { metric: m.slug, value: 7, breakdown: [{ label: "EMEA", value: 7 }] },
      { metric: m.slug, value: 8 },
      { metric: m.slug, value: 9, period: "2026-01-15" },
      { metric: m.slug, value: 9, period: "2099-01-01" },
    ], quiet());
    expect(r.map((x) => [x.status, "code" in x ? x.code : null])).toEqual([["recorded", null], ["refused", "duplicate"], ["refused", "period"], ["refused", "period"]]);
    // Its words hold no earlier value: a Feed may not read values.
    expect(JSON.stringify(r)).not.toMatch(/\b7\b/);
    const { data: obs } = await db().from("observations").select("value, submitter_id, access_key_id, imported").eq("metric_id", m.id);
    expect(obs).toEqual([{ value: 7, submitter_id: feedId, access_key_id: keyId, imported: false }]);
  });
  it("imports empty past periods without the Unusual Value check, and checks the rest", async () => {
    const { w, sara, m, feed } = await withFeed({ target_max: 10 });
    const ben = await w.person("member");
    await setMetricWorkflow(w.actor(sara), m.id, await saveWorkflow(w.actor(sara), null, "Check", { dueWorkingDays: 2, steps: [{ type: "check", changePct: 50, outsideTarget: true }, { type: "approve", approvers: [ben] }, { type: "publish", lock: false }] }));
    await w.value(m.id, monthsAgo(3), 5, sara);
    const r = await submitFeedObservations(feed, [
      { metric: m.slug, value: 500, period: monthsAgo(2) }, // empty past period: an Import, unusual but unchecked
      { metric: m.slug, value: 900, period: monthsAgo(3) }, // replaces a value: checked
      { metric: m.slug, value: 800 }, // the current period: checked
    ], quiet());
    expect(r).toMatchObject([
      { status: "recorded", imported: true, detail: "Imported." },
      { status: "awaiting_approval", imported: false },
      { status: "awaiting_approval", imported: false },
    ]);
    const { data: imported } = await db().from("observations").select("period_start, imported").eq("metric_id", m.id).order("period_start");
    expect(imported).toEqual([{ period_start: monthsAgo(3), imported: false }, { period_start: monthsAgo(2), imported: true }, { period_start: thisMonth(), imported: false }]);
    const { count } = await db().from("actions").select("id", { count: "exact", head: true }).eq("metric_id", m.id).eq("purpose", "approval");
    expect(count).toBe(2);
  });
  it("never imports into a locked period, and never for a person's key", async () => {
    const { w, m, feed } = await withFeed();
    await w.lock(m.id, monthsAgo(1));
    expect(await submitFeedObservations(feed, [{ metric: m.slug, value: 3, period: monthsAgo(1) }], quiet())).toMatchObject([{ status: "locked" }]);
    expect(await valuesOf(m.id)).toEqual([]);
    // A person's key through the same core path: the import flag is ignored for anyone but a Feed.
    const { submitValue } = await import("./submissions");
    const ben = await w.person("member"); const code = await w.token(m.id, ben);
    const r = await submitValue({ source: "api", sender: code, text: "4", value: { value: 4 }, period: monthsAgo(2), import: true, workspaceId: w.id }, quiet());
    expect(r).toMatchObject({ ok: true, outcome: "recorded" });
    expect(r.imported).toBeUndefined();
    const { data: obs } = await db().from("observations").select("imported").eq("metric_id", m.id).eq("period_start", monthsAgo(2)).single();
    expect(obs!.imported).toBe(false);
  });
  it("counts the daily limit over all the Feed's keys, runs one batch at a time, and the minute's limit too", async () => {
    const { w, sara, feedId, keyId, feed } = await withFeed();
    const spare = await createFeedKey(w.actor(sara), feedId, { name: "Spare", expiresOn: inDays(30) });
    const other = (await actorForSecret(spare.secret)) as FeedActor;
    // The day so far: 10 values short of the limit, in finished batches.
    for (let n = 0; n < FEED_VALUES_PER_DAY - 10; n += 500) await feedBatch(feedId, Math.min(500, FEED_VALUES_PER_DAY - 10 - n));
    expect(await claimFeedBatch(other, 11)).toMatchObject({ ok: false, reason: "limit", retryAfter: expect.any(Number) });
    // Claimed at once from both keys: one runs, the other waits for it, whatever the timing.
    const both = await Promise.all([claimFeedBatch(feed, 5), claimFeedBatch(other, 5)]);
    expect(both.map((c) => (c.ok ? "ok" : c.reason)).sort()).toEqual(["busy", "ok"]);
    const won = both.find((c) => c.ok) as { ok: true; batchId: number };
    await finishFeedBatch(feed, won.batchId, 5);
    // 5 taken of the 10 left: another 5 fit, a sixth does not.
    expect(await claimFeedBatch(other, 6)).toMatchObject({ ok: false, reason: "limit" });
    expect(await claimFeedBatch(other, 5)).toMatchObject({ ok: true });
    await logCalls(keyId, 60);
    expect(await admitCall(other)).toMatchObject({ ok: false });
    expect(await admitCall(feed)).toMatchObject({ ok: false });
    // A person's key is limited alone.
    const ben = await w.person("member");
    const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Mine", scopes: ["values:submit"], expiresOn: inDays(5) });
    expect(await admitCall((await actorForKey(secret))!)).toEqual({ ok: true });
  });
  it("never imports further back than the 1,000 periods a Feed is told about", async () => {
    const { m, feed } = await withFeed({ period: "month" });
    const r = await submitFeedObservations(feed, [{ metric: m.slug, value: 1, period: "1900-01-01" }, { metric: m.slug, value: 1, period: monthsAgo(999) }], quiet());
    expect(r.map((x) => "imported" in x && x.imported)).toEqual([false, true]);
  });
  it("shows the Owner how the Feed is doing", async () => {
    const { w, sara, m, feed } = await withFeed({ submission_rule: "reject" });
    await submitFeedObservations(feed, [{ metric: m.slug, value: 1 }, { metric: m.slug, value: 2 }], quiet());
    const [info] = await listFeeds(w.actor(sara));
    expect(info).toMatchObject({ name: "CRM", recorded_today: 1, refused_today: 1, metrics: [{ id: m.id, name: "Field visits" }] });
    expect(info.last_call).not.toBeNull();
  });
});
