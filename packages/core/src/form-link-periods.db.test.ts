// Which periods a personal form link records, against the real database (GLOSSARY: Token, Prompt, Stand-in, Lock,
// Correction, Unusual Value): the running period or one asked of its Token that is still due; the other ways as before.
import { afterEach, describe, expect, it, vi } from "vitest";
import { actorForKey, createAccessKey } from "./access-keys";
import type { KeyActor } from "./actor";
import { submitObservation } from "./api-submissions";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { fillInValue } from "./fill-in";
import { LINK_PERIOD_REFUSED } from "./form-link-rules";
import { recordPastedValues } from "./paste-values";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { recordOwnValue } from "./record-own-value";
import { submissionEffects, submitValue, type SubmissionEffects } from "./submissions";
import { opened, valuesOf, workspace } from "./test/db-fixtures";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import type { WorkflowStep } from "./types";

// Set by one test only: stands for a request answered while the form was sending.
const stale = vi.hoisted(() => ({ asked: null as string[] | null }));
vi.mock("./asked-periods", async (original) => {
  const real = await original<typeof import("./asked-periods")>();
  return { askedPeriods: async (...args: Parameters<typeof real.askedPeriods>) => stale.asked ?? real.askedPeriods(...args) };
});

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { stale.asked = null; for (const c of cleanups.splice(0)) await c(); });
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: submissionEffects.afterValue });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const ago = (n: number) => shiftPeriod(thisMonth(), "month", -n);
/** A month as a link's holder or a message names it: "March 2026". */
const words = (period: string) => new Date(`${period}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** Ben owns a monthly Metric, Sara submits it. */
async function setup(o: { rule?: string } = {}) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const handle = `@sara-${Math.random().toString(36).slice(2, 8)}`;
  const address = mail("sara");
  const ben = await w.person("owner"); const sara = await w.person("member", { email: address, slack_handle: handle });
  const m = await w.metric(ben, { name: "Signups", submission_rule: o.rule ?? "overwrite" });
  await w.share(m.id, sara);
  const code = await w.token(m.id, sara);
  const ask = (period: string, submitterId = sara, standingInFor?: string) => deliverPrompt({ metricId: m.id, submitterId, period, standingInFor, queue: true });
  const link = (text: string, c = code, effects = quiet()) => submitValue({ source: "web_form", sender: c, text }, effects);
  const stored = async (period: string) => {
    const { data } = await db().from("observations").select("id, value, value_sealed").eq("metric_id", m.id).eq("period_start", period).order("created_at");
    return (await opened("observations", w.id, data)).map((r) => Number(r.value));
  };
  const proposals = async () => (await db().from("actions").select("id").eq("metric_id", m.id).eq("purpose", "approval")).data ?? [];
  /** A Workflow that only publishes, with a Due Date two working days after the period. */
  const due = async () => setMetricWorkflow(w.actor(ben), m.id, await saveWorkflow(w.actor(ben), null, "Close", { dueWorkingDays: 2, steps: [{ type: "publish", lock: false }] }));
  return { w, ben, sara, handle, address, m, code, ask, link, stored, proposals, due };
}
const refused = (slug: string) => ({ ok: false, ...LINK_PERIOD_REFUSED, metricSlug: slug });

describe("a form link and a period it was not asked for", () => {
  it.each(["reject", "overwrite", "add", "keep_both"])("records nothing under '%s'", async (rule) => {
    const { w, sara, m, link, stored } = await setup({ rule });
    await w.value(m.id, ago(2), 4711, sara);
    // Past periods and one still to come.
    for (const p of [ago(2), ago(3), shiftPeriod(thisMonth(), "month", 2)]) expect(await link(`${words(p)}: 5`)).toEqual(refused(m.slug));
    expect(await stored(ago(2))).toEqual([4711]);
    expect(await stored(ago(3))).toEqual([]);
  });

  it("records nothing for a locked one either", async () => {
    const { w, sara, m, link, stored, proposals } = await setup();
    await w.value(m.id, ago(2), 4711, sara);
    await w.lock(m.id, ago(2));
    expect(await link(`${words(ago(2))}: 5`)).toEqual(refused(m.slug));
    expect(await proposals()).toEqual([]);
    expect(await stored(ago(2))).toEqual([4711]);
  });

  it("still records the running period, named or not", async () => {
    const { link, stored } = await setup({ rule: "add" });
    expect(await link("5")).toMatchObject({ ok: true, outcome: "recorded" });
    expect(await link(`${words(thisMonth())}: 2`)).toMatchObject({ ok: true, outcome: "added" });
    expect(await stored(thisMonth())).toEqual([7]);
  });
});

describe("a form link and a period that was asked for", () => {
  it("records it once and answers the request", async () => {
    const { m, ask, link, stored } = await setup();
    await ask(ago(1));
    expect(await link(`${words(ago(1))}: 5`)).toMatchObject({ ok: true, outcome: "recorded" });
    expect(((await db().from("prompts").select("answered_at").eq("metric_id", m.id)).data ?? []).every((p) => p.answered_at)).toBe(true);
    // Answered now: a second value for it is refused like any other period.
    expect(await link(`${words(ago(1))}: 9`)).toEqual(refused(m.slug));
    expect(await stored(ago(1))).toEqual([5]);
  });

  it("is done with it once a value is in, whoever sent it", async () => {
    const { w, sara, m, ask, link, stored } = await setup({ rule: "add" });
    await ask(ago(1));
    await w.value(m.id, ago(1), 4711, sara);
    expect(await link(`${words(ago(1))}: 5`)).toEqual(refused(m.slug));
    expect(await stored(ago(1))).toEqual([4711]);
  });

  it("counts a request only for the Token it was sent for", async () => {
    const { w, sara, m, ask, link, stored, due } = await setup();
    // A Stand-in answers in someone's place once the value is due.
    await due();
    const ann = await w.person("member", { email: mail("ann") }); const tom = await w.person("member", { email: mail("tom") });
    const annCode = await w.token(m.id, ann);
    await db().from("tokens").update({ stand_in_id: tom }).eq("metric_id", m.id).eq("submitter_id", sara);
    const tomCode = await w.token(m.id, tom, { stands_in_for: sara, expires_at: new Date(Date.now() + 86_400_000 * 10).toISOString().slice(0, 10) });
    await ask(ago(1), tom, sara);
    expect(await link(`${words(ago(1))}: 5`)).toEqual(refused(m.slug));
    expect(await link(`${words(ago(1))}: 5`, annCode)).toEqual(refused(m.slug));
    expect(await stored(ago(1))).toEqual([]);
    expect(await link(`${words(ago(1))}: 5`, tomCode)).toMatchObject({ ok: true });
    expect(await stored(ago(1))).toEqual([5]);
  });

  it("proposes a Correction when it is locked and has no value", async () => {
    const { w, m, ask, link, stored } = await setup();
    await ask(ago(1));
    await w.lock(m.id, ago(1));
    expect(await link(`${words(ago(1))}: 5`)).toMatchObject({ ok: false, outcome: "proposed_locked" });
    expect(await stored(ago(1))).toEqual([]);
  });

  it.each(["reject", "overwrite", "add", "keep_both"])("treats a request answered in the meantime as done, under '%s'", async (rule) => {
    const { w, sara, m, link, stored } = await setup({ rule });
    await w.value(m.id, ago(2), 4711, sara);
    stale.asked = [ago(2)];
    expect(await link(`${words(ago(2))}: 5`)).toEqual(refused(m.slug));
    expect(await stored(ago(2))).toEqual([4711]);
  });
});

describe("a form link's reply about the Workflow", () => {
  it("is the short one; the signed-in way says why and who, as before", async () => {
    const { w, ben, sara, m, link } = await setup();
    await w.value(m.id, ago(1), 100, sara);
    const steps: WorkflowStep[] = [{ type: "check", changePct: 50, outsideTarget: false }, { type: "approve", approvers: [ben], values: "unusual" }, { type: "publish", lock: false }];
    await setMetricWorkflow(w.actor(ben), m.id, await saveWorkflow(w.actor(ben), null, "Check", { dueWorkingDays: 2, steps }));
    const r = await link("900");
    expect(r.detail).toMatch(/ Workflow: unusual, approval asked\.$/);
    const signedIn = await recordOwnValue(w.actor(sara, "member"), m.id, { value: "901" }, quiet());
    expect(signedIn.detail).toContain("unusual (up ");
    expect(signedIn.detail).toContain(`approval asked from ${ben}`);
  });
});

describe("the other ways record an earlier period as before", () => {
  it("Record a value, a paste and a Filled-in Value", async () => {
    const { w, ben, sara, m, stored, due } = await setup();
    // An owner fills in once the value is due.
    await due();
    await w.value(m.id, ago(3), 1, sara);
    expect(await recordOwnValue(w.actor(sara, "member"), m.id, { value: "5", period: ago(3) }, quiet())).toMatchObject({ ok: true, outcome: "overwritten" });
    const pasted = await recordPastedValues(w.actor(sara, "member"), { text: `Signups\t${ago(4).slice(0, 7)}\t6` }, quiet());
    expect(pasted).toMatchObject({ ok: true, rows: [expect.objectContaining({ outcome: "recorded" })] });
    expect(await fillInValue(w.actor(ben), { metricId: m.id, period: ago(5), for: sara, value: "7" }, quiet())).toMatchObject({ ok: true, outcome: "recorded" });
    expect([await stored(ago(3)), await stored(ago(4)), await stored(ago(5))]).toEqual([[5], [6], [7]]);
  });

  it("a program, Slack, email and Telegram", async () => {
    const { w, sara, handle, address, m, code, stored } = await setup({ rule: "add" });
    const { secret } = await createAccessKey(w.actor(sara, "member"), { name: "Export", scopes: ["values:submit", "metrics:read"], expiresOn: new Date(Date.now() + 86_400_000 * 30).toISOString().slice(0, 10) });
    expect(await submitObservation((await actorForKey(secret)) as KeyActor, m.slug, { value: 1, period: ago(2) }, quiet())).toMatchObject({ ok: true, period: ago(2) });
    // A Feed submits as a program too, with its Token's code and the period it names.
    expect(await submitValue({ source: "api", sender: code, text: "2", value: { value: 2 }, period: ago(2), workspaceId: w.id }, quiet())).toMatchObject({ ok: true });
    expect(await submitValue({ source: "slack", sender: handle, text: `${words(ago(2))}: 3`, workspaceId: w.id }, quiet())).toMatchObject({ ok: true });
    expect(await submitValue({ source: "mail", sender: address, text: `${words(ago(2))}: 4`, workspaceId: w.id }, quiet())).toMatchObject({ ok: true });
    const r = await submitValue({ source: "telegram", sender: "123", text: `${words(ago(2))}: 5`, workspaceId: w.id }, quiet(), sara);
    expect(r).toMatchObject({ ok: true, outcome: "added" });
    expect(r.detail).toContain("10 + 5 = 15");
    expect(await stored(ago(2))).toEqual([15]);
    expect(await valuesOf(m.id)).toHaveLength(1);
  });
});
