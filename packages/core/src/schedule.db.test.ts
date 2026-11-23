// The Schedule against the real database (spec 0027, ticket #240): values due by the Workflow's Due Date, Metrics
// without one, Feeds, Stand-ins and Away, Approvals, Tasks and Questions, overdue entries, the span's limits, what the
// person may see, the Workspace's today, and a teammate's Schedule for Owners and Admins only.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type KeyActor } from "./actor";
import { db } from "./db";
import { entryTitle, ownFormCode, schedule, type Schedule } from "./schedule";
import { opened, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

// Thursday 19 November 2026, noon in UTC.
const NOW = new Date("2026-11-19T12:00:00Z");
const LONG_AGO = "2026-01-01T00:00:00Z";
const MONTHLY_CLOSE = { dueWorkingDays: 3, steps: [{ type: "remind", daysBefore: 2 }, { type: "publish", lock: false }] };

type W = Awaited<ReturnType<typeof ws>>;
async function workflow(w: W, owner: string, config: object = MONTHLY_CLOSE) {
  const { data } = await db().from("workflows").insert({ owner_id: owner, name: "Monthly close", config, workspace_id: w.id }).select("id").single();
  return data!.id as number;
}
async function token(metricId: number, submitter: string, over: Record<string, unknown> = {}) {
  const { error } = await db().from("tokens").insert({ code: `tk-test-${randomUUID()}`, metric_id: metricId, submitter_id: submitter, created_at: LONG_AGO, ...over });
  if (error) throw new Error(error.message);
}
async function action(w: W, row: Record<string, unknown>) {
  const { data, error } = await db().from("actions").insert({ question: "Why?", kind: "question", workspace_id: w.id, ...row }).select("id").single();
  if (error) throw new Error(error.message);
  return data!.id as number;
}
const share = (w: W, metricId: number, person: string) => db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metricId, user_id: person, role: "viewer" });
const flat = (s: Schedule) => [...s.overdue, ...s.days.flatMap((d) => d.entries), ...s.undated];
const brief = (s: Schedule) => flat(s).map((e) => `${e.kind} ${e.metric.name} ${e.period.start} ${e.date ?? "undated"}${e.overdue ? ` overdue ${e.overdueWorkingDays}` : ""}`);

describe("values due", () => {
  it("falls on the Workflow's Due Date in working days, includes future periods in the span and leaves when a value came", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Revenue", created_at: "2026-09-01T00:00:00Z", workflow_id: await workflow(w, sara) });
    await token(m.id, ben);
    await w.value(m.id, "2026-09-01", 10, ben);
    const s = await schedule(w.actor(ben, "member"), { from: "2026-11-16", to: "2026-12-06" }, NOW);
    expect(s.today).toBe("2026-11-19");
    // October ends on a Saturday: the 3rd working day is Wednesday 4 November. November ends on a Monday: Thursday
    // 3 December. September has a value; August ended before the Metric existed.
    expect(brief(s)).toEqual(["value_due Revenue 2026-10-01 2026-11-04 overdue 11", "value_due Revenue 2026-11-01 2026-12-03"]);
    expect(s.days).toEqual([{ date: "2026-12-03", entries: [expect.objectContaining({ noDueDate: false, dueWorkingDays: 3, remindDaysBefore: 2, standingInFor: null, path: `/schedule/submit/${m.slug}`, period: { start: "2026-11-01", label: "November 2026" } })] }]);
    await w.value(m.id, "2026-10-01", 12, ben);
    expect(brief(await schedule(w.actor(ben, "member"), { from: "2026-11-16", to: "2026-12-06" }, NOW))).toEqual(["value_due Revenue 2026-11-01 2026-12-03"]);
  });

  it("counts working days from a period ending on a Friday, a Saturday and a Sunday", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Calls", period: "day", created_at: "2026-11-12T00:00:00Z", workflow_id: await workflow(w, sara, { dueWorkingDays: 1, steps: [] }) });
    await token(m.id, sara);
    const s = await schedule(w.actor(sara), { from: "2026-11-16", to: "2026-11-22" }, NOW);
    expect(brief(s)).toEqual([
      "value_due Calls 2026-11-12 2026-11-13 overdue 4",
      // Friday, Saturday and Sunday are all due on Monday.
      "value_due Calls 2026-11-13 2026-11-16 overdue 3", "value_due Calls 2026-11-14 2026-11-16 overdue 3", "value_due Calls 2026-11-15 2026-11-16 overdue 3",
      "value_due Calls 2026-11-16 2026-11-17 overdue 2", "value_due Calls 2026-11-17 2026-11-18 overdue 1",
      // Due today is not overdue yet; Friday's is due next Monday, after the span.
      "value_due Calls 2026-11-18 2026-11-19", "value_due Calls 2026-11-19 2026-11-20",
    ]);
  });

  it("lists overdue values whatever the span, at most 90 days back", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Cost", created_at: LONG_AGO, workflow_id: await workflow(w, sara) });
    await token(m.id, sara);
    const s = await schedule(w.actor(sara), { from: "2026-12-07", to: "2026-12-13" }, NOW);
    // 90 days back is 21 August: July (due 5 August) is too old; August, September and October are overdue.
    expect(s.overdue.map((e) => e.period.start)).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(s.days).toEqual([]);
  });

  it("shows a Metric without a Workflow only with its latest ended period, the first working day after, marked", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const monthly = await w.metric(sara, { name: "Visits", created_at: LONG_AGO });
    const daily = await w.metric(sara, { name: "Calls", period: "day", created_at: LONG_AGO });
    await token(monthly.id, sara); await token(daily.id, sara);
    const s = await schedule(w.actor(sara), { from: "2026-11-16", to: "2026-11-22" }, NOW);
    expect(brief(s)).toEqual(["value_due Visits 2026-10-01 2026-11-02 overdue 13", "value_due Calls 2026-11-18 2026-11-19"]);
    expect(flat(s).every((e) => e.noDueDate && e.dueWorkingDays === null)).toBe(true);
    await w.value(daily.id, "2026-11-18", 3, sara);
    expect(brief(await schedule(w.actor(sara), { from: "2026-11-16", to: "2026-11-22" }, NOW))).toEqual(["value_due Visits 2026-10-01 2026-11-02 overdue 13"]);
  });

  it("never lists a Feed's Metric, nor a Derived Metric", async () => {
    const w = await ws(); const sara = await w.person("owner"); const feed = await w.person("member");
    await db().from("feeds").insert({ person_id: feed, workspace_id: w.id, name: "CRM" });
    const m = await w.metric(sara, { name: "Deals", created_at: LONG_AGO, workflow_id: await workflow(w, sara) });
    await token(m.id, feed, { stand_in_id: sara });
    await db().from("away").insert({ user_id: feed, starts: "2026-01-01", ends: "2026-12-31" });
    const d = await w.metric(sara, { name: "Margin", formula: "{x}", created_at: LONG_AGO });
    await token(d.id, sara);
    expect(brief(await schedule(w.actor(sara), { from: "2026-11-16", to: "2026-11-22" }, NOW))).toEqual([]);
  });

  it("goes to the Stand-in while the submitter is Away on the Due Date, marked, and not to the submitter", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ana = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Revenue", created_at: LONG_AGO, workflow_id: await workflow(w, sara) });
    await token(m.id, ana, { stand_in_id: ben });
    // Ben stands in with a Token of his own, so he sees the Metric.
    await token(m.id, ben, { stands_in_for: ana, expires_at: "2027-01-31" });
    await w.value(m.id, "2026-08-01", 1, ana); await w.value(m.id, "2026-09-01", 1, ana);
    await db().from("away").insert({ user_id: ana, starts: "2026-11-01", ends: "2026-11-10" });
    const span = { from: "2026-11-16", to: "2026-12-06" };
    const bens = await schedule(w.actor(ben, "member"), span, NOW);
    expect(brief(bens)).toEqual(["value_due Revenue 2026-10-01 2026-11-04 overdue 11"]);
    expect(bens.overdue[0].standingInFor).toEqual({ id: ana, name: expect.stringContaining("member") });
    // Ana is back before November's Due Date: that one is hers, October's is not.
    expect(brief(await schedule(w.actor(ana, "member"), span, NOW))).toEqual(["value_due Revenue 2026-11-01 2026-12-03"]);
    // A Stand-in who does not see the Metric (no Token of their own yet) gets nothing about it.
    await db().from("tokens").delete().eq("metric_id", m.id).eq("submitter_id", ben);
    expect(brief(await schedule(w.actor(ben, "member"), span, NOW))).toEqual([]);
    await token(m.id, ben, { stands_in_for: ana, expires_at: "2027-01-31" });
    // Away moved later: the entry moves with it as soon as it is saved.
    await db().from("away").update({ starts: "2026-12-01", ends: "2026-12-04" }).eq("user_id", ana);
    expect(brief(await schedule(w.actor(ben, "member"), span, NOW))).toEqual(["value_due Revenue 2026-11-01 2026-12-03"]);
  });
});

describe("Approvals, Tasks and Questions", () => {
  it("dates an Approval the day it was asked and makes it overdue after its period's Due Date", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const m = await w.metric(sara, { name: "Cost", created_at: LONG_AGO, workflow_id: await workflow(w, sara) });
    await share(w, m.id, ann);
    const late = await action(w, { metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: ann, kind: "task", purpose: "approval", question: "Approve Cost for October 2026: 1,200", created_at: "2026-11-10T09:00:00Z" });
    await action(w, { metric_id: m.id, period_start: "2026-11-01", asker_id: sara, assignee_id: ann, kind: "task", purpose: "approval", question: "Approve Cost for November 2026: 900", created_at: "2026-11-18T09:00:00Z" });
    await action(w, { metric_id: m.id, period_start: "2026-09-01", asker_id: sara, assignee_id: ann, kind: "task", purpose: "approval", status: "closed", created_at: "2026-11-18T09:00:00Z" });
    const s = await schedule(w.actor(ann, "member"), { from: "2026-11-16", to: "2026-11-22" }, NOW);
    expect(brief(s)).toEqual(["approval Cost 2026-10-01 2026-11-10 overdue 11", "approval Cost 2026-11-01 2026-11-18"]);
    // An Approval's words hold the value: they stay in the Action.
    expect(s.overdue[0]).toMatchObject({ actionId: late, text: null, path: `/actions/${late}` });
  });

  it("dates Tasks by their due date, lists those without one as undated, and dates only Escalations among Questions", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Shipping", created_at: LONG_AGO, workflow_id: await workflow(w, sara) });
    const own = await w.metric(ben, { name: "Leads", created_at: LONG_AGO });
    await share(w, m.id, ben);
    const base = { metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: ben };
    await action(w, { ...base, kind: "task", question: "Renegotiate the shipping rate", due_date: "2026-11-20" });
    await action(w, { ...base, kind: "task", question: "Call the carrier", due_date: "2026-11-12" });
    await action(w, { ...base, kind: "task", question: "Tidy the notes" });
    await action(w, { ...base, kind: "question", question: "Why so high?" });
    await action(w, { ...base, metric_id: own.id, kind: "question", purpose: "escalation", question: "Leads for October is missing." });
    await action(w, { ...base, kind: "question", purpose: "escalation", question: "Shipping for October is missing." });
    await action(w, { ...base, kind: "task", question: "Done already", due_date: "2026-11-20", status: "closed" });
    const s = await schedule(w.actor(ben, "member"), { from: "2026-11-16", to: "2026-11-22" }, NOW);
    expect(brief(s)).toEqual([
      "question Shipping 2026-10-01 2026-11-04 overdue 11",
      "task Shipping 2026-10-01 2026-11-12 overdue 5",
      "task Shipping 2026-10-01 2026-11-20",
      // An Escalation of a Metric without a Workflow has no Due Date to fall on.
      "task Shipping 2026-10-01 undated",
      "question Leads 2026-10-01 undated",
      "question Shipping 2026-10-01 undated",
    ]);
    expect(s.overdue[0]).toMatchObject({ escalation: true, text: "Shipping for October is missing." });
    expect(s.days[0].entries[0].text).toBe("Renegotiate the shipping rate");
  });

  it("counts working days late at once, also from a due date long ago", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Old", created_at: LONG_AGO });
    await action(w, { metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: sara, kind: "task", question: "Ancient", due_date: "0001-01-01" });
    await action(w, { metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: sara, kind: "task", question: "Last Friday", due_date: "2026-11-13" });
    const s = await schedule(w.actor(sara), {}, NOW);
    // One older than 90 days is not listed; last Friday's is four working days late.
    expect(brief(s)).toEqual(["task Old 2026-10-01 2026-11-13 overdue 4"]);
  });

  it("keeps the Actions a person is assigned on a Metric they do not see, as the Actions page does, and only those", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("admin");
    const m = await w.metric(sara, { name: "Secret", created_at: LONG_AGO });
    await share(w, m.id, ben);
    const task = await action(w, { metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: ben, kind: "task", question: "Look", due_date: "2026-11-20" });
    expect(brief(await schedule(w.actor(ben, "member"), {}, NOW))).toHaveLength(1);
    await db().from("shares").delete().eq("object_id", m.id).eq("workspace_id", w.id);
    // Ticket 323: Ben is its Assignee, so he may read it and it stays on his Schedule, with its words.
    const own = flat(await schedule(w.actor(ben, "member"), {}, NOW));
    expect(own.map((e) => [e.kind, e.actionId, e.text])).toEqual([["task", task, "Look"]]);
    // A fixed created_at: an Approval is dated the day it was asked, so the real clock drifted out of the fixed week.
    // An Approval of a Metric never shared with its Approver shows too.
    const approval = await action(w, { metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: ann, kind: "task", purpose: "approval", question: "Approve Secret: 5", created_at: "2026-11-18T09:00:00Z" });
    expect(flat(await schedule(w.actor(ann, "admin"), {}, NOW)).map((e) => [e.kind, e.actionId])).toEqual([["approval", approval]]);
    // A teammate's Schedule still shows only what the asker sees: an Admin who does not see it gets nothing of Ben's.
    expect(brief(await schedule(w.actor(ann, "admin"), { personId: ben }, NOW))).toEqual([]);
    expect(flat(await schedule(w.actor(sara), { personId: ben }, NOW)).map((e) => e.actionId)).toEqual([task]);
  });
});

describe("the span and today", () => {
  it("defaults to this week, and refuses spans that are back to front, over 90 days or over a year ahead", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const a = w.actor(sara);
    expect((await schedule(a, {}, NOW)).today).toBe("2026-11-19");
    await expect(schedule(a, { from: "2026-11-22", to: "2026-11-16" }, NOW)).rejects.toThrow(/not be after/);
    await expect(schedule(a, { from: "2026-11-01", to: "2027-01-31" }, NOW)).rejects.toThrow(/90 days/);
    await expect(schedule(a, { from: "2027-11-10", to: "2027-11-21" }, NOW)).rejects.toThrow(/366 days/);
    await expect(schedule(a, { from: "2026-08-20", to: "2026-08-31" }, NOW)).rejects.toThrow(/90 days back/);
    await expect(schedule(a, { from: "2027-02-30", to: "2027-03-01" }, NOW)).rejects.toThrow(/YYYY-MM-DD/);
    await expect(schedule(a, { from: "2026-11-01", to: "2026-11-01'; drop" }, NOW)).rejects.toThrow(/YYYY-MM-DD/);
    await expect(schedule(a, { from: "2026-11-01", to: "2027-01-30" }, NOW)).resolves.toBeTruthy();
  });

  it("cuts the default week at the Workspace's first day of the week", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Calls", period: "day", created_at: LONG_AGO });
    const due = (date: string) => action(w, { metric_id: m.id, period_start: "2026-11-01", asker_id: sara, assignee_id: sara, kind: "task", due_date: date, question: `Task ${date}` });
    // Today is Thursday 19 November: Monday to Sunday ends on the 22nd, Sunday to Saturday on the 21st.
    await due("2026-11-21"); await due("2026-11-22");
    const days = async () => (await schedule(w.actor(sara), {}, NOW)).days.map((d) => d.date);
    expect(await days()).toEqual(["2026-11-21", "2026-11-22"]);
    await db().from("workspaces").update({ week_start: 0 }).eq("id", w.id);
    expect(await days()).toEqual(["2026-11-21"]);
  });

  it("takes today from the Workspace's time zone", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await db().from("workspaces").update({ time_zone: "Pacific/Kiritimati" }).eq("id", w.id);
    const m = await w.metric(sara, { name: "Calls", period: "day", created_at: LONG_AGO });
    await token(m.id, sara);
    // 02:00 on Friday 20 November there: Thursday is the latest ended day, due on Friday.
    const s = await schedule(w.actor(sara), {}, NOW);
    expect(s.today).toBe("2026-11-20");
    expect(brief(s)).toEqual(["value_due Calls 2026-11-19 2026-11-20"]);
  });
});

describe("whose Schedule", () => {
  it("lets an Owner or Admin see a teammate's, only about Metrics they see themselves, and refuses anyone else", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const ben = await w.person("member"); const eve = await w.person("member");
    const shared = await w.metric(sara, { name: "Revenue", created_at: LONG_AGO });
    const bens = await w.metric(ben, { name: "Ben's own", created_at: LONG_AGO });
    await token(shared.id, ben); await token(bens.id, ben);
    const span = { from: "2026-11-16", to: "2026-11-22" };
    expect(brief(await schedule(w.actor(ben, "member"), span, NOW)).sort()).toEqual(["value_due Ben's own 2026-10-01 2026-11-02 overdue 13", "value_due Revenue 2026-10-01 2026-11-02 overdue 13"]);
    const forSara = await schedule(w.actor(sara), { ...span, personId: ben }, NOW);
    expect(forSara.personId).toBe(ben);
    expect(brief(forSara)).toEqual(["value_due Revenue 2026-10-01 2026-11-02 overdue 13"]);
    // Ann sees neither Metric.
    expect(brief(await schedule(w.actor(ann, "admin"), { ...span, personId: ben }, NOW))).toEqual([]);
    await expect(schedule(w.actor(eve, "member"), { ...span, personId: ben }, NOW)).rejects.toEqual(expect.any(Forbidden));
    await expect(schedule(w.actor(sara), { ...span, personId: "t-someone-else" }, NOW)).rejects.toEqual(expect.any(Forbidden));
  });

  it("gives an Owner no words of a teammate's Action whose Thread is kept to a Group they are not in", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const ben = await w.person("member");
    const m = await w.metric(ann, { name: "Payroll", created_at: LONG_AGO });
    await share(w, m.id, sara); await share(w, m.id, ben);
    const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "HR" }).select("id").single();
    await action(w, { metric_id: m.id, period_start: "2026-10-01", asker_id: ann, assignee_id: ben, kind: "task", question: "Check the bonus line", due_date: "2026-11-20", read_group_id: g!.id });
    const s = await schedule(w.actor(sara), { personId: ben }, NOW);
    expect(s.days[0].entries[0]).toMatchObject({ kind: "task", text: null });
    expect((await schedule(w.actor(ben, "member"), {}, NOW)).days[0].entries[0].text).toBe("Check the bonus line");
  });

  it("keeps such an Action on a teammate's Schedule as existing, with its date and link, only without its words", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const ben = await w.person("member");
    const m = await w.metric(ann, { name: "Payroll", created_at: LONG_AGO });
    await share(w, m.id, sara); await share(w, m.id, ben);
    const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "HR" }).select("id").single();
    const id = await action(w, { metric_id: m.id, period_start: "2026-10-01", asker_id: ann, assignee_id: ben, kind: "task", question: "Check the bonus line", due_date: "2026-11-20", read_group_id: g!.id });
    const [entry] = flat(await schedule(w.actor(sara), { personId: ben }, NOW));
    expect(entry).toMatchObject({ kind: "task", date: "2026-11-20", actionId: id, path: `/actions/${id}`, text: null, metric: { name: "Payroll" } });
    // Nothing of its words anywhere in the entry, also not in its title.
    expect(JSON.stringify(entry)).not.toContain("bonus");
    expect(entryTitle(entry)).toBe("Task: Payroll for October 2026");
  });

  it("records each read of a teammate's Schedule in the Audit Log, naming whose, and never one's own", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const ben = await w.person("member");
    const events = async () => opened("audit_events", w.id, (await db().from("audit_events").select("id, kind, actor_id, object_type, object_id, object_name, access_key_id, details").eq("workspace_id", w.id).eq("kind", "schedule.read").order("id")).data, { dropId: true });
    await schedule(w.actor(sara), {}, NOW);
    await schedule(w.actor(ben, "member"), {}, NOW);
    await schedule(w.actor(sara), { personId: sara }, NOW);
    expect(await events()).toEqual([]);
    const span = { from: "2026-11-16", to: "2026-11-22" };
    await schedule(w.actor(sara), { ...span, personId: ben }, NOW);
    await schedule(w.actor(ann, "admin"), { ...span, personId: ben }, NOW);
    const { data: profile } = await db().from("profiles").select("name").eq("id", ben).single();
    expect(await events()).toEqual([
      { kind: "schedule.read", actor_id: sara, object_type: "person", object_id: ben, object_name: profile!.name, access_key_id: null, details: span },
      { kind: "schedule.read", actor_id: ann, object_type: "person", object_id: ben, object_name: profile!.name, access_key_id: null, details: span },
    ]);
    // A refused read records nothing.
    await expect(schedule(w.actor(ben, "member"), { personId: sara }, NOW)).rejects.toThrow();
    expect(await events()).toHaveLength(2);
  });

  it("needs metrics:read from a key", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const key = (scopes: string[]): KeyActor => ({ ...w.actor(sara), key: { id: "1", scopes } });
    await expect(schedule(key(["values:submit"]), {}, NOW)).rejects.toEqual(expect.any(Forbidden));
    await expect(schedule(key(["metrics:read"]), {}, NOW)).resolves.toMatchObject({ personId: sara });
  });
});

describe("opening a value due", () => {
  it("gives a person their own form link only, or their Stand-in one while it counts", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ana = await w.person("member"); const ben = await w.person("member");
    const m = await w.metric(sara, { name: "Revenue" });
    await token(m.id, ana, { stand_in_id: ben, code: "tk-test-ana-form" });
    expect(await ownFormCode(w.actor(ana, "member"), m.slug)).toBe("tk-test-ana-form");
    // Ben is Ana's Stand-in but has no Token of his own yet: he gets no form, never Ana's.
    expect(await ownFormCode(w.actor(ben, "member"), m.slug)).toBeNull();
    await token(m.id, ben, { stands_in_for: ana, expires_at: "2999-01-01", code: "tk-test-ben-stands-in" });
    expect(await ownFormCode(w.actor(ben, "member"), m.slug)).toBe("tk-test-ben-stands-in");
    // Once he no longer stands in, his Stand-in Token counts no more.
    await db().from("tokens").update({ stand_in_id: null }).eq("metric_id", m.id).eq("submitter_id", ana);
    expect(await ownFormCode(w.actor(ben, "member"), m.slug)).toBeNull();
    expect(await ownFormCode(w.actor(sara), m.slug)).toBeNull();
    expect(await ownFormCode(w.actor(ana, "member"), "Not a slug!")).toBeNull();
    const other = await ws(); const eve = await other.person("owner");
    expect(await ownFormCode(other.actor(eve), m.slug)).toBeNull();
  });

  it("names each entry in a few words", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Cost", created_at: LONG_AGO, workflow_id: await workflow(w, sara) });
    await token(m.id, sara);
    await action(w, { metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: sara, kind: "task", purpose: "approval", question: "Approve Cost: 9", created_at: "2026-11-18T09:00:00Z" });
    await action(w, { metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: sara, kind: "task", question: "Renegotiate the shipping rate" });
    const titles = flat(await schedule(w.actor(sara), {}, NOW)).map(entryTitle);
    expect(titles).toEqual(expect.arrayContaining(["Cost for October 2026 due", "Approve: Cost for October 2026", "Task: Renegotiate the shipping rate"]));
  });
});
