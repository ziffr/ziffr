// Submitting values through the core, against the real database (spec 0001, ticket #11).
import { afterEach, describe, expect, it, vi } from "vitest";
import { decideCorrection, submitValue, type SubmissionEffects } from "./submissions";
import { Forbidden } from "./actor";
import { db } from "./db";
import { valuesOf, workspace } from "./test/db-fixtures";
import { JANUARY, periodStart } from "./periods";

const effects = (): SubmissionEffects & { notifyCorrection: ReturnType<typeof vi.fn>; afterValue: ReturnType<typeof vi.fn> } => ({
  notifyCorrection: vi.fn(async () => {}),
  afterValue: vi.fn(async () => []),
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }

describe("values that arrive", () => {
  it("records a form-link value under the Token's submitter, and hands it to the Workflow", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara); const code = await w.token(m.id, sara);
    const fx = effects();
    const r = await submitValue({ source: "web_form", sender: code, text: "12" }, fx);
    expect(r).toMatchObject({ ok: true, outcome: "recorded" });
    expect(await valuesOf(m.id)).toMatchObject([{ value: 12, submitter_id: sara, source: "web_form" }]);
    expect(fx.afterValue).toHaveBeenCalledWith(m.id, periodStart(new Date(), "month", JANUARY), sara, { imported: false });
  });

  it("recognises a Contact by Slack handle and by email, and records under them", async () => {
    const w = await ws(); const owner = await w.person("owner"); const cleo = await w.contact({ email: "cleo@field.test", slack_handle: "@cleo" });
    const m = await w.metric(owner, { submission_rule: "keep_both" }); await w.token(m.id, cleo);
    expect((await submitValue({ source: "slack", sender: "@Cleo", text: "visited 4", workspaceId: w.id }, effects())).ok).toBe(true);
    expect((await submitValue({ source: "mail", sender: "CLEO@field.test", text: "7", workspaceId: w.id }, effects())).ok).toBe(true);
    expect((await valuesOf(m.id)).map((v) => [v.value, v.submitter_id])).toEqual([[4, cleo], [7, cleo]]);
  });

  it("never recognises a sender or a Token of another workspace", async () => {
    const a = await ws("A"); const b = await ws("B");
    const zoe = await b.person("owner", { slack_handle: "@zoe-b" }); const mb = await b.metric(zoe); await b.token(mb.id, zoe);
    await a.person("owner");
    const r = await submitValue({ source: "slack", sender: "@zoe-b", text: "5", workspaceId: a.id }, effects());
    expect(r.outcome).toBe("rejected_unknown_sender");
    expect(await valuesOf(mb.id)).toEqual([]);
  });

  it("refuses unknown form links, Derived Metrics and Sources the Metric does not take", async () => {
    const w = await ws(); const sara = await w.person("owner");
    expect((await submitValue({ source: "web_form", sender: "tk-nonexistent-link-0000", text: "1" }, effects())).outcome).toBe("rejected_no_token");
    const derived = await w.metric(sara, { formula: "{a} + {b}", sources: [] }); const t1 = await w.token(derived.id, sara);
    expect((await submitValue({ source: "web_form", sender: t1, text: "1" }, effects())).outcome).toBe("rejected_derived");
    const slackOnly = await w.metric(sara, { sources: ["slack"] }); const t2 = await w.token(slackOnly.id, sara);
    expect((await submitValue({ source: "web_form", sender: t2, text: "1" }, effects())).outcome).toBe("rejected_source");
  });

  it("picks the Metric named in the message, and asks when it cannot tell", async () => {
    const w = await ws(); const ben = await w.person("member", { slack_handle: "@ben-t" });
    const tickets = await w.metric(ben, { name: "Support tickets" }); const returns = await w.metric(ben, { name: "Return rate" });
    await w.token(tickets.id, ben); await w.token(returns.id, ben);
    expect((await submitValue({ source: "slack", sender: "@ben-t", text: "42", workspaceId: w.id }, effects())).outcome).toBe("rejected_ambiguous");
    expect((await submitValue({ source: "slack", sender: "@ben-t", text: "tickets 42", workspaceId: w.id }, effects())).ok).toBe(true);
    expect(await valuesOf(tickets.id)).toMatchObject([{ value: 42 }]);
    expect(await valuesOf(returns.id)).toEqual([]);
  });

  it("follows the Submission Rule: reject, overwrite and add", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const reject = await w.metric(sara, { submission_rule: "reject" }); const tr = await w.token(reject.id, sara);
    await submitValue({ source: "web_form", sender: tr, text: "1" }, effects());
    expect((await submitValue({ source: "web_form", sender: tr, text: "2" }, effects())).outcome).toBe("rejected_duplicate");
    expect((await valuesOf(reject.id)).map((v) => v.value)).toEqual([1]);
    const over = await w.metric(sara, { submission_rule: "overwrite" }); const to = await w.token(over.id, sara);
    await submitValue({ source: "web_form", sender: to, text: "1" }, effects());
    expect((await submitValue({ source: "web_form", sender: to, text: "2" }, effects())).outcome).toBe("overwritten");
    expect((await valuesOf(over.id)).map((v) => v.value)).toEqual([2]);
    const add = await w.metric(sara, { submission_rule: "add" }); const ta = await w.token(add.id, sara);
    await submitValue({ source: "web_form", sender: ta, text: "3" }, effects());
    expect((await submitValue({ source: "web_form", sender: ta, text: "4" }, effects())).outcome).toBe("added");
    expect((await valuesOf(add.id)).map((v) => v.value)).toEqual([7]);
  });

  it("turns a value for a locked period into a proposed Correction for the owner", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const code = await w.token(m.id, ben);
    await db().from("period_states").insert({ metric_id: m.id, period_start: periodStart(new Date(), "month", JANUARY), state: "locked" });
    const fx = effects();
    const r = await submitValue({ source: "web_form", sender: code, text: "9" }, fx);
    expect(r.outcome).toBe("proposed_locked");
    expect(await valuesOf(m.id)).toEqual([]);
    expect(fx.notifyCorrection).toHaveBeenCalledWith(expect.objectContaining({ senderId: ben, ownerId: sara, value: 9 }));
    expect(fx.afterValue).not.toHaveBeenCalled();
  });
});

describe("deciding a Correction", () => {
  async function proposal() {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const code = await w.token(m.id, ben);
    const period = periodStart(new Date(), "month", JANUARY);
    await submitValue({ source: "web_form", sender: code, text: "5" }, effects());
    await db().from("period_states").insert({ metric_id: m.id, period_start: period, state: "locked" });
    const fx = effects();
    await submitValue({ source: "web_form", sender: code, text: "8" }, fx);
    const { data: msg } = await db().from("thread_messages").select("id").eq("action_id", fx.notifyCorrection.mock.calls[0][0].actionId).single();
    return { w, sara, ben, m, messageId: msg!.id as number };
  }
  const decided = () => ({ notifyDecision: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });

  it("lets only the Metric owner decide, and nobody from another workspace", async () => {
    const { w, ben, sara, messageId } = await proposal();
    await expect(decideCorrection(w.actor(ben, "member"), messageId, true, decided())).rejects.toBeInstanceOf(Forbidden);
    const other = await ws("Other");
    await expect(decideCorrection({ personId: sara, workspaceId: other.id, role: "owner" }, messageId, true, decided())).rejects.toBeInstanceOf(Forbidden);
  });

  it("replaces the value on accept, keeps the first as the original, and runs the Workflow again", async () => {
    const { w, sara, ben, m, messageId } = await proposal();
    const fx = decided();
    await decideCorrection(w.actor(sara), messageId, true, fx);
    expect(await valuesOf(m.id)).toMatchObject([{ value: 8, original_value: 5 }]);
    expect(fx.afterValue).toHaveBeenCalledWith(m.id, periodStart(new Date(), "month", JANUARY), ben);
    expect(fx.notifyDecision).toHaveBeenCalledWith(expect.objectContaining({ ownerId: sara, authorId: ben, accepted: true }));
  });

  it("leaves the value on decline", async () => {
    const { w, sara, m, messageId } = await proposal();
    await decideCorrection(w.actor(sara), messageId, false, decided());
    expect(await valuesOf(m.id)).toMatchObject([{ value: 5, original_value: null }]);
  });
});

describe("hardening", () => {
  it("records nothing from the form link of someone who left the workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const code = await w.token(m.id, ben);
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", ben);
    expect((await submitValue({ source: "web_form", sender: code, text: "3" }, effects())).ok).toBe(false);
    expect(await valuesOf(m.id)).toEqual([]);
  });

  it("refuses a Prompt of another workspace without failing", async () => {
    const a = await ws("A"); const b = await ws("B");
    const zoe = await b.person("owner"); const mb = await b.metric(zoe);
    const { data: p } = await db().from("prompts").insert({ metric_id: mb.id, submitter_id: zoe, source: "slack", text: "?", period_start: periodStart(new Date(), "month", JANUARY) }).select("id").single();
    const ann = await a.person("owner", { slack_handle: "@ann-t" }); const ma = await a.metric(ann); await a.token(ma.id, ann);
    const r = await submitValue({ source: "slack", sender: "@ann-t", text: "4", promptId: p!.id, workspaceId: a.id }, effects());
    expect(r.ok).toBe(false);
    expect(await valuesOf(mb.id)).toEqual([]);
  });

  it("applies a Correction once, however often it is accepted", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const code = await w.token(m.id, ben);
    await db().from("period_states").insert({ metric_id: m.id, period_start: periodStart(new Date(), "month", JANUARY), state: "locked" });
    const fx = effects();
    await submitValue({ source: "web_form", sender: code, text: "8" }, fx); // nothing there yet: accepting adds the value
    const { data: msg } = await db().from("thread_messages").select("id").eq("action_id", fx.notifyCorrection.mock.calls[0][0].actionId).single();
    const fx2 = { notifyDecision: vi.fn(async () => {}), afterValue: vi.fn(async () => []) };
    await Promise.all([decideCorrection(w.actor(sara), msg!.id, true, fx2), decideCorrection(w.actor(sara), msg!.id, true, fx2)]);
    expect((await valuesOf(m.id)).map((v) => v.value)).toEqual([8]);
    expect(fx2.notifyDecision).toHaveBeenCalledTimes(1);
  });
});
