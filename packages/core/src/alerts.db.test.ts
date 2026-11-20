// Alerts against the real database (spec 0032, ticket #373; GLOSSARY: Alert): making, changing, pausing and deleting
// one's own; only for Metrics the person sees, answered alike for ones that are not there; the limits, also when
// Alerts are made at once; a Guest; another Workspace; the demo; the sealed level; sight lost and the 180 days.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { ALERTS_PER_METRIC, ALERTS_PER_PERSON, ALERTS_PER_WORKSPACE } from "./alert-limits";
import type { AlertCondition } from "./alert-rules";
import { ALERT_NO_ACCESS_DAYS, createAlert, deleteAlert, listMyAlerts, refreshAlertSight, updateAlert } from "./alerts";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { saveWorkflow, setMetricWorkflow } from "./workflows";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const above = (value: string): AlertCondition => ({ kind: "at_or_above", value });
const share = async (w: Awaited<ReturnType<typeof ws>>, metricId: number, userId: string) => { await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metricId, user_id: userId, role: "viewer" }); };
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);

describe("making, changing, pausing and deleting", () => {
  it("lets a person make, read, change, pause, resume and delete their own Alert", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Cash" }); await share(w, m.id, ann);
    const a = w.actor(ann, "member");
    const id = await createAlert(a, { metricId: m.id, condition: { kind: "below", value: "10000" }, delivery: "email", includeUnapproved: true });
    expect(await listMyAlerts(a)).toEqual([expect.objectContaining({ id, metric: expect.objectContaining({ name: "Cash" }), condition: { kind: "below", value: "10000" }, delivery: "email", includeUnapproved: true, pausedByPerson: false, paused: null, state: "armed", firedAt: null })]);
    await updateAlert(a, id, { condition: { kind: "at_or_above", value: "-0.5" }, delivery: "usual", includeUnapproved: false });
    expect((await listMyAlerts(a, m.id))[0]).toMatchObject({ condition: { kind: "at_or_above", value: "-0.5" }, delivery: "usual", includeUnapproved: false });
    await updateAlert(a, id, { paused: true });
    expect((await listMyAlerts(a))[0]).toMatchObject({ pausedByPerson: true, paused: null });
    await updateAlert(a, id, { paused: false });
    expect((await listMyAlerts(a))[0]).toMatchObject({ pausedByPerson: false, paused: null });
    await deleteAlert(a, id);
    expect(await listMyAlerts(a)).toEqual([]);
  });

  it("arms a changed Alert again", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara);
    const a = w.actor(sara);
    const id = await createAlert(a, { metricId: m.id, condition: above("5") });
    await db().from("alerts").update({ state: "fired", fired_at: new Date().toISOString(), fired_period: "2026-10-01" }).eq("id", id);
    expect((await listMyAlerts(a))[0].state).toBe("fired");
    await updateAlert(a, id, { condition: above("6") });
    expect((await listMyAlerts(a))[0]).toMatchObject({ state: "armed", firedAt: null });
  });

  it("seals the level, so the database holds no readable number", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara);
    const id = await createAlert(w.actor(sara), { metricId: m.id, condition: above("123456.789") });
    const { data } = await db().from("alerts").select("level, kind").eq("id", id).single();
    expect(data?.kind).toBe("at_or_above");
    // Without ZIFFR_SECRETS_KEY nothing is sealed, which the sealed-column tests cover: here it reads back either way.
    if (process.env.ZIFFR_SECRETS_KEY) expect(data?.level).not.toContain("123456");
    expect((await listMyAlerts(w.actor(sara)))[0].condition).toEqual(above("123456.789"));
  });

  it("refuses a malformed condition, way of delivery or option", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara); const a = w.actor(sara);
    const bad = [
      { metricId: m.id, condition: { kind: "at_or_above", value: "1e9" } },
      { metricId: m.id, condition: { kind: "changed_more", share: "0" } },
      { metricId: m.id, condition: { kind: "changed_more", share: "1001" } },
      { metricId: m.id, condition: { kind: "nonsense" } },
      { metricId: m.id, condition: null },
      { metricId: m.id, condition: above("5"), delivery: "sms" },
      { metricId: m.id, condition: above("5"), includeUnapproved: "yes" },
    ];
    for (const input of bad) expect(await refusal(createAlert(a, input as never))).toBeInstanceOf(Error);
    expect(await listMyAlerts(a)).toEqual([]);
  });

  it("needs a target for a share of target, a Workflow for not-in-by-its-Due-Date, and a Metric in use", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    const plain = await w.metric(sara, { name: "Plain" });
    expect((await refusal(createAlert(a, { metricId: plain.id, condition: { kind: "share_of_target", share: "80" } })))?.message).toMatch(/no target/);
    expect((await refusal(createAlert(a, { metricId: plain.id, condition: { kind: "missing_after_due" } })))?.message).toMatch(/no Workflow/);
    const zero = await w.metric(sara, { name: "Zero", target_min: 0 });
    expect(await refusal(createAlert(a, { metricId: zero.id, condition: { kind: "share_of_target", share: "80" } }))).toBeInstanceOf(Error);
    const aimed = await w.metric(sara, { name: "Aimed", target_min: 50000 });
    expect(await createAlert(a, { metricId: aimed.id, condition: { kind: "share_of_target", share: "80" } })).toBeGreaterThan(0);
    const flowed = await w.metric(sara, { name: "Flowed" });
    await setMetricWorkflow(a, flowed.id, await saveWorkflow(a, null, "Close", { dueWorkingDays: 2, steps: [] }));
    expect(await createAlert(a, { metricId: flowed.id, condition: { kind: "missing_after_due" } })).toBeGreaterThan(0);
    const old = await w.metric(sara, { name: "Old", archived_at: new Date().toISOString() });
    expect((await refusal(createAlert(a, { metricId: old.id, condition: above("1") })))?.message).toMatch(/archived/);
  });
});

describe("who may see what", () => {
  it("answers a Metric the person cannot see like one that is not there", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const secret = await w.metric(sara, { name: "Secret margin" });
    const a = w.actor(ann, "member");
    const hidden = await refusal(createAlert(a, { metricId: secret.id, condition: above("1") }));
    const missing = await refusal(createAlert(a, { metricId: 999_999_999, condition: above("1") }));
    expect(hidden).toBeInstanceOf(Forbidden);
    expect(hidden?.message).toBe(missing?.message);
    expect(hidden?.message).not.toMatch(/Secret/);
    expect((await db().from("alerts").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
  });

  it("hides an Alert once sight is lost, silences it without a word, resumes it when sight returns, and removes it after 180 days", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Cash" }); await share(w, m.id, ann);
    const a = w.actor(ann, "member");
    const id = await createAlert(a, { metricId: m.id, condition: above("5") });
    await db().from("shares").delete().eq("object_id", m.id).eq("user_id", ann);
    // Immediately, before any bookkeeping, nothing is shown and nothing can be changed.
    expect(await listMyAlerts(a)).toEqual([]);
    expect(await refusal(updateAlert(a, id, { paused: true }))).toBeInstanceOf(Forbidden);
    // Deleting says the same as for an Alert that is not there, so it never confirms that the Metric still exists.
    expect((await refusal(deleteAlert(a, id)))?.message).toBe((await refusal(deleteAlert(a, 999_999_999)))?.message);
    expect(await refreshAlertSight(w.id)).toMatchObject({ paused: 1, resumed: 0 });
    const { data: stored } = await db().from("alerts").select("paused, no_access_since").eq("id", id).single();
    expect(stored?.paused).toBe("no_access");
    expect(stored?.no_access_since).not.toBeNull();
    expect(await listMyAlerts(a)).toEqual([]);
    // Sight returns: the Alert is back, resumed.
    await share(w, m.id, ann);
    expect(await refreshAlertSight(w.id)).toMatchObject({ paused: 0, resumed: 1 });
    expect((await listMyAlerts(a))[0]).toMatchObject({ id, paused: null });
    // Lost again for over 180 days: removed.
    await db().from("shares").delete().eq("object_id", m.id).eq("user_id", ann);
    await refreshAlertSight(w.id);
    await db().from("alerts").update({ no_access_since: new Date(Date.now() - (ALERT_NO_ACCESS_DAYS + 1) * 86_400_000).toISOString() }).eq("id", id);
    expect((await refreshAlertSight(w.id)).removed).toBeGreaterThanOrEqual(1);
    expect((await db().from("alerts").select("id").eq("id", id)).data).toEqual([]);
  });

  it("pauses an Alert on an Archived Metric and resumes it with the Metric", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    const m = await w.metric(sara);
    const id = await createAlert(a, { metricId: m.id, condition: above("5") });
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", m.id);
    await refreshAlertSight(w.id);
    expect((await listMyAlerts(a))[0].paused).toBe("archived");
    await db().from("metrics").update({ archived_at: null }).eq("id", m.id);
    await refreshAlertSight(w.id);
    expect((await listMyAlerts(a))[0]).toMatchObject({ id, paused: null });
  });

  it("keeps the person's own pause through losing and regaining sight, and the system's pause through their resume", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await share(w, m.id, ann);
    const a = w.actor(ann, "member");
    const id = await createAlert(a, { metricId: m.id, condition: above("5") });
    await updateAlert(a, id, { paused: true });
    await db().from("shares").delete().eq("object_id", m.id).eq("user_id", ann);
    await refreshAlertSight(w.id);
    await share(w, m.id, ann);
    await refreshAlertSight(w.id);
    expect((await listMyAlerts(a))[0]).toMatchObject({ pausedByPerson: true, paused: null });
    await db().from("alerts").update({ paused: "no_target" }).eq("id", id);
    await updateAlert(a, id, { paused: false });
    expect((await listMyAlerts(a))[0]).toMatchObject({ pausedByPerson: false, paused: "no_target" });
    await updateAlert(a, id, { condition: above("6") });
    expect((await listMyAlerts(a))[0]).toMatchObject({ paused: null });
  });

  it("counts an Alert on a Metric the person lost sight of against their limits, so losing and regaining sight cannot pass them", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const a = w.actor(ann, "member");
    const gone = await w.metric(sara, { name: "Gone" }); await share(w, gone.id, ann);
    for (let i = 0; i < ALERTS_PER_METRIC; i++) await createAlert(a, { metricId: gone.id, condition: above(String(i)) });
    await db().from("shares").delete().eq("object_id", gone.id).eq("user_id", ann);
    await refreshAlertSight(w.id);
    for (let k = 0; k < 3; k++) {
      const m = await w.metric(sara); await share(w, m.id, ann);
      for (let i = 0; i < ALERTS_PER_METRIC; i++) await createAlert(a, { metricId: m.id, condition: above(String(i)) }).catch(() => null);
    }
    // 5 hidden + 15 visible reach the limit of 20; nothing more is made, and regaining sight cannot make 25.
    expect(await listMyAlerts(a)).toHaveLength(ALERTS_PER_PERSON - ALERTS_PER_METRIC);
    const more = await w.metric(sara); await share(w, more.id, ann);
    expect((await refusal(createAlert(a, { metricId: more.id, condition: above("1") })))?.message).toMatch(/20 Alerts/);
    await share(w, gone.id, ann); await refreshAlertSight(w.id);
    expect(await listMyAlerts(a)).toHaveLength(ALERTS_PER_PERSON);
  });

  it("ends a person's Alerts when they leave the Workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await share(w, m.id, ann);
    const id = await createAlert(w.actor(ann, "member"), { metricId: m.id, condition: above("5") });
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", ann);
    expect((await db().from("alerts").select("id").eq("id", id)).data).toEqual([]);
  });

  it("lets a Guest set an Alert on a Metric shared with them and on no other", async () => {
    const w = await ws(); const sara = await w.person("owner"); const gus = await w.person("guest");
    const open = await w.metric(sara, { name: "Shared" }); const closed = await w.metric(sara, { name: "Closed" });
    await share(w, open.id, gus);
    const g = w.actor(gus, "guest");
    expect(await createAlert(g, { metricId: open.id, condition: above("1") })).toBeGreaterThan(0);
    expect(await refusal(createAlert(g, { metricId: closed.id, condition: above("1") }))).toBeInstanceOf(Forbidden);
    expect((await listMyAlerts(g)).map((x) => x.metric.name)).toEqual(["Shared"]);
  });

  it("keeps a person's Alerts to themselves, also from an Owner, and never crosses Workspaces", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member"); const bob = await w.person("member");
    const m = await w.metric(sara); await share(w, m.id, ann); await share(w, m.id, bob);
    const id = await createAlert(w.actor(ann, "member"), { metricId: m.id, condition: above("5") });
    for (const who of [w.actor(sara), w.actor(bob, "member")]) {
      expect(await listMyAlerts(who)).toEqual([]);
      expect(await refusal(updateAlert(who, id, { paused: true }))).toBeInstanceOf(Forbidden);
      expect(await refusal(deleteAlert(who, id))).toBeInstanceOf(Forbidden);
    }
    expect((await db().from("alerts").select("paused").eq("id", id).single()).data?.paused).toBeNull();
    const other = await ws(); const eve = await other.person("owner");
    // Another Workspace's owner names this Metric's id: it is not theirs to see.
    expect(await refusal(createAlert(other.actor(eve), { metricId: m.id, condition: above("5") }))).toBeInstanceOf(Forbidden);
    // Nor is an Alert id of another Workspace theirs, even for the same person id in a forged Actor.
    expect(await refusal(deleteAlert(other.actor(ann, "member"), id))).toBeInstanceOf(Forbidden);
    expect((await db().from("alerts").select("id").eq("id", id)).data).toHaveLength(1);
  });

  it("refuses a person without a membership in the Workspace, in the database too", async () => {
    const w = await ws(); const sara = await w.person("owner"); const contact = await w.contact({ email: "c@example.test" });
    const m = await w.metric(sara);
    const { data } = await db().rpc("create_alert", { p_id: 1, p_ws: w.id, p_person: contact, p_metric: m.id, p_kind: "missing_after_due", p_level: null, p_delivery: "usual", p_include: false, p_per_person: 20, p_per_metric: 5, p_per_workspace: 500 });
    expect(data).toBe("not_a_member");
  });
});

describe("the limits", () => {
  it("refuses the 6th Alert on a Metric and the 21st for a person, in words", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    const m = await w.metric(sara);
    for (let i = 0; i < ALERTS_PER_METRIC; i++) await createAlert(a, { metricId: m.id, condition: above(String(i)) });
    expect((await refusal(createAlert(a, { metricId: m.id, condition: above("99") })))?.message).toMatch(/5 Alerts on this Metric/);
    for (let k = 0; k < 3; k++) {
      const other = await w.metric(sara);
      for (let i = 0; i < ALERTS_PER_METRIC && (await listMyAlerts(a)).length < ALERTS_PER_PERSON; i++) await createAlert(a, { metricId: other.id, condition: above(String(i)) });
    }
    expect(await listMyAlerts(a)).toHaveLength(ALERTS_PER_PERSON);
    const fresh = await w.metric(sara);
    expect((await refusal(createAlert(a, { metricId: fresh.id, condition: above("1") })))?.message).toMatch(/20 Alerts in this Workspace/);
  });

  it("refuses the 501st Alert in a Workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await share(w, m.id, ann);
    const rows = Array.from({ length: ALERTS_PER_WORKSPACE }, () => ({ workspace_id: w.id, person_id: sara, metric_id: m.id, kind: "missing_after_due" }));
    const { error } = await db().from("alerts").insert(rows);
    expect(error).toBeNull();
    expect((await refusal(createAlert(w.actor(ann, "member"), { metricId: m.id, condition: above("1") })))?.message).toMatch(/500 Alerts/);
  });

  it("does not let Alerts made at once pass a limit together", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    const m = await w.metric(sara);
    const onOne = await Promise.all(Array.from({ length: 12 }, (_, i) => refusal(createAlert(a, { metricId: m.id, condition: above(String(i)) }))));
    expect(onOne.filter((r) => r === null)).toHaveLength(ALERTS_PER_METRIC);
    expect(onOne.filter((r) => r !== null).every((r) => /5 Alerts on this Metric/.test(r!.message))).toBe(true);
    const metrics = await Promise.all(Array.from({ length: 5 }, () => w.metric(sara)));
    const spread = await Promise.all(Array.from({ length: 30 }, (_, i) => refusal(createAlert(a, { metricId: metrics[i % 5].id, condition: above(String(i)) }))));
    expect(spread.filter((r) => r === null)).toHaveLength(ALERTS_PER_PERSON - ALERTS_PER_METRIC);
    expect(await listMyAlerts(a)).toHaveLength(ALERTS_PER_PERSON);
  });
});

describe("the demo", () => {
  it("is read-only: nobody sets, changes or deletes an Alert there", async () => {
    const a = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
    expect(await refusal(createAlert(a, { metricId: 1, condition: above("1") }))).toBeInstanceOf(DemoReadOnly);
    expect(await refusal(updateAlert(a, 1, { paused: true }))).toBeInstanceOf(DemoReadOnly);
    expect(await refusal(deleteAlert(a, 1))).toBeInstanceOf(DemoReadOnly);
    // The database refuses it too, whatever the core says: its guard runs before any row is checked.
    expect(await refusal(Promise.resolve(db().from("alerts").insert({ workspace_id: DEMO_WORKSPACE_ID, person_id: a.personId, metric_id: 1, kind: "missing_after_due" })))).toBeInstanceOf(DemoReadOnly);
  });
});
