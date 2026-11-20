// The period timeline against the real database (ticket #410; GLOSSARY: Period Timeline, Workflow, Prompt, Approval,
// Lock, Thread, Group): events in order and grouped, "N of M in", what a viewer who does not see a Metric or may not
// read a Thread gets (counts only, no names, values or words), another Workspace, and the summary to the owner.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { Forbidden } from "./actor";
import { closePeriod } from "./workflow-engine";
import { periodTimeline, workflowPeriods } from "./period-timeline";
import { saveWorkflow } from "./workflows";
import { workspace } from "./test/db-fixtures";

const PERIOD = "2026-11-16";
const at = (hhmm: string, day = "16") => `2026-11-${day}T${hhmm}:00Z`;
let w: Awaited<ReturnType<typeof workspace>>;
let sara: string, mia: string, ben: string;
let workflowId: number, revenue: number, tickets: number, secret: number, groupThreadId: number;

beforeAll(async () => {
  w = await workspace();
  sara = await w.person("owner"); mia = await w.person("member"); ben = await w.person("member");
  workflowId = await saveWorkflow(w.actor(sara), null, "Weekly numbers", { dueWorkingDays: 3, steps: [{ type: "publish", lock: true }], lockSummary: true });
  const metric = async (name: string, over: Record<string, unknown> = {}) => (await w.metric(sara, { name, period: "week", workflow_id: workflowId, ...over })).id;
  revenue = await metric("Revenue"); tickets = await metric("Support tickets"); secret = await metric("Secret payroll");
  // Ben submits Revenue and Support tickets, so he sees them; he has nothing to do with the Secret payroll Metric.
  await w.token(revenue, ben); await w.token(tickets, ben); await w.token(secret, mia); await w.token(revenue, mia);
  // A Derived Metric is never asked for: it is not counted in "of".
  await metric("Derived", { formula: "1" });
  const sent = async (metricId: number, who: string, when: string, connector: string) => {
    const { data } = await db().from("prompts").insert({ workspace_id: w.id, metric_id: metricId, submitter_id: who, source: "web_form", text: "What is it?", period_start: PERIOD, sent_at: when }).select("id").single();
    await db().from("deliveries").insert({ workspace_id: w.id, connector, recipient_id: who, sender_id: sara, kind: "prompt", prompt_id: data!.id, subject: "s", body: "b" });
  };
  await sent(revenue, ben, at("08:00"), "email");
  await sent(tickets, ben, at("08:01"), "email");
  await sent(secret, mia, at("08:02"), "slack");
  // A reminder two days later, not grouped with the asks.
  await sent(tickets, ben, at("09:00", "18"), "email");
  const value = (metricId: number, v: number, when: string, who: string) => db().from("observations").insert({ workspace_id: w.id, metric_id: metricId, period_start: PERIOD, value: v, submitter_id: who, source: "api", created_at: when });
  await value(revenue, 1234, at("14:10"), ben);
  await value(secret, 987654, at("14:12"), mia);
  await value(tickets, 480, at("11:25", "17"), ben);
  // Approval of Support tickets asked of Mia: she approves and leaves a note, in a Thread the whole workspace reads.
  const approval = await w.action({ metric_id: tickets, period_start: PERIOD, asker_id: ben, assignee_id: mia, kind: "task", purpose: "approval", question: "Approve Support tickets for Week 47, 2026: 480, up 48 % on the period before. Reply “approve”.", created_at: at("11:26", "17") });
  await db().from("thread_messages").insert([
    { action_id: approval, author_id: mia, body: "Looks right, the launch week was busy and the numbers follow what we saw in the shop and on the phone lines all day long.", created_at: at("11:40", "17") },
    { action_id: approval, author_id: mia, body: "Approved.", created_at: at("11:41", "17") },
  ]);
  // A Thread about Revenue for a Group Ben is not in, and an Approval of the Secret Metric.
  const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Board" }).select("id").single();
  await db().from("group_members").insert({ workspace_id: w.id, group_id: g!.id, user_id: mia });
  groupThreadId = await w.action({ metric_id: revenue, period_start: PERIOD, asker_id: sara, assignee_id: mia, read_group_id: g!.id, question: "Board only question", created_at: at("15:00") });
  await db().from("thread_messages").insert({ action_id: groupThreadId, author_id: mia, body: "private talk about revenue", created_at: at("15:05") });
  const secretAction = await w.action({ metric_id: secret, period_start: PERIOD, asker_id: mia, assignee_id: sara, kind: "task", purpose: "approval", question: "Approve Secret payroll: 987654.", created_at: at("14:13") });
  await db().from("thread_messages").insert({ action_id: secretAction, author_id: sara, body: "Approved secret payroll words", created_at: at("14:20") });
  // Everything published and locked on Wednesday.
  for (const m of [revenue, tickets, secret]) await db().from("period_states").insert({ workspace_id: w.id, metric_id: m, period_start: PERIOD, state: "locked", updated_at: at("10:00", "18") });
});
afterAll(async () => { await w.cleanup(); });

const nameOf = async (id: string) => String((await db().from("profiles").select("name").eq("id", id).single()).data!.name);
const owner = () => w.actor(sara, "owner");
const ben_ = () => w.actor(ben, "member");

describe("periodTimeline", () => {
  it("orders what happened, groups what is close together and counts values in", async () => {
    const t = await periodTimeline(owner(), workflowId, PERIOD);
    expect(t).toMatchObject({ workflow: { id: workflowId, name: "Weekly numbers" }, period: PERIOD, in: 3, of: 3, published: 3, locked: 3 });
    expect(t.events.map((e) => e.kind)).toEqual(["asked", "in", "approval_asked", "note", "action", "note", "in", "approval_asked", "note", "approved", "reminded", "locked"]);
    expect(t.events.map((e) => e.at)).toEqual([...t.events.map((e) => e.at)].sort((a, b) => a.localeCompare(b)));
    expect(t.events[0]).toMatchObject({ text: "Asked 2 people by Email and Slack", count: 2, day: "2026-11-16", time: "08:00" });
    // The two values within the hour are one line, with how many were in by then.
    expect(t.events[1]).toMatchObject({ kind: "in", count: 2, in: 2, text: "2 values came in (2 of 3 in)" });
    expect(t.events.at(-1)).toMatchObject({ kind: "locked", count: 3, text: "3 values locked" });
    expect(t.events.filter((e) => e.kind === "approval_asked")[1]).toMatchObject({ text: `${await nameOf(mia)} was asked to approve Support tickets`, items: ["480, up 48 % on the period before"], path: expect.stringMatching(/^\/actions\/\d+$/) });
  });

  it("shows a note's first words only", async () => {
    const t = await periodTimeline(owner(), workflowId, PERIOD);
    const note = t.events.find((e) => e.kind === "note" && e.text.endsWith("Support tickets"))!;
    expect(note.text).toBe(`${await nameOf(mia)} left a note on Support tickets`);
    expect(note.items[0]).toMatch(/^Looks right, the launch week was busy/);
    expect(note.items[0].endsWith("…")).toBe(true);
    expect(note.items[0].length).toBeLessThan(80);
  });

  it("gives a viewer who does not see a Metric a count, never its name, values or Thread words", async () => {
    const t = await periodTimeline(ben_(), workflowId, PERIOD);
    const everything = JSON.stringify(t);
    for (const secretWord of ["Secret", "payroll", "987654", "Board", "private talk"]) expect(everything).not.toContain(secretWord);
    // Still the whole count, and the hidden values as "1 value".
    expect(t).toMatchObject({ in: 3, of: 3 });
    expect(t.events[0].items).toContain("1 value");
    expect(t.events.find((e) => e.kind === "in")!.items).toContain("1 value");
    expect(t.events.find((e) => e.kind === "locked")).toMatchObject({ count: 3, items: expect.arrayContaining(["1 value"]) });
    // The Secret payroll Thread and the Group's Thread are not on his timeline at all; the one he may read is.
    expect(t.events.filter((e) => e.kind === "approval_asked")).toHaveLength(1);
    expect(t.events.some((e) => e.kind === "action")).toBe(false);
  });

  it("leaves a Thread out for someone who sees the Metric but is not in its Group", async () => {
    const t = await periodTimeline(w.actor(ben, "member"), workflowId, PERIOD);
    expect(JSON.stringify(t)).not.toContain("Board only");
    const mias = await periodTimeline(w.actor(mia, "member"), workflowId, PERIOD);
    // Mia is in the Group: she reads it, as its first words.
    expect(mias.events.find((e) => e.kind === "action")).toMatchObject({ text: expect.stringMatching(/ a question about Revenue$/), items: ["Board only question"] });
    expect(mias.events.find((e) => e.kind === "note" && e.text.endsWith("Revenue"))!.items).toEqual(["private talk about revenue"]);
  });

  it("refuses another Workspace's Workflow, and a period that is not a day", async () => {
    const other = await workspace(); const eve = await other.person("owner");
    try {
      await expect(periodTimeline(other.actor(eve, "owner"), workflowId, PERIOD)).rejects.toBeInstanceOf(Forbidden);
      await expect(workflowPeriods(other.actor(eve, "owner"), workflowId)).rejects.toBeInstanceOf(Forbidden);
    } finally { await other.cleanup(); }
    await expect(periodTimeline(owner(), workflowId, "last week")).rejects.toThrow(/first day/);
    await expect(periodTimeline(owner(), 999999999, PERIOD)).rejects.toBeInstanceOf(Forbidden);
  });

  it("lists the periods that have something, newest first", async () => {
    const periods = await workflowPeriods(owner(), workflowId, 3);
    expect(periods).toContain(PERIOD);
    expect([...periods].sort().reverse()).toEqual(periods);
  });
});

describe("the summary when a period locks", () => {
  const notices = async (who: string) => (await db().from("deliveries").select("id, kind, subject").eq("workspace_id", w.id).eq("recipient_id", who).eq("kind", "notice")).data ?? [];

  it("goes to the Workflow's owner when it is on, once everything is locked, and is off by default", async () => {
    const x = await workspace();
    try {
      const o = await x.person("owner"); const sub = await x.person("member");
      const plain = await saveWorkflow(x.actor(o), null, "Plain", { dueWorkingDays: 3, steps: [{ type: "publish", lock: true }] });
      const loud = await saveWorkflow(x.actor(o), null, "Loud", { dueWorkingDays: 3, steps: [{ type: "publish", lock: true }], lockSummary: true });
      const a = await x.metric(o, { name: "A", period: "week", workflow_id: plain }); await x.token(a.id, sub); await x.value(a.id, "2026-11-09", 1, sub);
      const b = await x.metric(o, { name: "B", period: "week", workflow_id: loud }); await x.token(b.id, sub); await x.value(b.id, "2026-11-09", 2, sub);
      await closePeriod(x.id, plain, "2026-11-16", o);
      const mine = async () => (await db().from("deliveries").select("kind, subject, body").eq("workspace_id", x.id).eq("recipient_id", o).eq("kind", "notice")).data ?? [];
      expect(await mine()).toEqual([]);
      await closePeriod(x.id, loud, "2026-11-16", o);
      const sent = await mine();
      expect(sent).toHaveLength(1);
      expect(sent[0].subject).toBe("Loud: Week of 9 Nov 2026 is locked");
    } finally { await x.cleanup(); }
    expect(await notices(sara)).toEqual([]);
  });
});
