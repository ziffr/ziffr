// Checklist Items for information against the real database (spec 0045, ticket #791; GLOSSARY: Checklist Item,
// Workflow, Quiet Hours, Tell, Group, Contact): an item goes once per Workflow and period on its working day, waits out
// Quiet Hours, expands Groups, honours "stop telling me", never reaches a Contact, is claimed once however many runs
// start together, follows an Asking Schedule, pauses when the Metrics disagree on a period, and what is saved is
// cleaned: limits, people of the Workspace only, who may change it through a key.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CHECKLIST_ITEMS_PER_WORKFLOW, CHECKLIST_TEXT_MAX } from "./alert-limits";
import { db } from "./db";
import { setMyQuietHours } from "./quiet-hours";
import { listTellSubscriptions, setTellStopped } from "./tell";
import { runWorkflows } from "./workflow-engine";
import { saveWorkflow, WorkflowRefused } from "./workflows";
import { archivedMetricHolds } from "./internal/delivery-send";
import { openWorkflowRow, sealedWorkflowConfig } from "./workflow-rows";
import { addWorkingDays } from "./workflow-rules";
import { auditRowsOf, opened, workspace } from "./test/db-fixtures";
import type { ChecklistItem, WorkflowConfig, WorkflowStep } from "./types";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
// Email is set up, as in the Quiet Hours tests, so that a message is queued (and held) instead of waiting in the Outbox.
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
type W = Awaited<ReturnType<typeof ws>>;
const address = (who: string) => `${who}-${Math.random().toString(36).slice(2, 10)}@example.test`;
/** A quiet rule that covers the current hour, the one before and the one after, in UTC, whenever this runs. */
const aroundNow = () => { const h = new Date().getUTCHours(); return { fromHour: (h + 23) % 24, toHour: (h + 2) % 24, days: [], timeZone: null }; };

const item = (over: Partial<Extract<ChecklistItem, { kind: "info" }>> = {}): ChecklistItem => ({ type: "checklist", id: "item-one-aaaa", kind: "info", text: "Invoices for this month must be in by Friday.", day: 1, people: [], groups: [], ...over });
const publish: WorkflowStep = { type: "publish", lock: false };

/** The Delivery rows of the kind `checklist` a person was sent, opened. */
async function messages(w: W, person: string) {
  const { data } = await db().from("deliveries").select("id, kind, subject, body, sender_id, action_id, prompt_id, alert_id, workspace_id, tell_workflow_id, mail_state, not_before").eq("workspace_id", w.id).eq("recipient_id", person).eq("kind", "checklist").order("id");
  return opened("deliveries", w.id, data);
}
const stepRuns = async (workflowId: number) => (await db().from("workflow_step_runs").select("step_id, period_start, kind, sent, skipped").eq("workflow_id", workflowId).order("id")).data ?? [];

/** Sara owns a monthly Workflow with Ann (and Cora, in the Group Finance) to tell; Bob is a member the item does not name. */
async function setup(steps: (WorkflowStep | ((p: { ann: string; bob: string; cora: string; group: number }) => WorkflowStep))[], over: Partial<WorkflowConfig> = {}, period = "month") {
  const w = await ws();
  const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") }); const bob = await w.person("member", { email: address("bob") }); const cora = await w.person("member", { email: address("cora") });
  const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Finance" }).select("id").single();
  await db().from("group_members").insert({ workspace_id: w.id, group_id: g!.id, user_id: cora });
  const who = { ann, bob, cora, group: g!.id as number };
  const flow = await saveWorkflow(w.actor(sara), null, "Month-end close", { dueWorkingDays: 2, steps: [...steps.map((s) => (typeof s === "function" ? s(who) : s)), publish], ...over });
  const m = await w.metric(sara, { name: "Secret revenue", workflow_id: flow, period });
  return { w, sara, ...who, flow, m };
}

describe("an item for information", () => {
  it("goes once, on its working day, to people and Groups, and holds nothing of any Metric", async () => {
    const { w, sara, ann, bob, cora, flow, m } = await setup([(p) => item({ day: 3, people: [p.ann], groups: [p.group] })]);
    await w.value(m.id, "2026-03-01", 777_001, sara);
    // March ended on Tuesday 31 March: working day 3 after it is Friday 3 April.
    expect(await runWorkflows(w.id, "2026-04-01", sara)).not.toContainEqual(expect.stringContaining("checklist item"));
    expect(await runWorkflows(w.id, "2026-04-02", sara)).not.toContainEqual(expect.stringContaining("checklist item"));
    expect(await messages(w, ann)).toHaveLength(0);
    expect(await runWorkflows(w.id, "2026-04-03", sara)).toContainEqual("Month-end close, March 2026: checklist item sent to 2");
    const [first] = await messages(w, ann);
    expect(first).toMatchObject({ kind: "checklist", sender_id: sara, action_id: null, prompt_id: null, alert_id: null });
    expect(first.tell_workflow_id).toBe(flow);
    expect(first.subject).toContain("Month-end close");
    expect(first.subject).toContain("March 2026");
    expect(first.body).toContain("Invoices for this month must be in by Friday.");
    expect(first.body).toContain(`/workflows?id=${flow}`);
    // The Group's member is told as well; Bob, who is not named, is not; and no message names a Metric or a value.
    expect(await messages(w, cora)).toHaveLength(1);
    expect(await messages(w, bob)).toHaveLength(0);
    for (const m1 of [...(await messages(w, ann)), ...(await messages(w, cora))]) expect(`${m1.subject} ${m1.body}`).not.toMatch(/Secret revenue|777/);
    // Once: later runs of the same period send nothing, and the next period sends again.
    await runWorkflows(w.id, "2026-04-03", sara);
    await runWorkflows(w.id, "2026-04-20", sara);
    expect(await messages(w, ann)).toHaveLength(1);
    expect(await stepRuns(flow)).toEqual([{ step_id: "item-one-aaaa", period_start: "2026-03-01", kind: "checklist", sent: 2, skipped: 0 }]);
    // April ended on Thursday 30 April: working day 3 after it is Tuesday 5 May.
    await runWorkflows(w.id, "2026-05-04", sara);
    expect(await messages(w, ann)).toHaveLength(1);
    await runWorkflows(w.id, "2026-05-05", sara);
    expect(await messages(w, ann)).toHaveLength(2);
    expect((await stepRuns(flow)).map((r) => r.period_start)).toEqual(["2026-03-01", "2026-04-01"]);
  });

  it("sends once when three runs start at the same moment", async () => {
    const { w, sara, ann, cora, flow } = await setup([(p) => item({ people: [p.ann], groups: [p.group] })]);
    await Promise.all([runWorkflows(w.id, "2026-04-01", sara), runWorkflows(w.id, "2026-04-01", sara), runWorkflows(w.id, "2026-04-01", sara)]);
    expect(await messages(w, ann)).toHaveLength(1);
    expect(await messages(w, cora)).toHaveLength(1);
    expect(await stepRuns(flow)).toHaveLength(1);
  });

  it("waits out Quiet Hours and is never dropped, and cannot be answered", async () => {
    const { w, sara, ann, bob } = await setup([(p) => item({ people: [p.ann, p.bob] })]);
    await setMyQuietHours(w.actor(ann, "member"), aroundNow());
    await runWorkflows(w.id, "2026-04-01", sara);
    const [held] = await messages(w, ann);
    expect(held.mail_state).toBe("queued");
    expect(new Date(held.not_before as string).getTime()).toBeGreaterThan(Date.now());
    const [free] = await messages(w, bob);
    expect(free.not_before).toBeNull();
  });

  it("is not sent to a person who said \"stop telling me\" for the Workflow, who is listed to say so", async () => {
    const { w, sara, ann, bob, flow } = await setup([(p) => item({ people: [p.ann, p.bob] })]);
    expect(await listTellSubscriptions(w.actor(ann, "member"))).toEqual([{ workflowId: flow, name: "Month-end close", stopped: false }]);
    await setTellStopped(w.actor(ann, "member"), flow, true);
    await runWorkflows(w.id, "2026-04-01", sara);
    expect(await messages(w, ann)).toHaveLength(0);
    expect(await messages(w, bob)).toHaveLength(1);
    expect((await stepRuns(flow))[0]).toMatchObject({ sent: 1, skipped: 1 });
    // A person the item does not name is not told which Workflows are telling others.
    const carl = await w.person("member");
    expect(await listTellSubscriptions(w.actor(carl, "member"))).toEqual([]);
  });

  it("never reaches a Contact or a Feed, not even through a Group", async () => {
    const { w, sara, ann, flow, group } = await setup([(p) => item({ people: [p.ann], groups: [p.group] })]);
    const contact = await w.contact({ email: address("contact") });
    await db().from("group_members").insert({ workspace_id: w.id, group_id: group, user_id: contact });
    // Naming one directly is dropped when the Workflow is saved; one in a Group is dropped when it is sent.
    const flow2 = await saveWorkflow(w.actor(sara), null, "Other", { dueWorkingDays: 0, steps: [item({ id: "item-two-aaaa", people: [contact, ann] }), publish] });
    expect(JSON.stringify(await storedConfig(flow2))).not.toContain(contact);
    await runWorkflows(w.id, "2026-04-01", sara);
    expect(await messages(w, contact)).toHaveLength(0);
    expect(await messages(w, ann)).toHaveLength(1);
    expect((await stepRuns(flow))[0].sent).toBe(2);
  });

  it("follows an Asking Schedule: the Workspace's run leaves it, its own run sends it", async () => {
    const { w, sara, ann, flow } = await setup([(p) => item({ people: [p.ann] })], { asking: { hour: 9, days: { kind: "weekdays" } } });
    await runWorkflows(w.id, "2026-04-01", sara, { scope: "unscheduled" });
    expect(await messages(w, ann)).toHaveLength(0);
    await runWorkflows(w.id, "2026-04-01", sara, { scope: { workflowId: flow + 1000 } });
    expect(await messages(w, ann)).toHaveLength(0);
    await runWorkflows(w.id, "2026-04-01", sara, { scope: { workflowId: flow } });
    expect(await messages(w, ann)).toHaveLength(1);
  });

  it("waits when its Metrics disagree on a period, tells its owner once, and goes on when they agree", async () => {
    const { w, sara, ann, flow } = await setup([(p) => item({ people: [p.ann] })]);
    const quarterly = await w.metric(sara, { name: "NPS", period: "quarter", workflow_id: flow });
    expect(await runWorkflows(w.id, "2026-04-01", sara)).toContain("Month-end close: checklist waits");
    await runWorkflows(w.id, "2026-04-02", sara);
    expect(await messages(w, ann)).toHaveLength(0);
    const { data: notes } = await db().from("deliveries").select("id, kind").eq("workspace_id", w.id).eq("recipient_id", sara).eq("kind", "notice");
    expect(notes).toHaveLength(1);
    await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", quarterly.id);
    await runWorkflows(w.id, "2026-04-03", sara);
    expect(await messages(w, ann)).toHaveLength(1);
    expect((await stepRuns(flow)).map((r) => r.kind)).toEqual(["checklist"]);
  });

  it("does not use up the period while it names nobody", async () => {
    const { w, sara, flow } = await setup([item()]);
    await runWorkflows(w.id, "2026-04-01", sara);
    expect(await stepRuns(flow)).toEqual([]);
  });
});

/** A Workflow's stored config, opened as the core reads it (the Workspace may seal its words). */
async function storedConfig(flow: number): Promise<WorkflowConfig> {
  const { data } = await db().from("workflows").select("id, workspace_id, config").eq("id", flow).single();
  return (await openWorkflowRow(String(data!.workspace_id), data))!.config as WorkflowConfig;
}

/** Says the day an item was added, as it was when its first runs began (saving gives it today's date). */
async function addedOn(w: W, flow: number, day: string) {
  const config = await storedConfig(flow);
  const steps = config.steps.map((x) => (x.type === "checklist" ? { ...x, addedOn: day } : x));
  await db().from("workflows").update({ config: await sealedWorkflowConfig(w.id, flow, { ...config, steps }) }).eq("id", flow);
}

describe("an item whose day is longer than the period", () => {
  it("sends a monthly item with day 25 in the second month after, once, and not the past of a new item", async () => {
    const { w, sara, ann, flow } = await setup([(p) => item({ day: 25, people: [p.ann] })]);
    await addedOn(w, flow, "2026-04-10");
    const due = addWorkingDays("2026-03-31", 25);
    await runWorkflows(w.id, addWorkingDays("2026-03-31", 24), sara);
    expect(await messages(w, ann)).toHaveLength(0);
    await runWorkflows(w.id, due, sara);
    await runWorkflows(w.id, due, sara);
    expect((await stepRuns(flow)).map((r) => r.period_start)).toEqual(["2026-03-01"]);
    expect(await messages(w, ann)).toHaveLength(1);
  });
  it("sends a weekly item with day 6 a week later", async () => {
    const { w, sara, ann, flow } = await setup([(p) => item({ day: 6, people: [p.ann] })], {}, "week");
    await addedOn(w, flow, "2026-03-10");
    await runWorkflows(w.id, addWorkingDays("2026-03-08", 6), sara);
    expect((await stepRuns(flow)).map((r) => r.period_start)).toEqual(["2026-03-02"]);
    expect(await messages(w, ann)).toHaveLength(1);
  });
  it("sends a daily item with day 2 two working days later, not the day just ended", async () => {
    const { w, sara, flow } = await setup([(p) => item({ day: 2, people: [p.ann] })], {}, "day");
    await addedOn(w, flow, "2026-03-10");
    await runWorkflows(w.id, "2026-03-10", sara);
    const periods = (await stepRuns(flow)).map((r) => r.period_start);
    expect(periods).toContain("2026-03-06");
    expect(periods).not.toContain("2026-03-09");
  });
});

describe("what is left of an item when it is saved and sent", () => {
  it("strips characters that make words read other than written", async () => {
    const { w, sara, flow } = await setup([]);
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [item({ text: "Pay\u202Etxt.exe\u200B now\u2028ok" }), publish] });
    const [saved] = (await storedConfig(flow)).steps.filter((x): x is ChecklistItem => x.type === "checklist");
    expect(saved.text).toBe("Paytxt.exe nowok");
  });
  it("is not sent to someone who has left the Workspace since it was queued", async () => {
    const { w, sara, ann, flow } = await setup([(p) => item({ people: [p.ann] })]);
    await runWorkflows(w.id, "2026-04-01", sara);
    const [d] = await messages(w, ann);
    const about = { id: d.id as number, workspace_id: w.id, kind: "checklist", recipient_id: ann, tell_workflow_id: flow };
    expect(await archivedMetricHolds(about)).toBeNull();
    await w.dropMember(ann);
    expect(await archivedMetricHolds(about)).toMatch(/no longer in the Workspace/);
  });
});

describe("saving Checklist Items", () => {
  const savedItems = async (flow: number) => (await storedConfig(flow)).steps.filter((s): s is ChecklistItem => s.type === "checklist");

  it("keeps people and Groups of the Workspace only, trims the words, keeps the id, and limits days", async () => {
    const { w, sara, ann, flow, group } = await setup([item()]);
    const other = await workspace(); cleanups.push(other.cleanup);
    const stranger = await other.person("member");
    const { data: foreign } = await db().from("groups").insert({ workspace_id: other.id, name: "Elsewhere" }).select("id").single();
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [item({ id: "item-one-aaaa", text: "  Close the books.  ", day: 99, people: [ann, stranger, ann], groups: [group, foreign!.id as number], readGroup: foreign!.id as number }), publish] });
    const [saved] = await savedItems(flow);
    expect(saved).toEqual({ type: "checklist", id: "item-one-aaaa", kind: "info", text: "Close the books.", day: 30, people: [ann], groups: [group], addedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [{ ...saved, readGroup: group }, publish] });
    expect((await savedItems(flow))[0]).toMatchObject({ id: "item-one-aaaa", readGroup: group });
    // A new item, or one with a malformed id, is given one.
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [item({ id: "x" }), item({ id: "" }), publish] });
    const ids = (await savedItems(flow)).map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => /^[A-Za-z0-9-]{8,40}$/.test(id))).toBe(true);
  });

  it("holds 20 items besides the other 12 steps, and refuses words that are empty or too long", async () => {
    const { w, sara, flow } = await setup([]);
    const many = Array.from({ length: CHECKLIST_ITEMS_PER_WORKFLOW + 3 }, (_, i) => item({ id: `item-number-${String(i).padStart(2, "0")}` }));
    const others: WorkflowStep[] = Array.from({ length: 14 }, () => ({ type: "remind", daysBefore: 1 }));
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [...others, ...many, publish] });
    const config = await storedConfig(flow);
    expect(config.steps.filter((s) => s.type === "checklist")).toHaveLength(CHECKLIST_ITEMS_PER_WORKFLOW);
    expect(config.steps.filter((s) => s.type === "remind")).toHaveLength(12);
    await expect(saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [item({ text: "   " }), publish] })).rejects.toThrow(/needs its words/);
    await expect(saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [item({ text: "x".repeat(CHECKLIST_TEXT_MAX + 1) }), publish] })).rejects.toThrow(/at most 500/);
    for (const text of ["Two\nlines", "Pay at https://evil.example now", "See evil.com", "<b>bold</b>", "{metric}"]) {
      await expect(saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [item({ text }), publish] })).rejects.toThrow(/plain words only/);
    }
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [item({ text: "é".repeat(CHECKLIST_TEXT_MAX) }), publish] });
    expect((await savedItems(flow))[0].text).toHaveLength(CHECKLIST_TEXT_MAX);
  });

  it("is something only the owner of the Workflow changes", async () => {
    const { w, ann, flow } = await setup([item()]);
    await expect(saveWorkflow(w.actor(ann, "member"), flow, "Mine now", { dueWorkingDays: 0, steps: [publish] })).rejects.toThrow();
  });

  it("is not changed by a key without workflows:people, which must send its items exactly as read", async () => {
    const { w, sara, ann, flow } = await setup([(p) => item({ people: [p.ann] })]);
    const [saved] = await savedItems(flow);
    // As read: accepted. Another word, another person or no item at all: refused, and a new item too.
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 3, steps: [saved, publish] }, { keepPeople: true });
    for (const steps of [[{ ...saved, text: "Something else." }], [{ ...saved, people: [ann, sara] }], [], [saved, item({ id: "item-new-aaaa", people: [ann] })]]) {
      await expect(saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 3, steps: [...steps, publish] }, { keepPeople: true })).rejects.toBeInstanceOf(WorkflowRefused);
    }
    await expect(saveWorkflow(w.actor(sara), null, "New", { dueWorkingDays: 3, steps: [item({ people: [ann] }), publish] }, { keepPeople: true })).rejects.toBeInstanceOf(WorkflowRefused);
    expect((await savedItems(flow))).toEqual([saved]);
  });

  it("is recorded in the Audit Log by id and count, never by its words", async () => {
    const { w, sara, ann, flow } = await setup([]);
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [item({ id: "item-one-aaaa", text: "A very private sentence.", people: [ann] }), publish] });
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 2, steps: [item({ id: "item-one-aaaa", text: "A very private sentence.", people: [] }), publish] });
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 3, steps: [item({ id: "item-one-aaaa", text: "A very private sentence.", people: [] }), publish] });
    await saveWorkflow(w.actor(sara), flow, "Month-end close", { dueWorkingDays: 3, steps: [publish] });
    const rows = await auditRowsOf(w.id, "workflow.checklist_set");
    expect(rows.map((r) => (r as { details: unknown }).details)).toEqual([
      expect.objectContaining({ added: 1, removed: 0, changed: 0, added_ids: ["item-one-aaaa"] }),
      expect.objectContaining({ added: 0, removed: 0, changed: 1, changed_ids: ["item-one-aaaa"] }),
      expect.objectContaining({ added: 0, removed: 1, changed: 0, removed_ids: ["item-one-aaaa"] }),
    ]);
    expect(JSON.stringify(rows)).not.toContain("private sentence");
  });
});
