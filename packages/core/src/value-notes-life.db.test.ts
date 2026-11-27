// What becomes of Value Notes over time, against the real database (spec 0064, #1308; GLOSSARY: Value Note): sealing and
// a changed Workspace Key, Self-check, Correction, Approval, Condensed Values, and people and Workspaces that go.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { removeMember } from "./handover";
import { makePracticeWorkspace, startOverPracticeWorkspace } from "./practice-workspace";
import { retentionJob } from "./retention-job";
import { retentionPreview } from "./retention-setting";
import { decideCorrection, submitValue } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { installationAdmin, rowsOf, workspace } from "./test/db-fixtures";
import { periodValueNotes, writeValueNote } from "./value-notes";
import { approve, confirmSelfCheck, correctSelfCheck, onValue } from "./workflow-engine";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { changeWorkspaceKey } from "./workspace-key-change";
import { reencryptionJob } from "./workspace-key-job";
import { ensureWorkspaceKey, forgetWorkspaceKey, isSealed, sealedVersion } from "./workspace-keys";

const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 71).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
}, 120_000);

const P = "2026-03-01";

/** Sara owns a Metric that Ann sends values for. */
async function setup(over: Record<string, unknown> = {}) {
  const w = await workspace("Notes");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const sara = await w.person("owner");
  const ann = await w.person("member");
  const m = await w.metric(sara, over);
  await w.share(m.id, ann);
  const code = await w.token(m.id, ann);
  const send = (value: number, valueNote?: string, period = P) => submitValue({ source: "api", sender: code, text: String(value), value: { value }, period, valueNote, workspaceId: w.id });
  const read = async (period = P) => (await periodValueNotes(w.actor(sara), m.id, period))!;
  const current = async (period = P) => (await read(period)).current.map((n) => n.words);
  const stored = () => rowsOf("value_notes", { metric_id: m.id });
  return { w, sara, ann, m, send, read, current, stored };
}

describe("the Workspace Key", () => {
  it("seals note words and numbers written in clear, and moves them to a changed key", async () => {
    delete process.env.ZIFFR_SECRETS_KEY;
    const s = await setup();
    await s.send(45, "Hamburg fair.");
    expect((await s.stored())[0]).toMatchObject({ words: "Hamburg fair.", said_of: 45 });
    process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 71).toString("base64");
    const only = { only: [s.w.id] };
    expect((await reencryptionJob(only)).errors).toBe(0);
    const [sealed] = await s.stored();
    expect(isSealed(sealed!.words as string)).toBe(true);
    expect(sealed!.said_of).toBeNull();
    expect(isSealed(sealed!.said_of_sealed as string)).toBe(true);
    expect((await s.read()).history).toEqual([expect.objectContaining({ words: "Hamburg fair.", saidOf: 45 })]);
    const admin = await installationAdmin();
    cleanups.push(admin.cleanup);
    await changeWorkspaceKey(admin.actor, s.w.id);
    await db().from("workspace_keys").update({ pending_until: new Date(Date.now() - 1000).toISOString() }).eq("workspace_id", s.w.id).eq("version", 2).throwOnError();
    expect((await reencryptionJob(only)).errors).toBe(0);
    const [moved] = await s.stored();
    expect([sealedVersion(moved!.words as string), sealedVersion(moved!.said_of_sealed as string)]).toEqual([2, 2]);
    expect((await s.read()).history).toEqual([expect.objectContaining({ words: "Hamburg fair.", saidOf: 45 })]);
  });

  it("seals a new note as it is written, also the note waiting with a proposal", async () => {
    const s = await setup();
    await ensureWorkspaceKey(s.w.id);
    await s.send(45, "Hamburg fair.");
    await s.w.lock(s.m.id, P);
    await s.send(46, "Late invoice.");
    const rows = await s.stored();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => isSealed(r.words as string) && r.said_of === null && isSealed(r.said_of_sealed as string))).toBe(true);
  });
});

describe("an accepted Correction with the same number", () => {
  async function proposed(words: string | undefined) {
    const s = await setup();
    await s.send(45, "One fair.");
    await s.w.lock(s.m.id, P);
    await s.send(45, words);
    const [action] = await rowsOf("actions", { metric_id: s.m.id, purpose: "approval" });
    const [message] = await rowsOf("thread_messages", { action_id: action!.id });
    await decideCorrection(s.w.actor(s.sara), Number(message!.id), true);
    return s;
  }

  it("puts its own words in the place of the earlier note", async () => {
    const s = await proposed("Two fairs.");
    expect(await s.current()).toEqual(["Two fairs."]);
    expect((await s.read()).history.map((e) => [e.words, e.replaced])).toEqual([["One fair.", true], ["Two fairs.", false]]);
  });

  it("adds nothing for the same words, and keeps the note when it brings none", async () => {
    for (const words of ["One fair.", undefined]) {
      const s = await proposed(words);
      expect(await s.current()).toEqual(["One fair."]);
      expect(await s.stored()).toHaveLength(1);
    }
  });
});

/** A Metric whose values a Workflow has checked by their sender (nobody else), or approved by Ben. */
async function withWorkflow(approver: "sender" | "ben") {
  const w = await workspace("Notes");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const sara = await w.person("owner");
  const ben = await w.person("member");
  const flow = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [
    { type: "approve", approvers: [approver === "ben" ? ben : sara], values: "every", nobodyElse: "self-check" }, { type: "publish", lock: false },
  ] });
  const m = await w.metric(sara, { name: "Revenue", sources: ["web_form", "api"] });
  await setMetricWorkflow(w.actor(sara), m.id, flow);
  if (approver === "ben") await w.share(m.id, ben);
  const code = await w.token(m.id, sara);
  await submitValue({ source: "api", sender: code, text: "45", value: { value: 45 }, period: P, valueNote: "One fair.", workspaceId: w.id });
  await onValue(m.id, P, sara);
  const [task] = await rowsOf("actions", { metric_id: m.id, status: "open" });
  const read = async () => (await periodValueNotes(w.actor(sara), m.id, P))!;
  return { w, sara, ben, m, task: Number(task!.id), read };
}

describe("a Workflow", () => {
  it("takes the notes with the value a Self-check corrects, and leaves them where it is confirmed", async () => {
    const confirmed = await withWorkflow("sender");
    await confirmSelfCheck(confirmed.w.id, confirmed.task, confirmed.sara);
    expect((await confirmed.read()).current.map((n) => n.words)).toEqual(["One fair."]);
    const corrected = await withWorkflow("sender");
    await correctSelfCheck(corrected.w.id, corrected.task, corrected.sara, 52);
    const after = await corrected.read();
    expect(after.current).toEqual([]);
    expect(after.history).toEqual([expect.objectContaining({ words: "One fair.", saidOf: 45, replaced: true })]);
  });

  it("marks a note written after the Approval as added later", async () => {
    const s = await withWorkflow("ben");
    await approve(s.w.id, s.task, s.ben);
    await writeValueNote(s.w.actor(s.sara), { metricId: s.m.id, period: P, words: "Seen since." });
    expect((await s.read()).current.map((n) => [n.words, n.addedLater])).toEqual([["Seen since.", true], ["One fair.", false]]);
  });
});

describe("Condensed Values", () => {
  it("take no note, and the notes of the days they replace are gone", async () => {
    const s = await setup({ period: "day", aggregation: "sum" });
    for (const day of ["2022-01-03", "2022-01-04"]) await s.send(2, `Note of ${day}`, day);
    const actor = s.w.actor(s.sara);
    const setting = { keep_months: 25, then: "condense", into: "month" };
    const p = await retentionPreview(actor, s.m.id, setting);
    expect(p.valueNotes).toBe(2);
    const cap = { id: randomUUID(), confirmed_on: new Date().toISOString().slice(0, 10), periods: p.periods, values: p.values, held_back_periods: p.heldBack, held_back_values: p.heldBackValues };
    await s.w.patchMetric(s.m.id, { retention: setting, retention_pending: null, retention_cap: cap });
    expect(await retentionJob(new Date(), { workspaceId: s.w.id })).toMatchObject({ condensed: 1 });
    expect(await s.stored()).toEqual([]);
    for (const period of ["2022-01-01", "2022-01-03"]) {
      expect(await periodValueNotes(actor, s.m.id, period)).toBeNull();
      await expect(writeValueNote(actor, { metricId: s.m.id, period, words: "Late" })).rejects.toThrow();
    }
  });
});

describe("what goes", () => {
  it("keeps the notes of a removed person without their name, and gives that person nothing", async () => {
    const s = await setup();
    await s.w.value(s.m.id, P, 3, s.sara);
    const ben = await s.w.person("member");
    await s.w.share(s.m.id, ben);
    await db().from("shares").update({ role: "editor" }).eq("object_id", s.m.id).eq("user_id", ben).throwOnError();
    // Ben wrote a note and nothing else.
    await writeValueNote(s.w.actor(ben, "member"), { metricId: s.m.id, period: P, words: "From Ben." });
    await removeMember(s.w.actor(s.sara), ben, s.ann);
    expect((await s.read()).current).toEqual([expect.objectContaining({ words: "From Ben.", author: "A former member" })]);
    const former = await db().rpc("former_person_ids", { ws: s.w.id });
    expect(JSON.stringify(former.data)).toContain(ben);
    expect(await periodValueNotes(s.w.actor(ben, "member"), s.m.id, P)).toBeNull();
  });

  it("deletes every note with its Workspace", async () => {
    const s = await setup();
    await ensureWorkspaceKey(s.w.id);
    await s.send(45, "Gone with it.");
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    await db().from("workspaces").update({ last_used_at: ago(100), unused_warned_at: ago(15), unused_wait_days: 14 }).eq("id", s.w.id).throwOnError();
    await db().from("deliveries").insert({ workspace_id: s.w.id, connector: "email", recipient_id: s.sara, kind: "notice", subject: "Your Ziffr Workspace will be deleted", body: "x", mail_state: "sent", created_at: ago(14) }).throwOnError();
    // The one deletion that takes a single Workspace by its id; a job over all of them is not for a shared database.
    expect((await db().rpc("delete_unused_workspace", { p_workspace: s.w.id, p_days: 30 }).throwOnError()).data).toBe(true);
    expect((await db().from("workspaces").select("id").eq("id", s.w.id)).data).toEqual([]);
    expect((await db().from("value_notes").select("id").eq("workspace_id", s.w.id).throwOnError()).data).toEqual([]);
  });

  it("copies no note into a Practice Workspace, and starting over takes the ones written there", async () => {
    const home = await workspace("Home");
    cleanups.push(home.cleanup);
    const me = await home.person("owner", { email: `admin-${randomUUID().slice(0, 8)}@example.test` });
    await db().from("installation_admins").insert({ person_id: me }).throwOnError();
    cleanups.unshift(async () => {
      const { data } = await db().from("workspaces").select("id").eq("practice_for", me).maybeSingle();
      if (data) await db().rpc("delete_practice_workspace", { p_workspace: data.id, p_person: me });
      await db().from("installation_admins").delete().eq("person_id", me);
    });
    const made = await makePracticeWorkspace({ personId: me }, home.id);
    const notesOf = async (ws: string) => (await db().from("value_notes").select("id").eq("workspace_id", ws).throwOnError()).data!;
    expect([await notesOf(made), await notesOf(DEMO_WORKSPACE_ID)]).toEqual([[], []]);
    const { data: values } = await db().from("observations").select("metric_id, period_start").eq("workspace_id", made).limit(1).throwOnError();
    // The copy belongs to made-up people; the note needs a Metric that is the person's own.
    await db().from("metrics").update({ owner_id: me }).eq("id", values![0]!.metric_id).eq("workspace_id", made).throwOnError();
    await writeValueNote({ personId: me, workspaceId: made, role: "owner" }, { metricId: Number(values![0]!.metric_id), period: String(values![0]!.period_start), words: "Practising." });
    expect(await notesOf(made)).toHaveLength(1);
    await startOverPracticeWorkspace({ personId: me }, made, made);
    expect(await notesOf(made)).toEqual([]);
  }, 120_000);
});
