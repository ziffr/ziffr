// The "Fill in for …" offer and the "entered by" mark for the pages (spec 0046, ticket #801; GLOSSARY: Filled-in Value,
// Stand-in, Guest, Period Record, Period Timeline): who is offered whom and when, how the Period Record and the Period
// Timeline name a Filled-in Value, and that a Guest reads "Someone" and is offered nothing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { fillInOffer, guestStandIns, workflowFillIns } from "./fill-in-offer";
import { fillInValue } from "./fill-in";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { periodRecord } from "./period-record";
import { periodTimeline } from "./period-timeline";
import { recordOwnValue } from "./record-own-value";
import { DEMO_WORKSPACE_ID } from "./team";
import { submissionEffects, type SubmissionEffects } from "./submissions";
import { workspace } from "./test/db-fixtures";
import { submissionForm } from "./page-data";
import { schedule } from "./schedule";
import { saveWorkflow } from "./workflows";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: submissionEffects.afterValue });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const ago = (n: number) => shiftPeriod(thisMonth(), "month", -n);
const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;
/** The steps about the value itself: the Workflow publishing the period is not what these tests are about. */
const valueSteps = <S extends { kind: string }>(r: { steps: S[] }) => r.steps.filter((s) => ["submitted", "filled_in", "replaced"].includes(s.kind));
const nameOf = async (id: string) => String((await db().from("profiles").select("name").eq("id", id).single()).data!.name);

/** Ben owns the Metric ("reject"), Mia its Workflow, Sara submits it, Tom is her Stand-in (never asked); Zed only sees it. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member"); const mia = await w.person("member"); const zed = await w.person("member");
  const sara = await w.person("member", { email: mail("sara") }); const tom = await w.person("member", { email: mail("tom") });
  const guest = await w.person("guest");
  const m = await w.metric(ben, { name: "Cost", submission_rule: "reject" });
  const wf = await saveWorkflow(w.actor(mia, "member"), null, "Close", { dueWorkingDays: 2, steps: [{ type: "publish", lock: false }] });
  await w.patchMetric(m.id, { workflow_id: wf });
  for (const p of [mia, zed, sara, tom, guest]) await w.share(m.id, p);
  const saraCode = await w.token(m.id, sara);
  await db().from("tokens").update({ stand_in_id: tom }).eq("metric_id", m.id).eq("submitter_id", sara);
  const tomCode = await w.token(m.id, tom, { stands_in_for: sara, expires_at: new Date(Date.now() + 86_400_000 * 10).toISOString().slice(0, 10) });
  const as = (p: string) => w.actor(p, "member");
  return { w, ben, mia, zed, sara, tom, guest, m, wf, as, saraCode, tomCode };
}

describe("the Fill in for … offer", () => {
  it("offers the Metric's owner and the Workflow's owner the submitter after the Due Date, and nobody else", async () => {
    const { w, ben, mia, zed, sara, tom, guest, m, as } = await setup();
    const open = { metricId: m.id, period: ago(2), people: [{ id: sara, name: await nameOf(sara), wait: null }] };
    expect(await fillInOffer(as(ben), m.id, ago(2))).toEqual(open);
    expect(await fillInOffer(as(mia), m.id, ago(2))).toEqual(open);
    // A Member who sees the Metric, the submitter, a Stand-in nobody asked, a Guest, an Access Key and the demo: no button at all.
    for (const actor of [as(zed), as(sara), as(tom), w.actor(guest, "guest")]) expect(await fillInOffer(actor, m.id, ago(2))).toBeNull();
    expect(await fillInOffer({ ...as(ben), key: { id: 1, scopes: ["metrics:read"] } } as never, m.id, ago(2))).toBeNull();
    expect(await fillInOffer({ personId: ben, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, m.id, ago(2))).toBeNull();
  });

  it("is disabled with the reason before the Due Date, and open while the submitter is Away", async () => {
    const { ben, sara, m, as } = await setup();
    const early = await fillInOffer(as(ben), m.id, thisMonth());
    expect(early?.people).toEqual([expect.objectContaining({ id: sara, wait: expect.stringMatching(/after the Due Date/) })]);
    await db().from("away").insert({ user_id: sara, starts: new Date().toISOString().slice(0, 10), ends: new Date().toISOString().slice(0, 10), set_by: sara });
    expect((await fillInOffer(as(ben), m.id, thisMonth()))?.people[0].wait).toBeNull();
  });

  it("offers on the Workflow's period view the same people as on the Metric's page, for the period it works on, and nobody else", async () => {
    const { w, ben, mia, zed, sara, tom, guest, m, wf, as } = await setup();
    const open = [{ metricId: m.id, period: ago(1), people: [expect.objectContaining({ id: sara, name: await nameOf(sara) })] }];
    expect(await workflowFillIns(as(ben), wf)).toEqual(open);
    expect(await workflowFillIns(as(mia), wf)).toEqual(open);
    // The others, a Guest, an Access Key and the demo get nothing; neither does another Workflow.
    for (const actor of [as(zed), as(sara), as(tom), w.actor(guest, "guest")]) expect(await workflowFillIns(actor, wf)).toEqual([]);
    expect(await workflowFillIns({ ...as(ben), key: { id: 1, scopes: ["metrics:read"] } } as never, wf)).toEqual([]);
    expect(await workflowFillIns({ personId: ben, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, wf)).toEqual([]);
    expect(await workflowFillIns(as(ben), wf + 100000)).toEqual([]);
    // A Workflow owner who does not see the Metric is offered nothing for it.
    await w.unshare(m.id, mia);
    expect(await workflowFillIns(as(mia), wf)).toEqual([]);
  });

  it("disappears once the period has a value", async () => {
    const { ben, sara, m, as } = await setup();
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "42" }, quiet());
    expect(await fillInOffer(as(ben), m.id, ago(2))).toBeNull();
  });

  it("tells the Metric's owner of a Guest chosen as Stand-in, and nobody else", async () => {
    const { ben, mia, sara, guest, m, as } = await setup();
    expect(await guestStandIns(as(ben), m.id)).toEqual({});
    await db().from("tokens").update({ stand_in_id: guest }).eq("metric_id", m.id).eq("submitter_id", sara);
    expect(await guestStandIns(as(ben), m.id)).toEqual({ [sara]: guest });
    expect(await guestStandIns(as(mia), m.id)).toEqual({});
  });
});

describe("the mark on a Filled-in Value", () => {
  it("names who entered it for whom in the Period Record and the Period Timeline, and a replaced one stays", async () => {
    const { w, ben, zed, sara, m, wf, as } = await setup();
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "42" }, quiet());
    const [benName, saraName] = [await nameOf(ben), await nameOf(sara)];
    const filled = await periodRecord(as(zed), m.slug, ago(2));
    expect(valueSteps(filled!)).toEqual([expect.objectContaining({ kind: "filled_in", person: saraName, enteredBy: benName, value: 42, superseded: false })]);
    const line = (await periodTimeline(as(zed), wf, ago(2))).events.find((e) => e.kind === "in");
    expect(line?.text).toContain(`Cost came in: 42, entered by ${benName} for ${saraName}`);

    // Sara replaces it with her own value: the Filled-in Value stays in the record, struck through, with who entered it.
    const replaced = await recordOwnValue(as(sara), m.id, { value: "40", period: ago(2) }, quiet());
    expect(replaced.ok).toBe(true);
    const after = await periodRecord(as(zed), m.slug, ago(2));
    expect(valueSteps(after!).map((s) => [s.kind, s.value, s.superseded, s.enteredBy])).toEqual([["filled_in", 42, true, benName], ["replaced", 40, false, null]]);
    expect(after!.value).toBe(40);
    void w;
  });

  it("tells a Guest nothing of it and offers a Guest nothing", async () => {
    const { w, ben, sara, guest, m, wf, as } = await setup();
    await fillInValue(as(ben), { metricId: m.id, period: ago(2), for: sara, value: "42" }, quiet());
    const r = await periodRecord(w.actor(guest, "guest"), m.slug, ago(2));
    expect(valueSteps(r!)).toEqual([expect.objectContaining({ kind: "submitted", person: "Someone", enteredBy: null })]);
    expect(r!.fillIn).toBeNull();
    const line = (await periodTimeline(w.actor(guest, "guest"), wf, ago(2))).events.find((e) => e.kind === "in");
    expect(line?.text).not.toContain("entered by");
    expect(JSON.stringify(line)).not.toContain(await nameOf(ben));
    expect(JSON.stringify(line)).not.toContain(await nameOf(sara));
  });
});

describe("a Stand-in's form link", () => {
  it("says whom they answer for, and says nothing on the submitter's own link", async () => {
    const { sara, saraCode, tomCode } = await setup();
    expect((await submissionForm(tomCode))?.standingInFor).toBe(await nameOf(sara));
    expect((await submissionForm(saraCode))?.standingInFor).toBeNull();
  });

  it("tells a Contact Stand-in only \"your colleague\" and a Guest Stand-in nothing", async () => {
    const { w, m, sara } = await setup();
    const contact = await w.contact({ email: mail("cora") });
    const exp = new Date(Date.now() + 86_400_000 * 10).toISOString().slice(0, 10);
    const code = await w.token(m.id, contact, { stands_in_for: sara, expires_at: exp });
    await db().from("tokens").update({ stand_in_id: contact }).eq("metric_id", m.id).eq("submitter_id", sara).is("stands_in_for", null);
    const f = await submissionForm(code);
    expect(f?.standingInFor).toBe("your colleague");
    expect(JSON.stringify(f)).not.toContain(await nameOf(sara));
    const guest = await w.person("guest");
    const gcode = await w.token(m.id, guest, { stands_in_for: sara, expires_at: exp });
    await db().from("tokens").update({ stand_in_id: guest }).eq("metric_id", m.id).eq("submitter_id", sara).is("stands_in_for", null);
    expect((await submissionForm(gcode))?.standingInFor).toBeNull();
  });
});

describe("the Escalation on the Schedule", () => {
  it("is marked fillable only where the core would let the person fill in", async () => {
    const { w, ben, sara, m, as } = await setup();
    await w.action({ metric_id: m.id, period_start: ago(2), asker_id: sara, assignee_id: ben, kind: "question", purpose: "escalation", question: "Cost is missing." });
    await w.action({ metric_id: m.id, period_start: thisMonth(), asker_id: sara, assignee_id: ben, kind: "question", purpose: "escalation", question: "Cost is missing now." });
    const s = await schedule(as(ben));
    const all = [...s.overdue, ...s.days.flatMap((d) => d.entries), ...s.undated].filter((e) => e.escalation);
    expect(all.find((e) => e.period.start === ago(2))?.mayFillIn).toBe(true);
    expect(all.find((e) => e.period.start === thisMonth())?.mayFillIn ?? false).toBe(false);
  });
});
