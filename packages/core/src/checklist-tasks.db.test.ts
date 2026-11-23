// Checklist Tasks against the real database (spec 0045, ticket #792; GLOSSARY: Checklist Item, Task, Assignee, Due Date,
// Stand-in, Away, Escalation, Group, Guest): an item to tick off gives one Task per period, to the Stand-in while the
// Assignee is Away; the Workflow's Remind and Escalate steps treat it as a missing value, once; it is ticked off with an
// optional note in the app, by a reply, through the API and the MCP Server; it is read by the people on it, the Workspace's
// Members unless its item names a Group, and by a Guest only when it is theirs; it is in the Schedule and in the period's
// progress; no Webhook hears of it; and every query that reads `actions.metric_id` copes with a Task that has none.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mailHostResolver } from "./mail-hosts";
import { createWebhook } from "./webhooks";
import { actorForSecret, createAccessKey } from "./access-keys";
import type { KeyActor, Scope } from "./actor";
import { actionsAskedByMe } from "./actions-overview";
import { ActionRefused, listActionsWithKey, markDoneWithKey, replyWithKey } from "./api-actions";
import { readableActions } from "./access";
import { db } from "./db";
import { actionThread } from "./page-data";
import { periodTimeline } from "./period-timeline";
import { markTaskDone, reply, setActionStatus } from "./questions";
import { remindDueTasks } from "./scheduled-runs";
import { calendarEntries, entryTitle, schedule } from "./schedule";
import { runWorkflows } from "./workflow-engine";
import { saveWorkflow } from "./workflows";
import { routeReply } from "./reply-routing";
import { opened, workspace } from "./test/db-fixtures";
import type { ChecklistItem, WorkflowStep } from "./types";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
const savedKey = process.env.ZIFFR_SECRETS_KEY;
const realLookup = mailHostResolver.lookup;
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 79).toString("base64");
  mailHostResolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  for (const c of cleanups.splice(0)) await c();
  if (savedKey === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = savedKey;
});

const WORDS = "Reconcile the bank account.";
const KEPT = "Finance only: reconcile the loan account.";
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const tick = (over: Partial<Extract<ChecklistItem, { kind: "tick" }>> & { id?: string } = {}) => ({ type: "checklist", id: "tick-bank-aaaa", kind: "tick", text: WORDS, assignee: null, dueWorkingDays: 3, ...over }) as ChecklistItem;
const publish: WorkflowStep = { type: "publish", lock: false };

/** Sara owns a monthly Workflow "Month-end close" with Ann (assignee, Bea her stand-in), Cora (in Finance), Dan (a Member
 * the item does not name), Gus (a Guest) and Hal (a Guest who is asked). March 2026 ended on Tuesday 31 March. */
async function setup(steps: (WorkflowStep | ((p: { ann: string; bea: string; hal: string; finance: number }) => WorkflowStep))[], opts: { assignee?: "ann" | "hal"; period?: string } = {}) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member"); const bea = await w.person("member"); const cora = await w.person("member"); const dan = await w.person("member");
  const gus = await w.person("guest"); const hal = await w.person("guest"); const ada = await w.person("admin");
  const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Finance" }).select("id").single();
  const finance = g!.id as number;
  await db().from("group_members").insert([{ workspace_id: w.id, group_id: finance, user_id: cora }, { workspace_id: w.id, group_id: finance, user_id: ann }]);
  const who = { ann, bea, hal, finance };
  const flow = await saveWorkflow(w.actor(sara), null, "Month-end close", { dueWorkingDays: 2, steps: [...steps.map((s) => (typeof s === "function" ? s(who) : s)), publish] });
  const m = await w.metric(sara, { name: "Secret revenue", workflow_id: flow, period: opts.period ?? "month" });
  await w.value(m.id, "2026-03-01", 777_001, sara);
  return { w, sara, ann, bea, cora, dan, gus, hal, ada, finance, flow, m };
}
type S = Awaited<ReturnType<typeof setup>>;
const as = (s: S, id: string, role: "owner" | "admin" | "member" | "guest") => s.w.actor(id, role);

const tasks = async (s: S) => (await db().from("actions").select("*").eq("workspace_id", s.w.id).eq("purpose", "checklist").order("id")).data ?? [];
const given = async (s: S) => (await opened("actions", s.w.id, await tasks(s))) as Record<string, unknown>[];
const rows = async (s: S, who: string, kind: string) => (await db().from("deliveries").select("id, kind, subject, body, action_id").eq("workspace_id", s.w.id).eq("recipient_id", who).eq("kind", kind).order("id")).data ?? [];
const key = async (s: S, person: string, role: "owner" | "admin" | "member", scopes: Scope[]): Promise<KeyActor> => {
  const { secret } = await createAccessKey(s.w.actor(person, role), { name: "Program", scopes, expiresOn: inDays(30) });
  return (await actorForSecret(secret)) as KeyActor;
};

describe("giving the Task", () => {
  it("gives one Task per item and period, about the Workflow and no Metric, due after the period", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    expect(await runWorkflows(s.w.id, "2026-04-01", s.sara)).toContainEqual("Month-end close, March 2026: gave a checklist task to " + s.ann);
    const [t] = await given(s);
    expect(t).toMatchObject({ kind: "task", purpose: "checklist", metric_id: null, workflow_id: s.flow, checklist_item_id: "tick-bank-aaaa", period_start: "2026-03-01", asker_id: s.sara, assignee_id: s.ann, status: "open", question: WORDS, due_date: "2026-04-03" });
    // Ann is told: a message about the Workflow and its period, never a Metric.
    const [msg] = await opened("deliveries", s.w.id, await rows(s, s.ann, "task"));
    expect(`${msg.subject} ${msg.body}`).toContain("Month-end close");
    expect(`${msg.subject} ${msg.body}`).toContain("March 2026");
    expect(`${msg.subject} ${msg.body}`).not.toMatch(/Secret revenue|777/);
    // Once: later runs of the period give nothing; the next period gives its own.
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    await runWorkflows(s.w.id, "2026-04-20", s.sara);
    expect(await tasks(s)).toHaveLength(1);
    await runWorkflows(s.w.id, "2026-05-04", s.sara);
    expect((await tasks(s)).map((x) => x.period_start)).toEqual(["2026-03-01", "2026-04-01"]);
  });

  it("gives once when three runs start at the same moment, and nothing for an item that names nobody", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann }), tick({ id: "tick-nobody-aaa", text: "Nobody yet", assignee: null })]);
    await Promise.all([runWorkflows(s.w.id, "2026-04-01", s.sara), runWorkflows(s.w.id, "2026-04-01", s.sara), runWorkflows(s.w.id, "2026-04-01", s.sara)]);
    expect(await tasks(s)).toHaveLength(1);
  });

  it("is refused by the database for a second Task of an item and period, and for a Task with no Metric that is not a checklist's", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const base = { workspace_id: s.w.id, asker_id: s.sara, assignee_id: s.ann, question: "x", kind: "task", period_start: "2026-03-01" };
    expect((await db().from("actions").insert({ ...base, purpose: "checklist", workflow_id: s.flow, checklist_item_id: "tick-bank-aaaa", metric_id: null })).error).not.toBeNull();
    expect((await db().from("actions").insert({ ...base, metric_id: null })).error).not.toBeNull();
    expect((await db().from("actions").insert({ ...base, purpose: "checklist", metric_id: null })).error).not.toBeNull();
    // No purpose and no Metric is refused too (a null purpose must not slip past the check).
    expect((await db().from("actions").insert({ ...base, metric_id: null, workflow_id: s.flow, checklist_item_id: "tick-other-aaaa" })).error).not.toBeNull();
    expect((await db().from("actions").insert({ ...base, purpose: "approval", workflow_id: s.flow, checklist_item_id: "x", metric_id: s.m.id })).error).not.toBeNull();
  });

  it("goes to the Stand-in while the Assignee is Away, saying so without naming anyone", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann, standIn: p.bea })]);
    await db().from("away").insert({ user_id: s.ann, starts: "2026-03-30", ends: "2026-04-10" });
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const [t] = await given(s);
    expect(t.assignee_id).toBe(s.bea);
    const { data: notes } = await db().from("thread_messages").select("body, author_id").eq("action_id", t.id as number);
    expect(notes).toHaveLength(1);
    expect(notes![0].author_id).toBe(s.sara);
    expect(await rows(s, s.bea, "task")).toHaveLength(1);
    expect(await rows(s, s.ann, "task")).toHaveLength(0);
  });

  it("goes to the Assignee, and the owner is told, when they are Away without a Stand-in", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    await db().from("away").insert({ user_id: s.ann, starts: "2026-03-30", ends: "2026-04-10" });
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    expect((await given(s))[0].assignee_id).toBe(s.ann);
    expect((await rows(s, s.sara, "notice")).length).toBe(1);
  });
});

describe("Remind and Escalate, as for a missing value", () => {
  it("reminds once before the Due Date and not again by the generic reminder, and escalates once to the Stand-in", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann, standIn: p.bea }), { type: "remind", daysBefore: 1 }, { type: "escalate", to: "stand-in", daysAfter: 1 }]);
    // Due Friday 3 April: the Remind step goes on Thursday 2 April.
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    expect(await rows(s, s.ann, "reminder")).toHaveLength(0);
    const ran = await runWorkflows(s.w.id, "2026-04-02", s.sara);
    expect(ran).toContainEqual("Month-end close: reminded of a checklist task");
    await runWorkflows(s.w.id, "2026-04-02", s.sara);
    expect(await rows(s, s.ann, "reminder")).toHaveLength(1);
    // The generic due-Task reminder skips it, so nobody is reminded twice.
    expect(await remindDueTasks(s.w.id, "2026-04-02")).toBe(0);
    expect(await rows(s, s.ann, "reminder")).toHaveLength(1);
    // The Escalation is after the day after the Due Date: Monday 6 April.
    await runWorkflows(s.w.id, "2026-04-04", s.sara);
    expect((await given(s))[0].assignee_id).toBe(s.ann);
    expect(await runWorkflows(s.w.id, "2026-04-06", s.sara)).toContainEqual("Month-end close: handed a checklist task to the stand-in");
    await runWorkflows(s.w.id, "2026-04-07", s.sara);
    const [t] = await given(s);
    expect(t).toMatchObject({ assignee_id: s.bea, previous_assignee_id: s.ann });
    expect(await rows(s, s.bea, "task")).toHaveLength(1);
    // The first Assignee keeps reading it and may still answer.
    expect((await readableActions(s.w.id, s.ann)).map((a) => a.id)).toContain(t.id);
    await reply(as(s, s.ann, "member"), t.id as number, "I am back.", null);
    // Once Ann has left the Workspace she answers nothing, and the handover clears her place on it.
    await s.w.dropMember(s.ann);
    await expect(reply(as(s, s.ann, "member"), t.id as number, "Still me.", null)).rejects.toThrow();
  });

  it("tells the Workflow's owner when the step asks the owner, once", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann }), { type: "escalate", to: "owner", daysAfter: 0 }]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const notices = async () => (await rows(s, s.sara, "notice")).length;
    const before = await notices();
    await runWorkflows(s.w.id, "2026-04-06", s.sara);
    await runWorkflows(s.w.id, "2026-04-07", s.sara);
    expect(await notices()).toBe(before + 1);
    // No Metric owner is asked: nothing is made for Ann but the Task she has.
    expect((await db().from("actions").select("id").eq("workspace_id", s.w.id).eq("purpose", "escalation")).data).toHaveLength(0);
  });

  it("does not remind or escalate a Task that is done", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann }), { type: "remind", daysBefore: 1 }, { type: "escalate", to: "owner", daysAfter: 0 }]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const [t] = await given(s);
    await markTaskDone(as(s, s.ann, "member"), t.id as number);
    const before = (await db().from("deliveries").select("id").eq("workspace_id", s.w.id)).data!.length;
    await runWorkflows(s.w.id, "2026-04-06", s.sara);
    expect((await db().from("deliveries").select("id").eq("workspace_id", s.w.id)).data!.length).toBe(before);
  });
});

describe("ticking off", () => {
  it("closes the Task with an optional note as the Thread's last reply, in the app, and tells the asker", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const [t] = await given(s);
    await expect(markTaskDone(as(s, s.dan, "member"), t.id as number)).rejects.toThrow();
    await markTaskDone(as(s, s.ann, "member"), t.id as number, undefined, "Matched, one open item of 12 €.");
    expect((await given(s))[0].status).toBe("closed");
    const msgs = await opened("thread_messages", s.w.id, (await db().from("thread_messages").select("*").eq("action_id", t.id as number).order("id")).data);
    expect(msgs.at(-1)).toMatchObject({ author_id: s.ann, body: "Matched, one open item of 12 €." });
    expect((await rows(s, s.sara, "reply")).length).toBe(1);
    // Again is not an error of the engine, only "not open".
    await expect(markTaskDone(as(s, s.ann, "member"), t.id as number)).rejects.toThrow(/not open/);
  });

  it("is ticked off by the reply \"done\" with the rest as its note; any other reply is only words", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const [t] = await given(s);
    await reply(as(s, s.ann, "member"), t.id as number, "Working on it, bank file is late.", null);
    await reply(as(s, s.ann, "member"), t.id as number, "Done? Not yet, one file is missing.", null);
    await reply(as(s, s.ann, "member"), t.id as number, "done with the first half", null);
    expect((await given(s))[0].status).toBe("open");
    await reply(as(s, s.ann, "member"), t.id as number, "done: All matched.", null);
    expect((await given(s))[0].status).toBe("closed");
    const msgs = await opened("thread_messages", s.w.id, (await db().from("thread_messages").select("*").eq("action_id", t.id as number).order("id")).data);
    expect(msgs.map((m) => m.body)).toEqual(["Working on it, bank file is late.", "Done? Not yet, one file is missing.", "done with the first half", "All matched."]);
  });

  it("is ticked off by a reply that came back through a Connector for the Task's message", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const [t] = await given(s);
    const [d] = await rows(s, s.ann, "task");
    const answers: string[] = [];
    const outcome = await routeReply({ id: d.id as number, workspace_id: s.w.id, recipient_id: s.ann, kind: "task", action_id: t.id as number, prompt_id: null }, "done", { source: "mail", sender: "ann", answer: async (subject) => { answers.push(subject); } });
    expect(outcome).toBe("replied");
    expect((await given(s))[0].status).toBe("closed");
  });

  it("is ticked off through the API with a note, only by its own Assignee and never by a stranger", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const [t] = await given(s);
    const id = t.id as number;
    await expect(markDoneWithKey(await key(s, s.dan, "member", ["actions:write"]), id, { type: "api" })).rejects.toThrow();
    // The owner who asked is on it, but it is not theirs to tick off.
    await expect(markDoneWithKey(await key(s, s.sara, "owner", ["actions:write"]), id, { type: "api" })).rejects.toBeInstanceOf(ActionRefused);
    const done = await markDoneWithKey(await key(s, s.ann, "member", ["actions:write"]), id, { type: "mcp" }, "Done through my assistant.");
    expect(done).toMatchObject({ status: "closed", purpose: "checklist", metric: null, workflow: { id: s.flow, name: "Month-end close" } });
    const msgs = await opened("thread_messages", s.w.id, (await db().from("thread_messages").select("*").eq("action_id", id).order("id")).data);
    expect(msgs.at(-1)!.body).toBe("Done through my assistant.");
  });

  it("keeps a program's reply as words: it never ticks the Task off", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const [t] = await given(s);
    const r = await replyWithKey(await key(s, s.ann, "member", ["actions:write"]), t.id as number, { body: "done" }, { type: "api" });
    expect(r.status).toBe("open");
  });

  it("can be reopened by the owner who asked, and the period shows it open again", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const [t] = await given(s);
    // The asker cannot close it by hand: only the Assignee ticks it off.
    await expect(setActionStatus(as(s, s.sara, "owner"), t.id as number, "closed")).rejects.toThrow(/ticking it off/);
    await markTaskDone(as(s, s.ann, "member"), t.id as number);
    expect((await periodTimeline(as(s, s.sara, "owner"), s.flow, "2026-03-01")).checklist).toEqual({ done: 1, of: 1 });
    await setActionStatus(as(s, s.sara, "owner"), t.id as number, "open");
    expect((await periodTimeline(as(s, s.sara, "owner"), s.flow, "2026-03-01")).checklist).toEqual({ done: 0, of: 1 });
  });

  it("tells no Webhook, in any state", async () => {
    const s = await setup([(p) => tick({ assignee: p.ann })]);
    await createWebhook(as(s, s.sara, "owner"), { name: "To Do", url: "https://todo.example.test/hook/1", events: ["action.created", "action.updated", "action.done", "action.answered"] });
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const [t] = await given(s);
    await reply(as(s, s.ann, "member"), t.id as number, "A word.", null);
    await markTaskDone(as(s, s.ann, "member"), t.id as number, undefined, "ok");
    expect((await db().from("webhook_sends").select("id").eq("workspace_id", s.w.id)).data).toHaveLength(0);
    // A plain Task, in the same Workspace, is heard (so the silence above is the Checklist Task's own).
    const plain = await s.w.action({ metric_id: s.m.id, period_start: "2026-03-01", asker_id: s.sara, assignee_id: s.ann, kind: "task", question: "Send the report" });
    await markTaskDone(as(s, s.ann, "member"), plain);
    expect((await db().from("webhook_sends").select("id").eq("workspace_id", s.w.id)).data!.length).toBeGreaterThan(0);
  });
});

describe("who reads a Checklist Task", () => {
  /** Ann has the Task; Bea is its Stand-in; Cora is in Finance, which the item may name; Dan is a Member outside it. */
  async function kept() {
    const s = await setup([(p) => tick({ assignee: p.ann, standIn: p.bea, readGroup: p.finance, text: KEPT }), (p) => tick({ id: "tick-open-aaaaa", text: WORDS, assignee: p.hal })]);
    await runWorkflows(s.w.id, "2026-04-01", s.sara);
    const all = await given(s);
    return { s, keptTask: all.find((a) => a.checklist_item_id === "tick-bank-aaaa")!, openTask: all.find((a) => a.checklist_item_id === "tick-open-aaaaa")! };
  }
  const reads = async (s: S, id: string) => (await readableActions(s.w.id, id)).filter((a) => a.purpose === "checklist").map((a) => a.id).sort((x, y) => x - y);

  it("is read by the people on it, by Finance's people when it is kept to a Group, never by a Member outside it, and by a Guest only when it is theirs", async () => {
    const { s, keptTask, openTask } = await kept();
    const k = keptTask.id as number; const o = openTask.id as number;
    // The item kept to Finance: Ann (on it), Sara (asked), Cora (Finance); not Dan, not Bea (stand-in, not on it yet), not Ada, not the
    // Guests. The other item has no Group: every Member reads it, and a Guest only if it is theirs.
    const both = [k, o].sort((x, y) => x - y);
    expect(await reads(s, s.ann)).toEqual(both);
    expect(await reads(s, s.sara)).toEqual(both);
    expect(await reads(s, s.cora)).toEqual(both);
    expect(await reads(s, s.dan)).toEqual([o]);
    expect(await reads(s, s.ada)).toEqual([o]);
    expect(await reads(s, s.bea)).toEqual([o]);
    // The Guest it is given to reads that one only; a Guest on nothing reads none.
    expect(await reads(s, s.hal)).toEqual([o]);
    expect(await reads(s, s.gus)).toEqual([]);
    // The thread page and its words follow the same rule.
    expect(await actionThread(as(s, s.dan, "member"), k)).toBeNull();
    expect(await actionThread(as(s, s.gus, "guest"), o)).toBeNull();
    expect(await actionThread(as(s, s.gus, "guest"), k)).toBeNull();
    const page = await actionThread(as(s, s.cora, "member"), k);
    expect(page).toMatchObject({ metric: null, chartMetric: null, seesMetric: false, about: { workflow: { id: s.flow, name: "Month-end close" }, period: "March 2026" } });
    expect(page!.action.question).toBe(KEPT);
    expect(await actionThread(as(s, s.hal, "guest"), o)).not.toBeNull();
    // Nobody not on it may reply, whatever they read.
    await expect(reply(as(s, s.cora, "member"), k, "I can read it", null)).rejects.toThrow();
  });

  it("shows in the Assignee's Schedule and in no one else's, and a teammate's words only to those who may read them", async () => {
    const { s, keptTask } = await kept();
    const mine = await schedule(as(s, s.ann, "member"), { from: "2026-04-01", to: "2026-04-10" }, new Date("2026-04-02T10:00:00Z"));
    const entries = [...mine.overdue, ...mine.days.flatMap((d) => d.entries), ...mine.undated].filter((e) => e.actionId === keptTask.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "task", metric: null, workflow: { name: "Month-end close" }, date: "2026-04-03", text: KEPT, path: `/actions/${keptTask.id}` });
    expect(entryTitle(entries[0])).toBe(`Task: ${KEPT}`);
    const cal = await calendarEntries(as(s, s.ann, "member"), new Date("2026-04-02T10:00:00Z"));
    expect(cal.entries.some((e) => e.actionId === keptTask.id)).toBe(true);
    for (const other of [s.dan, s.cora, s.gus]) {
      const theirs = await schedule(as(s, other, other === s.gus ? "guest" : "member"), { from: "2026-04-01", to: "2026-04-10" }, new Date("2026-04-02T10:00:00Z"));
      expect([...theirs.overdue, ...theirs.days.flatMap((d) => d.entries), ...theirs.undated].filter((e) => e.actionId === keptTask.id)).toHaveLength(0);
    }
    // An Admin outside Finance reads Ann's Schedule: the entry is there, the item's words are not.
    const adminView = await schedule(as(s, s.ada, "admin"), { from: "2026-04-01", to: "2026-04-10", personId: s.ann }, new Date("2026-04-02T10:00:00Z"));
    const seen = [...adminView.overdue, ...adminView.days.flatMap((d) => d.entries)].find((e) => e.actionId === keptTask.id);
    expect(seen?.text).toBeNull();
  });

  it("is listed for programs with no Metric and its Workflow, to those who may read it only", async () => {
    const { s, keptTask } = await kept();
    const mine = await listActionsWithKey(await key(s, s.ann, "member", ["actions:read"]), { limit: 20 });
    expect(mine.items.find((a) => a.id === keptTask.id)).toMatchObject({ metric: null, workflow: { id: s.flow, name: "Month-end close" }, purpose: "checklist", assigned_to_me: true, due_date: "2026-04-03" });
    const owner = await listActionsWithKey(await key(s, s.sara, "owner", ["actions:read"]), { limit: 20, role: "asker" });
    expect(owner.items.filter((a) => a.purpose === "checklist")).toHaveLength(2);
    expect((await listActionsWithKey(await key(s, s.dan, "member", ["actions:read"]), { limit: 20 })).items).toEqual([]);
  });

  it("is in the owner's \"Asked by me\" and the Period Timeline as each viewer may read it, with counts for the rest", async () => {
    const { s, keptTask } = await kept();
    const asked = await actionsAskedByMe(as(s, s.sara, "owner"));
    expect(asked.filter((r) => r.metricId === null).map((r) => [r.metricName, r.periodLabel, r.value])).toEqual([["Month-end close", "March 2026", null], ["Month-end close", "March 2026", null]]);
    const lines = async (id: string, role: "owner" | "admin" | "member" | "guest") => (await periodTimeline(as(s, id, role), s.flow, "2026-03-01")).events.filter((e) => e.kind === "checklist_given").map((e) => e.text).sort();
    expect(await lines(s.sara, "owner")).toEqual([`“${WORDS}” was given to ${await name(s, s.hal)}`, `“${KEPT}” was given to ${await name(s, s.ann)}`].sort());
    // Dan reads the open one only; the one kept to Finance is a line without words.
    expect(await lines(s.dan, "member")).toEqual(["A checklist task was given", `“${WORDS}” was given to ${await name(s, s.hal)}`].sort());
    expect(JSON.stringify((await periodTimeline(as(s, s.dan, "member"), s.flow, "2026-03-01")).events)).not.toContain(KEPT);
    expect(keptTask.id).toBeTruthy();
    // Both Tasks count in the progress of every viewer, as counts.
    expect((await periodTimeline(as(s, s.dan, "member"), s.flow, "2026-03-01")).checklist).toEqual({ done: 0, of: 2 });
  });

  async function name(s: S, id: string) { return (await db().from("profiles").select("name").eq("id", id).single()).data!.name as string; }
});

describe("every reader of actions.metric_id", () => {
  it("is one of the places that handle a Task with no Metric, so a new reader has to be looked at", () => {
    // Each file that reads the `actions` table, and how it treats a Task whose `metric_id` is null. A file that starts
    // reading `actions` and is not listed fails here, so its author has to decide the same.
    const handled: Record<string, string> = {
      "access.ts": "getCanvasData leaves them out of a Metric's open count; readableActions and threadReader decide who reads them (no Metric: role and Group)",
      "action-state.ts": "changeActionState and announceNewAction tell no Webhook of an Action with no Metric (queueWebhookEvent)",
      "api-actions.ts": "metric: null and workflow: { id, name }; readable through threadReader with the key's role",
      "api.ts": "reads the Threads of one Metric's periods: a Checklist Task has no Metric",
      "checklist-tasks.ts": "writes and steps them",
      "deliveries.ts": "deliver() names the Workflow and period where a Metric's name would be",
      "handover.ts": "the Webhook event of a handed-over Action skips a null Metric",
      "held-replies.ts": "reads the purpose only",
      "inbound-email.ts": "reads the purpose only",
      "internal/delivery-send.ts": "no Metric: nothing archived holds a reminder of a Checklist Task",
      "observation-details.ts": "reads the Actions of one Metric",
      "page-data.ts": "the action page shows the Workflow and period, no chart; the Outbox lists a Delivery by readableActions",
      "paste-values.ts": "reads the Approval of one Metric",
      "period-record.ts": "reads the Actions of one Metric",
      "period-finished.ts": "reads a Workflow's Checklist Tasks by their Workflow, for their status and time only (no words, no Metric)",
      "period-timeline.ts": "reads a Workflow's Checklist Tasks by their Workflow and shows them as each viewer may read them",
      "personal-webhook-hearing.ts": "an Action with no Metric is heard by no Personal Webhook",
      "questions.ts": "reads the purpose and assignee only",
      "retention-setting.ts": "reads the open Actions of one Metric; a Checklist Task is not retained away",
      "schedule.ts": "an entry about the Workflow and period, metric: null",
      "scheduled-runs.ts": "remindDueTasks leaves them to the Workflow's Remind steps",
      "slack-send.ts": "reads the purpose and status only",
      "telegram-send.ts": "reads the purpose and status only",
      "threads.ts": "the Metric's owner is the asker for a Task with no Metric",
      "webhook-events.ts": "no Action event without a Metric",
      "webhook-inbound.ts": "no Webhook answers a Checklist Task",
      "webhook-send.ts": "a send for an Action with no Metric is dropped",
      "workflow-engine.ts": "approval and Self-check steps read their own Action by id",
      "workspace-data.ts": "the Actions page and its count: readableActions decides",
    };
    const dir = join(__dirname);
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "test" ? [] : walk(join(d, e.name)).map((f) => `${e.name}/${f}`)) : e.name.endsWith(".ts") && !/\.(db\.)?test\.ts$/.test(e.name) ? [e.name] : []));
    const readers = walk(dir).filter((f) => /from\("actions"\)/.test(readFileSync(join(dir, f), "utf8")));
    const unknown = readers.filter((f) => !(f in handled));
    expect(unknown).toEqual([]);
    // Nor does the list keep a file that no longer reads them.
    expect(Object.keys(handled).filter((f) => !readers.includes(f))).toEqual([]);
  });
});
