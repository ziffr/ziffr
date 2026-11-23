// Filled-in Values against the real database (spec 0046, ticket #800; GLOSSARY: Filled-in Value, Stand-in, Away, Due
// Date, Submission Rule, Lock, Prompt, Audit Log, Quiet Hours): who may fill in and when, how it is recorded and marked,
// the Stand-in's answer, replacing it, and what is told and recorded.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { DemoReadOnly } from "./demo";
import { fillInValue } from "./fill-in";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { recordOwnValue } from "./record-own-value";
import { setMyQuietHours } from "./quiet-hours";
import { submissionEffects, submitValue, type SubmissionEffects } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { opened, workspace } from "./test/db-fixtures";
import { metricHistory } from "./dashboards";
import { archivedMetricHolds } from "./internal/delivery-send";
import { decideCorrection } from "./submissions";
import { saveWorkflow, setAway, setStandIn } from "./workflows";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: submissionEffects.afterValue });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const ago = (n: number) => shiftPeriod(thisMonth(), "month", -n);
const today = () => new Date().toISOString().slice(0, 10);
const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** Ben owns the Metric (rule "reject"), Mia its Workflow, Sara submits it and Tom is her Stand-in; everyone sees it. */
async function setup(o: { rule?: string; workflow?: boolean } = {}) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member"); const mia = await w.person("member"); const zed = await w.person("member");
  const sara = await w.person("member", { email: mail("sara") }); const tom = await w.person("member", { email: mail("tom") });
  const m = await w.metric(ben, { name: "Cost", submission_rule: o.rule ?? "reject" });
  if (o.workflow !== false) {
    const wf = await saveWorkflow(w.actor(mia, "member"), null, "Close", { dueWorkingDays: 2, steps: [{ type: "publish", lock: false }] });
    await w.patchMetric(m.id, { workflow_id: wf });
  }
  for (const p of [mia, zed, sara, tom]) await w.share(m.id, p);
  const saraCode = await w.token(m.id, sara);
  await db().from("tokens").update({ stand_in_id: tom }).eq("metric_id", m.id).eq("submitter_id", sara);
  const tomCode = await w.token(m.id, tom, { stands_in_for: sara, expires_at: new Date(Date.now() + 86_400_000 * 10).toISOString().slice(0, 10) });
  const as = (p: string) => w.actor(p, "member");
  return { w, ben, mia, zed, sara, tom, m, saraCode, tomCode, as };
}
const rowsOf = async (metricId: number, period: string) => (await db().from("observations").select("id, submitter_id, entered_by, source").eq("metric_id", metricId).eq("period_start", period)).data ?? [];
const kindsOf = async (ws: string) => ((await db().from("audit_events").select("kind").eq("workspace_id", ws)).data ?? []).map((e) => e.kind as string);

describe("fillInValue: who and when", () => {
  it("records the owner's value as the submitter's, marked, and tells the submitter", async () => {
    const { w, ben, sara, m, as } = await setup();
    const r = await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "42" }, quiet());
    expect(r).toMatchObject({ ok: true, outcome: "recorded" });
    expect(await rowsOf(m.id, ago(2))).toEqual([expect.objectContaining({ submitter_id: sara, entered_by: ben, source: "web_form" })]);
    const events = await opened("audit_events", w.id, (await db().from("audit_events").select("id, kind, details").eq("workspace_id", w.id).eq("kind", "value.filled_in")).data, { dropId: true });
    expect(events).toHaveLength(1);
    expect(events[0].details).toEqual({ period: ago(2), for: sara, as: "metric_owner", away_set_by: null });
    // The value itself never reaches the Audit Log.
    expect(Object.keys(events[0].details as object).sort()).toEqual(["as", "away_set_by", "for", "period"]);
    const told = await opened("deliveries", w.id, (await db().from("deliveries").select("id, subject, body, kind, recipient_id, not_before").eq("workspace_id", w.id).eq("kind", "filled_in")).data, { dropId: true });
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ recipient_id: sara });
    expect(told[0].body).toContain("42");
    expect(told[0].body).toContain("until the period is locked");
  });

  it("lets the Workflow's owner fill in, recorded as that role", async () => {
    const { w, mia, sara, m, as } = await setup();
    expect(await fillInValue(as(mia), { metricId: m.id, period: ago(2), for: sara, value: 7 }, quiet())).toMatchObject({ ok: true });
    const [e] = await opened("audit_events", w.id, (await db().from("audit_events").select("id, details").eq("kind", "value.filled_in").eq("workspace_id", w.id)).data, { dropId: true });
    expect(e.details).toMatchObject({ as: "workflow_owner" });
  });

  it("refuses everyone else, with words, and records nothing", async () => {
    const { w, zed, sara, m, as } = await setup();
    const guest = await w.person("guest"); await w.share(m.id, guest);
    const refused = async (actor: ReturnType<typeof as>, re: RegExp) => {
      const r = await fillInValue(actor, { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet());
      expect(r.ok).toBe(false); expect(r.detail).toMatch(re);
    };
    await refused(as(zed), /Only the Metric's owner/);
    await refused(w.actor(guest, "guest"), /Guest/);
    await refused(as(sara), /own value/);
    expect(await rowsOf(m.id, ago(2))).toEqual([]);
    expect(await kindsOf(w.id)).not.toContain("value.filled_in");
  });

  it("refuses an Access Key and the demo", async () => {
    const { ben, sara, m, w } = await setup();
    await expect(fillInValue({ ...w.actor(ben, "member"), key: { id: 1, scopes: ["write"] } } as never, { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet())).rejects.toBeInstanceOf(Forbidden);
    await expect(fillInValue({ personId: ben, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, { metricId: m.id, period: ago(2), for: sara, value: "5" })).rejects.toBeInstanceOf(DemoReadOnly);
  });

  it("waits for the Due Date, unless the submitter is Away", async () => {
    const { ben, sara, m, as } = await setup();
    const early = await fillInValue(as(ben), { metricId: m.id, period: thisMonth(), for: sara, value: "5" }, quiet());
    expect(early).toMatchObject({ ok: false, outcome: "rejected_fill_in" });
    expect(early.detail).toMatch(/after the Due Date/);
    await db().from("away").insert({ user_id: sara, starts: today(), ends: today(), set_by: sara });
    expect(await fillInValue(as(ben), { metricId: m.id, period: thisMonth(), for: sara, value: "5" }, quiet())).toMatchObject({ ok: true });
  });

  it("without a Workflow has no Due Date: only while Away", async () => {
    const { ben, sara, m, as } = await setup({ workflow: false });
    expect((await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet())).detail).toMatch(/Without a Workflow/);
    await db().from("away").insert({ user_id: sara, starts: today(), ends: today(), set_by: sara });
    expect(await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet())).toMatchObject({ ok: true });
  });

  it("refuses a period with a value, a locked period and a rule that adds up", async () => {
    const { w, ben, sara, m, as } = await setup();
    await w.value(m.id, ago(2), 1, sara);
    expect((await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet())).detail).toMatch(/already has a value/);
    await w.lock(m.id, ago(3));
    expect((await fillInValue(as(ben), { metricId: m.id, period: ago(3), for: sara, value: "5" }, quiet())).detail).toMatch(/locked/);
    const added = await setup({ rule: "add" });
    expect((await fillInValue(added.as(added.ben), { metricId: added.m.id, period: ago(2), for: added.sara, value: "5" }, quiet())).detail).toMatch(/several people/);
  });

  it("refuses someone who does not submit the Metric", async () => {
    const { ben, zed, m, as } = await setup();
    expect((await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: zed, value: "5" }, quiet())).detail).toMatch(/does not submit/);
  });

  it("the database itself refuses a value entered over another, or under a rule that combines people's values", async () => {
    const { w, ben, sara, m } = await setup();
    await w.value(m.id, ago(2), 1, sara);
    const call = (metric: number, expectId: number | null, expectCount: number, newId: number) => db().rpc("record_value", { p_metric: metric, p_period: ago(2), p_op: "insert", p_new_id: newId, p_value: 3, p_value_sealed: null, p_submitter: sara, p_source: "web_form", p_access_key: null, p_imported: false, p_expect_id: expectId, p_expect_count: expectCount, p_expect_value: null, p_expect_rows: null, p_rows: [], p_entered_by: ben });
    const { data: have } = await db().from("observations").select("id").eq("metric_id", m.id).single();
    expect((await call(m.id, have!.id, 1, 9_000_001)).error?.code).toBe("ZF450");
    const added = await setup({ rule: "add" });
    expect((await call(added.m.id, null, 0, 9_000_002)).error?.code).toBe("ZF451");
  });
});

describe("a Stand-in's answer", () => {
  it("becomes the submitter's value, entered by the Stand-in, and closes the Prompts", async () => {
    const { w, sara, tom, m, tomCode } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: tom, standingInFor: sara, period: ago(2), queue: true });
    await deliverPrompt({ metricId: m.id, submitterId: sara, period: ago(2), queue: true });
    const { data: prompts } = await db().from("prompts").select("id, submitter_id, stands_in_for").eq("metric_id", m.id);
    const theirs = prompts!.find((p) => p.submitter_id === tom)!;
    expect(theirs.stands_in_for).toBe(sara);
    const r = await submitValue({ source: "web_form", sender: tomCode, text: "42", promptId: theirs.id, workspaceId: w.id }, quiet());
    expect(r.ok).toBe(true);
    expect(await rowsOf(m.id, ago(2))).toEqual([expect.objectContaining({ submitter_id: sara, entered_by: tom })]);
    expect(((await db().from("prompts").select("answered_at").eq("metric_id", m.id)).data ?? []).every((p) => p.answered_at)).toBe(true);
    const [e] = await opened("audit_events", w.id, (await db().from("audit_events").select("id, details").eq("kind", "value.filled_in").eq("workspace_id", w.id)).data, { dropId: true });
    expect(e.details).toMatchObject({ as: "stand_in", for: sara });
  });

  it("only for a period they were asked about, and not through an Access Key", async () => {
    const { w, sara, tom, m, as, tomCode } = await setup();
    await deliverPrompt({ metricId: m.id, submitterId: tom, standingInFor: sara, period: ago(2), queue: true });
    const other = await recordOwnValue(as(tom), m.id, { value: "5", period: ago(3) }, quiet());
    expect(other).toMatchObject({ ok: false, outcome: "rejected_fill_in" });
    expect(other.detail).toMatch(/only for the periods you were asked about/);
    const key = await submitValue({ source: "api", sender: tomCode, text: "5", value: { value: 5 }, period: ago(2), workspaceId: w.id }, quiet());
    expect(key).toMatchObject({ ok: false, outcome: "rejected_fill_in" });
    expect(await rowsOf(m.id, ago(2))).toEqual([]);
    // Asked, answered in the app: recorded as Sara's.
    expect(await recordOwnValue(as(tom), m.id, { value: "5", period: ago(2) }, quiet())).toMatchObject({ ok: true });
    expect(await rowsOf(m.id, ago(2))).toEqual([expect.objectContaining({ submitter_id: sara, entered_by: tom })]);
  });

  it("is refused for a Guest Stand-in, who answers as their own as before; and a Guest cannot be chosen", async () => {
    const { w, ben, sara, m } = await setup();
    const guest = await w.person("guest");
    await expect(setStandIn(w.actor(ben, "member"), m.id, sara, guest)).rejects.toThrow(/Guest cannot stand in/);
  });
});

describe("replacing and locking", () => {
  it("the submitter's own value replaces it under 'reject', and the Filled-in Value stays in the history", async () => {
    const { w, ben, sara, m, as } = await setup();
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "42" }, quiet());
    const r = await recordOwnValue(as(sara), m.id, { value: "40", period: ago(2) }, quiet());
    expect(r).toMatchObject({ ok: true, outcome: "overwritten" });
    expect(r.detail).toMatch(/entered by .* for you/);
    expect(await rowsOf(m.id, ago(2))).toEqual([expect.objectContaining({ submitter_id: sara, entered_by: null })]);
    const { data: history } = await db().from("observation_history").select("entered_by, submitter_id").eq("metric_id", m.id).eq("workspace_id", w.id);
    expect(history).toEqual([{ entered_by: ben, submitter_id: sara }]);
    // A second value after that meets the rule as any value does.
    expect((await recordOwnValue(as(sara), m.id, { value: "41", period: ago(2) }, quiet())).outcome).toBe("rejected_duplicate");
  });

  it("someone else cannot fill in over a Filled-in Value", async () => {
    const { ben, mia, sara, m, as } = await setup();
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "42" }, quiet());
    expect((await fillInValue(as(mia), { metricId: m.id, period: ago(2), for: sara, value: "1" }, quiet())).detail).toMatch(/already has a value/);
  });

  it("after the Lock the submitter's value is a proposed Correction, not a replacement", async () => {
    const { w, ben, sara, m, as } = await setup();
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "42" }, quiet());
    await db().from("period_states").upsert({ metric_id: m.id, period_start: ago(2), state: "locked", workspace_id: w.id });
    const r = await recordOwnValue(as(sara), m.id, { value: "40", period: ago(2) }, quiet());
    expect(r.outcome).toBe("proposed_locked");
    expect(await rowsOf(m.id, ago(2))).toEqual([expect.objectContaining({ entered_by: ben })]);
  });
});

describe("telling the submitter", () => {
  it("names who entered it to a member, and nobody to a Guest or a Contact", async () => {
    const { w, ben, m, as } = await setup();
    const guest = await w.person("guest", { email: mail("gus") }); await w.share(m.id, guest); await w.token(m.id, guest);
    const contact = await w.contact({ email: mail("cat") });
    await w.token(m.id, contact);
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: guest, value: "3" }, quiet());
    await fillInValue(as(ben), { metricId: m.id, period: ago(3), for: contact, value: "4" }, quiet());
    const rows = await opened("deliveries", w.id, (await db().from("deliveries").select("id, recipient_id, subject, body").eq("workspace_id", w.id).eq("kind", "filled_in")).data, { dropId: true });
    const benName = (await db().from("profiles").select("name").eq("id", ben).single()).data!.name as string;
    expect(rows).toHaveLength(2);
    for (const d of rows) {
      expect(d.body).toMatch(/A colleague entered/);
      expect(`${d.subject} ${d.body}`).not.toContain(benName);
    }
    // The Contact's message carries their personal form link, put in as it is sent.
    expect(rows.find((d) => d.recipient_id === contact)!.body).toContain("[your personal form link]");
  });

  it("waits out the submitter's Quiet Hours", async () => {
    const { ben, sara, m, as, w } = await setup();
    // Mail must be set up for the message to be queued, as the other Quiet Hours tests do.
    const saved = { url: process.env.ZIFFR_SMTP_URL, from: process.env.ZIFFR_MAIL_FROM, site: process.env.ZIFFR_SITE_URL };
    process.env.ZIFFR_SMTP_URL = process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425"; process.env.ZIFFR_MAIL_FROM = "Ziffr <ziffr@example.test>"; process.env.ZIFFR_SITE_URL = "https://ziffr.example.test";
    try {
    const h = new Date().getUTCHours();
    await setMyQuietHours(as(sara), { fromHour: (h + 23) % 24, toHour: (h + 2) % 24, days: [], timeZone: null });
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "3" }, quiet());
    const { data } = await db().from("deliveries").select("not_before").eq("workspace_id", w.id).eq("kind", "filled_in");
    expect(data?.[0]?.not_before).not.toBeNull();
    } finally {
      for (const [k, v] of [["ZIFFR_SMTP_URL", saved.url], ["ZIFFR_MAIL_FROM", saved.from], ["ZIFFR_SITE_URL", saved.site]] as const) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
});

describe("Away opens filling in only when set by the person or an Owner or Admin of the Workspace", () => {
  it("does not open for Away set by an Admin of another Workspace, and does for Away set by this Workspace's Admin", async () => {
    const { w, ben, sara, m, as } = await setup({ workflow: false });
    const other = await workspace(); cleanups.push(other.cleanup);
    const stranger = await other.person("admin");
    await db().from("away").insert({ user_id: sara, starts: today(), ends: today(), set_by: stranger });
    const r = await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet());
    expect(r).toMatchObject({ ok: false, outcome: "rejected_fill_in" });
    expect(r.detail).toMatch(/only while the submitter is Away/);
    const admin = await w.person("admin");
    await setAway(w.actor(admin, "admin"), sara, today(), today());
    expect(await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet())).toMatchObject({ ok: true });
    const [e] = await opened("audit_events", w.id, (await db().from("audit_events").select("id, details").eq("kind", "value.filled_in").eq("workspace_id", w.id)).data, { dropId: true });
    expect(e.details).toMatchObject({ away_set_by: admin });
    expect(await kindsOf(w.id)).toContain("away.set");
  });
});

describe("what follows a Filled-in Value", () => {
  it("is not an Import, and a submitter's merged Contact never ends up as who entered their own value", async () => {
    const { w, ben, sara, m, as } = await setup();
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet());
    expect((await db().from("observations").select("imported").eq("metric_id", m.id).single()).data?.imported).toBe(false);
    const contact = await w.contact({ email: mail("c") });
    const real = await w.person("member");
    await w.value(m.id, ago(5), 3, contact);
    await db().from("observations").update({ entered_by: real }).eq("metric_id", m.id).eq("period_start", ago(5));
    expect((await db().rpc("merge_contact", { ws: w.id, contact, person: real })).error).toBeNull();
    expect((await db().from("observations").select("submitter_id, entered_by").eq("metric_id", m.id).eq("period_start", ago(5)).single()).data).toEqual({ submitter_id: real, entered_by: null });
  });

  it("the message is not sent after the value was replaced, or to someone who became a Guest", async () => {
    const { w, ben, sara, m, as } = await setup();
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet());
    const { data: d } = await db().from("deliveries").select("id, workspace_id, kind, recipient_id, alert_metric_id, sender_id, filled_in_observation_id").eq("workspace_id", w.id).eq("kind", "filled_in").single();
    expect(await archivedMetricHolds(d!)).toBeNull();
    await w.setRole(sara, "guest");
    expect(await archivedMetricHolds(d!)).toBe("Not sent.");
    await w.setRole(sara, "member");
    await recordOwnValue(as(sara), m.id, { value: "4", period: ago(2) }, quiet());
    expect(await archivedMetricHolds(d!)).toBe("Not sent.");
  });

  it("a Correction to a value its owner entered is decided by someone else, and the submitter's own clears the mark", async () => {
    const { w, ben, sara, m, as } = await setup();
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet());
    await db().from("period_states").upsert({ metric_id: m.id, period_start: ago(2), state: "locked", workspace_id: w.id });
    const { data: obs } = await db().from("observations").select("id").eq("metric_id", m.id).single();
    const action = await w.action({ metric_id: m.id, period_start: ago(2), asker_id: sara, assignee_id: ben, observation_id: obs!.id, purpose: "approval" });
    const { data: msg } = await db().from("thread_messages").insert({ action_id: action, author_id: sara, workspace_id: w.id, body: "Late", correction_value: 6, correction_status: "proposed" }).select("id").single();
    await expect(decideCorrection(as(ben), msg!.id, true, { notifyDecision: vi.fn(async () => {}), afterValue: vi.fn(async () => []) })).rejects.toThrow(/someone else decides/);
    await expect(decideCorrection(as(ben), msg!.id, false, { notifyDecision: vi.fn(async () => {}), afterValue: vi.fn(async () => []) })).rejects.toThrow(/someone else decides/);
    // Handed to an owner who did not enter it: accepted, and the value is Sara's own now.
    await db().from("metrics").update({ owner_id: (await w.person("member")) }).eq("id", m.id);
    const newOwner = (await db().from("metrics").select("owner_id").eq("id", m.id).single()).data!.owner_id as string;
    await decideCorrection(as(newOwner), msg!.id, true, { notifyDecision: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });
    expect((await db().from("observations").select("submitter_id, entered_by").eq("id", obs!.id).single()).data).toEqual({ submitter_id: sara, entered_by: null });
  });

  it("a Guest's history read carries neither who submitted a value nor who entered it", async () => {
    const { w, ben, sara, m, as } = await setup();
    const guest = await w.person("guest"); await w.share(m.id, guest);
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "5" }, quiet());
    const member = await metricHistory(as(sara), m.id);
    expect(member.observations[0]).toMatchObject({ submitter_id: sara, entered_by: ben });
    const seen = await metricHistory(w.actor(guest, "guest"), m.id);
    expect(seen.observations).toHaveLength(1);
    expect(seen.observations[0]).not.toHaveProperty("submitter_id");
    expect(seen.observations[0]).not.toHaveProperty("entered_by");
    expect(JSON.stringify(seen)).not.toContain(ben);
    expect(JSON.stringify(seen)).not.toContain(sara);
  });
});
