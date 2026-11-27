// Where Value Notes are shown, against the real database (spec 0064, #1314; GLOSSARY: Value Note, Quick look, Period
// Timeline, Approval): each list, mark and message gives a note only to who is shown its value, a Guest reads no names,
// a Total's notes stay with those who are shown what it adds up, and an Approval's task quotes the note as it leaves.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { archiveMetric } from "./archived-metrics";
import { metricHistory } from "./dashboards";
import { db } from "./db";
import { withApprovalNote } from "./internal/approval-note";
import { sendDelivery, type MailTransport } from "./mail";
import { openRows } from "./sealed-columns";
import { periodTimeline } from "./period-timeline";
import { metricQuickLook } from "./quick-look";
import { submitValue } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { createTotal } from "./total-changes";
import { currentValueNotes, noteKey, periodsWithNotes, periodValueNotes, writeValueNote } from "./value-notes";
import { saveWorkflow, setMetricWorkflow } from "./workflows";

// Mail is set up, to a port nothing listens on: a message waits in the queue until the test sends it to itself.
const SETTINGS = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const P = "2026-03-01";
const BEFORE = "2026-02-01";

/** Sara owns a Metric; Ann sends its values, Ben sees it, Cleo does not, Gus is a Guest it is shared with. */
async function setup(over: Record<string, unknown> = {}) {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: `sara-${randomUUID().slice(0, 8)}@example.test` });
  const ann = await w.person("member"); const ben = await w.person("member"); const cleo = await w.person("member"); const gus = await w.person("guest");
  const m = await w.metric(sara, { sources: ["web_form", "api"], ...over });
  for (const p of [ann, ben, gus]) await w.share(m.id, p);
  const code = await w.token(m.id, ann);
  const as = (p: string): Actor => w.actor(p, p === sara ? "owner" : p === gus ? "guest" : "member");
  const send = (value: number, valueNote?: string, period = P) => submitValue({ source: "api", sender: code, text: String(value), value: { value }, period, valueNote, workspaceId: w.id });
  return { w, sara, ann, ben, cleo, gus, m, as, send };
}

describe("notes in lists", () => {
  it("gives the current notes of the asked periods to who sees them, and says who may write", async () => {
    const s = await setup();
    await s.send(40, "February was quiet.", BEFORE);
    await s.send(45, "Two fairs.");
    const seen = await currentValueNotes(s.as(s.ben), s.m.id, [P, BEFORE, "2026-01-01", "nonsense", "2026-03-02"]);
    expect(Object.keys(seen).sort()).toEqual([BEFORE, P]);
    expect(seen[P]!.map((n) => n.words)).toEqual(["Two fairs."]);
    expect(seen[P]![0]).not.toHaveProperty("mayCorrect");
    expect(await currentValueNotes(s.as(s.cleo), s.m.id, [P])).toEqual({});
    expect((await currentValueNotes(s.as(s.gus), s.m.id, [P]))[P]![0]!.author).toBe("Someone");
    expect(await currentValueNotes({ ...s.as(s.sara), key: {} } as unknown as Actor, s.m.id, [P])).toEqual({});
    const other = await setup();
    expect(await currentValueNotes(other.as(other.sara), s.m.id, [P])).toEqual({});

    // A page that shows the current notes alone is given no history to hand its browser.
    const alone = (await periodValueNotes(s.as(s.ben), s.m.id, P, { currentOnly: true }))!;
    expect([alone.current.map((n) => n.words), alone.history]).toEqual([["Two fairs."], []]);

    expect((await metricQuickLook(s.as(s.ben), s.m.slug)).notes.map((n) => n.words)).toEqual(["Two fairs."]);
    expect((await metricHistory(s.as(s.ben), s.m.id)).notes[BEFORE]!.map((n) => n.words)).toEqual(["February was quiet."]);

    const may = async (p: string) => (await periodValueNotes(s.as(p), s.m.id, P))!.mayWrite;
    expect([await may(s.sara), await may(s.ann), await may(s.ben), await may(s.gus)]).toEqual([true, true, false, false]);
    await archiveMetric(s.as(s.sara), s.m.id);
    expect(await may(s.sara)).toBe(false);
  });

  it("shows nothing of a Total's notes to someone who is not shown what it adds up", async () => {
    const s = await setup({ aggregation: "last" });
    await s.send(45);
    const eva = await s.w.metric(s.sara, { name: "Commit Eva", aggregation: "last" });
    await s.w.value(eva.id, P, 5);
    const total = await createTotal(s.as(s.sara), { name: "Commit", parts: [s.m.id, eva.id] }, { recordCreated: async () => undefined, promptSubmitter: async () => false as const });
    await writeValueNote(s.as(s.sara), { metricId: total.id, period: P, words: "Both regions." });
    await s.w.share(total.id, s.ben);
    const of = [{ metricId: total.id, period: P }];
    expect(await currentValueNotes(s.as(s.ben), total.id, [P])).toEqual({});
    expect((await periodsWithNotes(s.as(s.ben), of)).size).toBe(0);
    expect((await metricQuickLook(s.as(s.ben), total.slug)).notes).toEqual([]);
    expect((await metricHistory(s.as(s.ben), total.id)).notes).toEqual({});
    await s.w.share(eva.id, s.ben);
    expect([...(await periodsWithNotes(s.as(s.ben), of))]).toEqual([noteKey(total.id, P)]);
    expect((await metricHistory(s.as(s.ben), total.id)).notes[P]!.map((n) => n.words)).toEqual(["Both regions."]);
    // The sum has changed since the note: the number it showed then goes to the Total's owner only.
    await s.send(55);
    const seenBy = async (p: string) => (await periodValueNotes(s.as(p), total.id, P))!;
    expect((await seenBy(s.sara)).current[0]!.writtenWhenItShowed).toBe(50);
    expect((await seenBy(s.ben)).current[0]!.writtenWhenItShowed).toBeNull();
    expect((await seenBy(s.ben)).history.map((e) => e.saidOf)).toEqual([null]);
  });

  it("offers no writing in the demo", async () => {
    const { data } = await db().from("metrics").select("id, owner_id").eq("workspace_id", DEMO_WORKSPACE_ID).eq("slug", "revenue").maybeSingle();
    if (!data) return;
    const { data: last } = await db().from("observations").select("period_start").eq("metric_id", data.id).order("period_start", { ascending: false }).limit(1).single();
    const seen = await periodValueNotes({ personId: data.owner_id as string, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, data.id as number, String(last!.period_start));
    expect(seen).toMatchObject({ mayWrite: false, mayDeleteForGood: false });
  });
});

describe("the Period Timeline", () => {
  it("marks a value with a note for who may read it, without a word of it", async () => {
    const s = await setup();
    const workflowId = await saveWorkflow(s.as(s.sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "publish", lock: false }] });
    await setMetricWorkflow(s.as(s.sara), s.m.id, workflowId);
    await s.send(45, "A secret reason.");
    const mine = await periodTimeline(s.as(s.ben), workflowId, P);
    const line = mine.events.find((e) => e.kind === "in")!;
    expect(line.text).toContain(", with a note");
    expect(JSON.stringify(mine)).not.toContain("secret reason");
    expect(JSON.stringify(await periodTimeline(s.as(s.cleo), workflowId, P))).not.toContain("with a note");
  });
});

describe("an Approval's message", () => {
  it("quotes the note as it leaves, cut, and never keeps it with the Delivery", async () => {
    const s = await setup();
    const workflowId = await saveWorkflow(s.as(s.sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [s.sara], values: "every" }, { type: "publish", lock: false }] });
    await setMetricWorkflow(s.as(s.sara), s.m.id, workflowId);
    await s.send(45, `Two fairs. ${"x".repeat(400)}`);
    const { data: d } = await db().from("deliveries").select("*").eq("workspace_id", s.w.id).eq("recipient_id", s.sara).eq("kind", "task").single();
    const [kept] = await openRows("deliveries", s.w.id, [d!]);
    expect(String(kept!.body)).not.toContain("fairs");
    await db().from("deliveries").update({ mail_state: "queued", attempts: 0, last_attempt_at: null }).eq("id", d!.id);
    const sent: { text: string }[] = [];
    const transport: MailTransport = async (mail) => { sent.push({ text: String(mail.text) }); return { messageId: "test" }; };
    expect(await sendDelivery(d!.id as number, transport)).toBe("sent");
    expect(sent[0]!.text).toContain("> Two fairs. xxx");
    expect(sent[0]!.text).toContain(`${"x".repeat(289)}…`);
    expect(sent[0]!.text).not.toContain("x".repeat(290));
    const after = (await db().from("deliveries").select("*").eq("id", d!.id).single()).data!;
    expect(String((await openRows("deliveries", s.w.id, [after]))[0]!.body)).not.toContain("fairs");
  });

  it("gives its Approver only what they may read: no names to a Guest, nothing without sight or to anyone else", async () => {
    const s = await setup();
    await s.send(45, "Two fairs.");
    const body = "Approve it.\n\nOpen it: https://ziffr.example.test/actions/1";
    const quote = async (assignee: string, recipient = assignee, purpose = "approval") => {
      const action = await s.w.action({ metric_id: s.m.id, period_start: P, asker_id: s.ann, assignee_id: assignee, kind: "task", purpose });
      return withApprovalNote(body, { workspace_id: s.w.id, recipient_id: recipient, kind: "task", action_id: action }, "email");
    };
    expect(await quote(s.gus)).toContain("Note from Someone:");
    expect(await quote(s.cleo)).toBe(body);
    expect(await quote(s.ben, s.ann)).toBe(body);
    expect(await quote(s.ben, s.ben, "self_check")).toBe(body);
  });
});
