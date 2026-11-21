// Record a value on the Metric's page against the real database (ticket #521; GLOSSARY: Submitter, Token, Stand-in,
// Submission Rule, Lock, Approval, Retention): only someone who submits the Metric on the web form is offered the
// form and may use it, and every refusal the intake has comes back through it in its own words.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { RECORDABLE_PERIODS, recordingOffer, recordingOffers, recordOwnValue } from "./record-own-value";
import { submissionEffects, type SubmissionEffects } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { storeCondensed, valuesOf, workspace } from "./test/db-fixtures";
import type { WorkflowStep } from "./types";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
/** Effects that send nothing but run the Workflow, so checks and Approvals happen for real. */
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: submissionEffects.afterValue });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);
const ago = (n: number) => shiftPeriod(thisMonth(), "month", -n);
/** The periods a Metric's values are for, oldest recorded first (period starts are not sealed). */
const periodsOf = async (metricId: number) => ((await db().from("observations").select("period_start").eq("metric_id", metricId).order("id")).data ?? []).map((r) => r.period_start as string);

describe("who is offered the form", () => {
  it("is offered to a Submitter, not to the owner who does not submit, an Owner, a viewer or a key", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member"); const viewer = await w.person("member");
    const m = await w.metric(sara, { name: "Signups" }); await w.token(m.id, ann);
    await w.share(m.id, viewer);
    expect(await recordingOffer(w.actor(ann, "member"), m.id)).toMatchObject({ metricId: m.id, name: "Signups", rule: expect.any(String) });
    for (const [who, role] of [[sara, "owner"], [viewer, "member"]] as const) {
      expect(await recordingOffer(w.actor(who, role), m.id)).toBeNull();
      await expect(recordOwnValue(w.actor(who, role), m.id, { value: "5" }, quiet())).rejects.toBeInstanceOf(Forbidden);
    }
    expect(await recordingOffer({ ...w.actor(ann, "member"), key: { id: 1, scopes: ["write"] } } as never, m.id)).toBeNull();
    expect(await valuesOf(m.id)).toEqual([]);
  });

  it("is not offered for a Derived Metric, an archived one or one without the web form", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const seen = await w.metric(sara, { sources: ["slack"] }); await w.token(seen.id, ann); await w.share(seen.id, ann);
    expect(await recordingOffer(w.actor(ann, "member"), seen.id)).toBeNull();
    const derived = await w.metric(sara, { formula: "{a}+{b}" }); await w.token(derived.id, ann); await w.share(derived.id, ann);
    expect(await recordingOffer(w.actor(ann, "member"), derived.id)).toBeNull();
    const archived = await w.metric(sara, { archived_at: new Date().toISOString() }); await w.token(archived.id, ann); await w.share(archived.id, ann);
    expect(await recordingOffer(w.actor(ann, "member"), archived.id)).toBeNull();
    await expect(recordOwnValue(w.actor(ann, "member"), archived.id, { value: "1" }, quiet())).rejects.toBeInstanceOf(Forbidden);
  });

  it("is offered to a Stand-in only while they stand in, and to nobody in another Workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara); await w.share(m.id, ben);
    // Ben has a Token of his own as Ann's Stand-in, but Ann's Token does not name him: it does not count.
    await w.token(m.id, ann);
    await w.token(m.id, ben, { stands_in_for: ann });
    expect(await recordingOffer(w.actor(ben, "member"), m.id)).toBeNull();
    await db().from("tokens").update({ stand_in_id: ben }).eq("metric_id", m.id).eq("submitter_id", ann);
    expect(await recordingOffer(w.actor(ben, "member"), m.id)).not.toBeNull();
    const other = await ws(); const eve = await other.person("owner");
    expect(await recordingOffer(other.actor(eve), m.id)).toBeNull();
  });

  it("lists the current period and the ones before it with the value each holds, written the Workspace's way", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { unit: "visits" }); await w.token(m.id, ann); await w.share(m.id, ann); await w.value(m.id, ago(1), 1234, ann);
    const offer = (await recordingOffer(w.actor(ann, "member"), m.id))!;
    expect(offer.periods).toHaveLength(RECORDABLE_PERIODS);
    expect(offer.periods[0]).toMatchObject({ start: thisMonth(), has: null });
    expect(offer.periods[1].start).toBe(ago(1));
    expect(offer.periods[1].has).toContain("1");
    expect(offer.placeholder).toBe("visits");
  });
});

describe("recording", () => {
  it("records for the current period with the person's own Token, as the form link does", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); const code = await w.token(m.id, ann); await w.share(m.id, ann);
    const r = await recordOwnValue(w.actor(ann, "member"), m.id, { value: "42" }, quiet());
    expect(r).toMatchObject({ ok: true, outcome: "recorded" });
    expect((await valuesOf(m.id)).map((v) => [v.value, v.submitter_id, v.source])).toEqual([[42, ann, "web_form"]]);
    expect(await periodsOf(m.id)).toEqual([thisMonth()]);
    const { data } = await db().from("intake_log").select("token_code, outcome, marks").eq("workspace_id", w.id);
    expect(data).toEqual([{ token_code: code, outcome: "recorded", marks: [] }]);
  });

  it("records for a chosen earlier period, reads the Workspace's number style, and refuses a period the form does not list", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ann); await w.share(m.id, ann);
    expect(await recordOwnValue(w.actor(ann, "member"), m.id, { value: "1,234.5", period: ago(3) }, quiet())).toMatchObject({ ok: true });
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([1234.5]);
    expect(await periodsOf(m.id)).toEqual([ago(3)]);
    for (const period of [shiftPeriod(thisMonth(), "month", 1), ago(RECORDABLE_PERIODS), `${ago(2).slice(0, 8)}15`, "nonsense"]) {
      expect(await recordOwnValue(w.actor(ann, "member"), m.id, { value: "1", period }, quiet())).toMatchObject({ ok: false, outcome: "rejected_period" });
    }
    expect(await valuesOf(m.id)).toHaveLength(1);
  });

  it("takes a Breakdown, and its total when no value is typed", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ann); await w.share(m.id, ann);
    const r = await recordOwnValue(w.actor(ann, "member"), m.id, { value: "", breakdown: "Germany\t60\nAustria\t15" }, quiet());
    expect(r).toMatchObject({ ok: true });
    expect(r.detail).toContain("breakdown of 2 rows");
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([75]);
    const { count } = await db().from("breakdown_rows").select("id", { count: "exact", head: true }).eq("workspace_id", w.id);
    expect(count).toBe(2);
  });

  it("says in plain words when there is no value to read", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ann); await w.share(m.id, ann);
    const act = w.actor(ann, "member");
    expect(await recordOwnValue(act, m.id, { value: "" }, quiet())).toMatchObject({ ok: false, outcome: "rejected_no_value", detail: "Type a value, or paste a breakdown." });
    expect(await recordOwnValue(act, m.id, { value: "lots" }, quiet())).toMatchObject({ ok: false, outcome: "rejected_no_value", detail: "Couldn’t read a number in the value." });
    expect(await recordOwnValue(act, m.id, { value: "", breakdown: "just words" }, quiet())).toMatchObject({ ok: false, outcome: "rejected_no_value" });
    expect(await valuesOf(m.id)).toEqual([]);
  });

  it("passes the Submission Rule through: add, reject and overwrite", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const act = w.actor(ann, "member");
    const add = await w.metric(sara, { submission_rule: "add" }); await w.token(add.id, ann); await w.share(add.id, ann);
    await recordOwnValue(act, add.id, { value: "10" }, quiet());
    expect((await recordOwnValue(act, add.id, { value: "5" }, quiet())).outcome).toBe("added");
    expect((await valuesOf(add.id)).at(-1)!.value).toBe(15);
    const reject = await w.metric(sara, { submission_rule: "reject" }); await w.token(reject.id, ann); await w.share(reject.id, ann);
    await recordOwnValue(act, reject.id, { value: "10" }, quiet());
    expect(await recordOwnValue(act, reject.id, { value: "5" }, quiet())).toMatchObject({ ok: false, outcome: "rejected_duplicate" });
    const over = await w.metric(sara, { submission_rule: "overwrite" }); await w.token(over.id, ann); await w.share(over.id, ann);
    await recordOwnValue(act, over.id, { value: "10" }, quiet());
    expect((await recordOwnValue(act, over.id, { value: "5" }, quiet())).outcome).toBe("overwritten");
  });

  it("sends a value for a locked period to the owner as a proposed Correction, and records nothing", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ann); await w.share(m.id, ann);
    await w.value(m.id, ago(1), 10, ann); await w.lock(m.id, ago(1));
    const r = await recordOwnValue(w.actor(ann, "member"), m.id, { value: "99", period: ago(1) }, quiet());
    expect(r).toMatchObject({ ok: false, outcome: "proposed_locked" });
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([10]);
  });

  it("refuses a period Retention condensed, with the day it was", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    // A quarterly Metric offers three years; Retention condenses a whole year once it is over 13 months old.
    const m = await w.metric(sara, { aggregation: "sum", period: "quarter" }); await w.token(m.id, ann); await w.share(m.id, ann);
    const year = `${new Date().getFullYear() - 2}-01-01`;
    for (let i = 0; i < 4; i++) await w.value(m.id, shiftPeriod(year, "quarter", i), 1, ann);
    await storeCondensed(w.actor(sara), { metricId: m.id, into: "year", span: year });
    const quarter = shiftPeriod(year, "quarter", 3);
    const r = await recordOwnValue(w.actor(ann, "member"), m.id, { value: "5", period: quarter }, quiet());
    expect(r).toMatchObject({ ok: false, outcome: "rejected_period_condensed" });
  });

  it("runs the Metric's Workflow: an unusual value waits for Approval and says so", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ann); await w.share(m.id, ann);
    await w.value(m.id, ago(1), 100, ann);
    const steps: WorkflowStep[] = [{ type: "check", changePct: 50, outsideTarget: false }, { type: "approve", approvers: [sara], values: "unusual" }, { type: "publish", lock: false }];
    await setMetricWorkflow(w.actor(sara), m.id, await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps }));
    const r = await recordOwnValue(w.actor(ann, "member"), m.id, { value: "900" }, quiet());
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("Workflow");
    const { data } = await db().from("period_states").select("state").eq("metric_id", m.id).eq("period_start", thisMonth()).maybeSingle();
    expect(data?.state).toBe("approval");
  });

  it("is refused in the demo Workspace", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara); await w.token(m.id, sara);
    await expect(recordOwnValue({ personId: sara, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, m.id, { value: "1" }, quiet())).rejects.toBeInstanceOf(DemoReadOnly);
  });
});

describe("offers for several Metrics", () => {
  it("lists only the Metrics the person submits and may see, with their own periods and values", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const monthly = await w.metric(sara, { name: "Signups" }); await w.token(monthly.id, ann); await w.value(monthly.id, ago(1), 7, ann);
    const quarterly = await w.metric(sara, { name: "Revenue", period: "quarter" }); await w.token(quarterly.id, ann);
    const notMine = await w.metric(sara, { name: "Costs" }); await w.share(notMine.id, ann);
    const noForm = await w.metric(sara, { name: "Calls", sources: ["slack"] }); await w.token(noForm.id, ann);
    const offers = await recordingOffers(w.actor(ann, "member"), [monthly.id, quarterly.id, notMine.id, noForm.id]);
    expect(Object.keys(offers).map(Number).sort()).toEqual([monthly.id, quarterly.id].sort());
    expect(offers[monthly.id].periods[1].has).toContain("7");
    expect(offers[monthly.id].periods[0].start).toBe(thisMonth());
    expect(offers[quarterly.id].periods[1].start).toBe(shiftPeriod(offers[quarterly.id].periods[0].start, "quarter", -1));
    expect(await recordingOffers(w.actor(sara), [monthly.id, quarterly.id])).toEqual({});
    expect(await recordingOffers(w.actor(ann, "member"), [])).toEqual({});
  });
});
