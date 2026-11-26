// The personal form link while a request waits, against the real database (GLOSSARY: Prompt, Token, Stand-in, Lock,
// Approval): which periods the form offers, that a value picked for one is recorded for it and answers the request, and
// that nothing else a browser names is recorded.
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { LINK_PERIOD_REFUSED } from "./form-link-rules";
import { submissionForm } from "./page-data";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { submissionEffects, submitValue, type SubmissionEffects, type SubmissionInput } from "./submissions";
import { valuesOf, workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: submissionEffects.afterValue });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const ago = (n: number) => shiftPeriod(thisMonth(), "month", -n);
const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** Sara submits a monthly Metric on a Workflow due the day the month ends; the Metric is made just now. */
async function setup(o: { workflow?: boolean; rule?: string } = {}) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("owner"); const sara = await w.person("member", { email: mail("sara") });
  const m = await w.metric(ben, { name: "Signups", submission_rule: o.rule ?? "reject" });
  if (o.workflow !== false) {
    const { data } = await db().from("workflows").insert({ owner_id: ben, name: "Monthly", config: { dueWorkingDays: 0, steps: [] }, workspace_id: w.id }).select("id").single();
    await w.patchMetric(m.id, { workflow_id: data!.id });
  }
  const code = await w.token(m.id, sara);
  const ask = (period: string, submitterId = sara, standingInFor?: string) => deliverPrompt({ metricId: m.id, submitterId, period, standingInFor, queue: true });
  const offered = async (c = code) => (await submissionForm(c))!.asked.map((a) => a.start);
  const send = (formPeriod: string | undefined, text = "5", c = code, over: Partial<SubmissionInput> = {}) => submitValue({ source: "web_form", sender: c, text, formPeriod, ...over }, quiet());
  const recorded = async () => ((await db().from("observations").select("period_start").eq("metric_id", m.id).order("created_at")).data ?? []).map((r) => r.period_start as string);
  const openPrompts = async (period: string) => ((await db().from("prompts").select("id").eq("metric_id", m.id).eq("period_start", period).is("answered_at", null)).data ?? []).length;
  return { w, ben, sara, m, code, ask, offered, send, recorded, openPrompts };
}

describe("a form link while a request waits", () => {
  it("offers the periods asked for, newest first, with names and nothing else, even those before the Metric existed", async () => {
    const { ask, offered, code } = await setup();
    expect(await offered()).toEqual([]);
    await ask(ago(2)); await ask(ago(1)); await ask(ago(1));
    expect(await offered()).toEqual([ago(1), ago(2)]);
    for (const a of (await submissionForm(code))!.asked) expect(Object.keys(a).sort()).toEqual(["label", "start"]);
  });

  it("records the picked period and answers its request; the next one is still offered", async () => {
    const { ask, offered, send, recorded, openPrompts } = await setup();
    await ask(ago(2)); await ask(ago(1));
    expect(await send(ago(1))).toMatchObject({ ok: true, outcome: "recorded" });
    expect(await recorded()).toEqual([ago(1)]);
    expect(await openPrompts(ago(1))).toBe(0);
    expect(await offered()).toEqual([ago(2)]);
  });

  it("records the running period when it is picked, and when none is sent, as before", async () => {
    const { ask, offered, send, recorded } = await setup({ rule: "keep_both" });
    await ask(ago(1));
    expect(await send(thisMonth())).toMatchObject({ ok: true });
    expect(await send(undefined)).toMatchObject({ ok: true });
    expect(await recorded()).toEqual([thisMonth(), thisMonth()]);
    expect(await offered()).toEqual([ago(1)]);
  });

  it("refuses every other period in the same words and records nothing", async () => {
    const { w, sara, m, ask, offered, send, recorded } = await setup();
    await ask(ago(2)); await ask(ago(1));
    // A value is in for an asked period, as after a send-back at Approval: it is no longer offered.
    await w.value(m.id, ago(1), 4711, sara);
    await db().from("period_states").insert({ metric_id: m.id, period_start: ago(1), state: "submitted", workspace_id: w.id });
    expect(await offered()).toEqual([ago(2)]);
    for (const p of [ago(1), ago(3), shiftPeriod(thisMonth(), "month", 1), `${ago(2).slice(0, 8)}02`, "", "x", "2026-13-01"]) {
      expect(await send(p)).toEqual({ ok: false, ...LINK_PERIOD_REFUSED, metricSlug: m.slug });
    }
    expect(await recorded()).toEqual([ago(1)]);
  });

  it("refuses words that name another period than the one picked", async () => {
    const { ask, send, recorded } = await setup();
    await ask(ago(1));
    const r = await send(ago(1), "this month 5");
    expect(r).toMatchObject({ ok: false, outcome: "rejected_other_period" });
    expect(r.detail).toContain("The form is set to");
    expect(await recorded()).toEqual([]);
  });

  it("counts a request only for the Token it was sent for: not a colleague's, and a Stand-in's only in that person's place", async () => {
    const { w, sara, m, code, ask, offered, send, recorded } = await setup();
    const ann = await w.person("member", { email: mail("ann") }); const tom = await w.person("member", { email: mail("tom") });
    const annCode = await w.token(m.id, ann);
    await db().from("tokens").update({ stand_in_id: tom }).eq("metric_id", m.id).eq("submitter_id", sara);
    await ask(ago(2), ann);
    await ask(ago(1), tom, sara);
    const tomCode = (await db().from("tokens").select("code").eq("metric_id", m.id).eq("submitter_id", tom).single()).data!.code as string;
    expect(await offered(code)).toEqual([]);
    expect(await offered(annCode)).toEqual([ago(2)]);
    expect(await offered(tomCode)).toEqual([ago(1)]);
    expect(await send(ago(1))).toMatchObject({ ok: false, outcome: "rejected_period" });
    expect(await send(ago(2), "5", tomCode)).toMatchObject({ ok: false, outcome: "rejected_period" });
    expect(await recorded()).toEqual([]);
    expect(await send(ago(1), "9", tomCode)).toMatchObject({ ok: true });
    expect(await valuesOf(m.id)).toEqual([expect.objectContaining({ value: 9, submitter_id: sara })]);
  });

  it("serves a Contact without a login", async () => {
    const { w, m, ask, offered, send } = await setup();
    const cleo = await w.contact({ email: mail("cleo") });
    const cleoCode = await w.token(m.id, cleo);
    await ask(ago(1), cleo);
    expect(await offered(cleoCode)).toEqual([ago(1)]);
    expect(await send(ago(1), "3", cleoCode)).toMatchObject({ ok: true });
  });

  it("proposes a Correction for a locked period that was asked for, as any late value", async () => {
    const { w, m, ask, send, recorded } = await setup();
    await ask(ago(1));
    await w.lock(m.id, ago(1));
    expect(await send(ago(1))).toMatchObject({ ok: false, outcome: "proposed_locked" });
    expect(await recorded()).toEqual([]);
  });

  it("drops a request the Schedule no longer reaches, and without a Workflow keeps only the latest ended period", async () => {
    const flow = await setup();
    await flow.ask(ago(6)); await flow.ask(ago(1));
    expect(await flow.offered()).toEqual([ago(1)]);
    const plain = await setup({ workflow: false });
    await plain.ask(ago(2)); await plain.ask(ago(1));
    expect(await plain.offered()).toEqual([ago(1)]);
    expect(await plain.send(ago(2))).toMatchObject({ ok: false, outcome: "rejected_period" });
  });

  it("offers nothing for a Metric closed to the web form, and ignores a picked period on other ways", async () => {
    const { w, m, code, ask, offered, send, recorded } = await setup();
    await ask(ago(1));
    // A program names its period itself; a picked period from a form means nothing to it.
    expect(await send(ago(3), "5", code, { source: "api", value: { value: 5 } })).toMatchObject({ ok: true });
    expect(await recorded()).toEqual([thisMonth()]);
    await w.patchMetric(m.id, { sources: ["mail"] });
    expect(await offered()).toEqual([]);
  });
});
