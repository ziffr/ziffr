// The Actions page's Inbox and Timeline against the real database (ticket #784; GLOSSARY: Action, Period Timeline,
// Workflow): groups by the person's own state, value and change only for a Metric they see, and a Timeline that never
// names, quotes or links an event about a Metric the person may not see.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { actionsAskedByMe, actionsTimeline, askedGroup, timelineTone, toCloseCount } from "./actions-overview";
import { saveWorkflow } from "./workflows";
import { workspace } from "./test/db-fixtures";

const PERIOD = "2026-11-16";
const BEFORE = "2026-11-09";
let w: Awaited<ReturnType<typeof workspace>>;
let sara: string, mia: string, ben: string;
let workflowId: number, revenue: number, secret: number, loose: number;
let toBen: number, askedByBen: number, closedOne: number, secretToBen: number, benAskedSecret: number;

beforeAll(async () => {
  w = await workspace();
  sara = await w.person("owner"); mia = await w.person("member"); ben = await w.person("member");
  workflowId = await saveWorkflow(w.actor(sara), null, "Weekly numbers", { dueWorkingDays: 3, steps: [{ type: "publish", lock: true }] });
  const metric = async (name: string, over: Record<string, unknown> = {}) => (await w.metric(sara, { name, period: "week", ...over })).id;
  revenue = await metric("Revenue", { workflow_id: workflowId }); secret = await metric("Secret payroll", { workflow_id: workflowId });
  loose = await metric("Loose coffee");
  await w.token(revenue, ben); await w.token(secret, mia); await w.token(loose, ben);
  await w.value(revenue, BEFORE, 100, ben); await w.value(revenue, PERIOD, 150, ben);
  await w.value(secret, BEFORE, 1000, mia); await w.value(secret, PERIOD, 987654, mia);
  await w.value(loose, PERIOD, 7, ben);
  toBen = await w.action({ metric_id: revenue, period_start: PERIOD, asker_id: mia, assignee_id: ben, question: "Why up?" });
  askedByBen = await w.action({ metric_id: revenue, period_start: PERIOD, asker_id: ben, assignee_id: mia, question: "Check this" });
  closedOne = await w.action({ metric_id: revenue, period_start: BEFORE, asker_id: ben, assignee_id: mia, status: "closed", question: "Old one" });
  // About a Metric Ben does not see, given to him: he may read it, but sees no value of it.
  secretToBen = await w.action({ metric_id: secret, period_start: PERIOD, asker_id: sara, assignee_id: ben, question: "Explain the payroll" });
  benAskedSecret = await w.action({ metric_id: secret, period_start: PERIOD, asker_id: ben, assignee_id: mia, question: "Why so much?" });
  await w.action({ metric_id: loose, period_start: PERIOD, asker_id: ben, assignee_id: mia, question: "Coffee beans?" });
  // An Approval of the Secret Metric between two others, and an Approval Ben may read.
  await w.action({ metric_id: secret, period_start: PERIOD, asker_id: mia, assignee_id: sara, kind: "task", purpose: "approval", question: "Approve Secret payroll: 987654.", created_at: "2026-11-17T10:00:00Z" });
  await w.action({ metric_id: revenue, period_start: PERIOD, asker_id: ben, assignee_id: mia, kind: "task", purpose: "approval", question: "Approve Revenue for Week 47, 2026: 150, up 50 % on the period before. Reply “approve”.", created_at: "2026-11-17T11:00:00Z" });
  await db().from("period_states").insert({ workspace_id: w.id, metric_id: secret, period_start: PERIOD, state: "locked", updated_at: "2026-11-18T09:00:00Z" });
});
afterAll(async () => { await w.cleanup(); });

const benActor = () => w.actor(ben, "member");

describe("Asked by me", () => {
  it("groups by what the Action waits for", () => {
    expect(askedGroup({ status: "open" })).toBe("open");
    expect(askedGroup({ status: "answered" })).toBe("answered");
    expect(askedGroup({ status: "closed" })).toBe("done");
  });

  it("lists only what the person asked, newest first, with the value and its change", async () => {
    const mine = await actionsAskedByMe(benActor());
    expect(mine.every((r) => r.askerId === ben)).toBe(true);
    expect(mine.some((r) => r.id === toBen)).toBe(false);
    expect(mine.find((r) => r.id === askedByBen)).toMatchObject({ group: "open", value: "150", changePercent: 50, metricName: "Revenue" });
    expect(mine.find((r) => r.id === closedOne)!.group).toBe("done");
    expect(mine.map((r) => r.createdAt)).toEqual([...mine.map((r) => r.createdAt)].sort().reverse());
  });

  it("gives no value or change for a Metric the person does not see, and leaves out Threads they may not read", async () => {
    // Ben asked about a Metric he does not see: he reads his own Action, but sees no value of it. The owner does.
    const sarasView = await actionsAskedByMe(w.actor(sara, "owner"));
    expect(sarasView.find((r) => r.id === secretToBen)!.value).toMatch(/987/);
    const bens = await actionsAskedByMe(benActor());
    expect(bens.find((r) => r.id === benAskedSecret)).toMatchObject({ value: null, changePercent: null });
    expect(JSON.stringify(bens)).not.toContain("987654");
  });

  it("is empty for a person of another Workspace", async () => {
    const other = await workspace(); const eve = await other.person("owner");
    try { expect(await actionsAskedByMe(other.actor(eve, "owner"))).toEqual([]); } finally { await other.cleanup(); }
  });
});

describe("the Timeline", () => {
  it("never names, quotes or links an event about a Metric the person may not see", async () => {
    const t = await actionsTimeline(benActor());
    const everything = JSON.stringify(t);
    for (const word of ["Secret", "payroll", "987654"]) expect(everything).not.toContain(word);
    expect(t.metrics.map((m) => m.name)).not.toContain("Secret payroll");
    expect(t.items.every((i) => i.metricIds.every((id) => id !== secret))).toBe(true);
    // The hidden lock is only a count.
    expect(t.items.find((i) => i.kind === "locked")).toMatchObject({ items: ["1 value"] });
    // The Approval about a visible Metric is there, as is the Action on a Metric no Workflow asks for.
    expect(t.items.some((i) => i.kind === "approval_asked" && i.text.endsWith("Revenue"))).toBe(true);
    expect(t.items.some((i) => i.workflowId === null && i.text.endsWith("about Loose coffee"))).toBe(true);
    // Newest first.
    expect(t.items.map((i) => i.at)).toEqual([...t.items.map((i) => i.at)].sort().reverse());
  });

  it("shows the owner everything and narrows by Workflow, Metric and period", async () => {
    const all = await actionsTimeline(w.actor(sara, "owner"));
    expect(all.metrics.map((m) => m.name)).toContain("Secret payroll");
    const wf = await actionsTimeline(w.actor(sara, "owner"), { workflowId });
    expect(wf.items.every((i) => i.workflowId === workflowId)).toBe(true);
    const metric = await actionsTimeline(w.actor(sara, "owner"), { metricId: loose });
    expect(metric.items.length).toBeGreaterThan(0);
    expect(metric.items.every((i) => i.metricIds.includes(loose))).toBe(true);
    const day = await actionsTimeline(w.actor(sara, "owner"), { period: BEFORE });
    expect(day.items.every((i) => i.period === BEFORE)).toBe(true);
  });

  it("marks an Approval still waiting as needing attention, and a Lock as finished", () => {
    expect(timelineTone({ kind: "approval_asked", path: "/actions/1" }, new Set())).toBe("attention");
    expect(timelineTone({ kind: "approval_asked", path: "/actions/1" }, new Set(["/actions/1"]))).toBe("neutral");
    expect(timelineTone({ kind: "locked" }, new Set())).toBe("finished");
    expect(timelineTone({ kind: "in" }, new Set())).toBe("neutral");
  });

  it("is empty for another Workspace's person", async () => {
    const other = await workspace(); const eve = await other.person("owner");
    try {
      const t = await actionsTimeline(other.actor(eve, "owner"));
      expect(t.items).toEqual([]);
    } finally { await other.cleanup(); }
  });
});

describe("the Timeline for others", () => {
  it("leaves out a loose Action whose Group does not include the person", async () => {
    const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Board" }).select("id").single();
    await db().from("group_members").insert({ workspace_id: w.id, group_id: g!.id, user_id: mia });
    await w.action({ metric_id: loose, period_start: PERIOD, asker_id: sara, assignee_id: mia, read_group_id: g!.id, question: "Board only coffee talk", created_at: "2026-11-19T10:00:00Z" });
    expect(JSON.stringify(await actionsTimeline(benActor()))).not.toContain("Board only");
    expect(JSON.stringify(await actionsTimeline(w.actor(sara, "owner")))).toContain("Board only");
  });

  it("gives a Guest only their own name, and offers only the Workflows of what is shared with them", async () => {
    const guest = await w.person("guest");
    const other = (await saveWorkflow(w.actor(sara), null, "Hidden flow", { dueWorkingDays: 3, steps: [{ type: "publish", lock: true }] }));
    await w.metric(sara, { name: "Hidden flow metric", period: "week", workflow_id: other });
    await w.share(loose, guest); await w.share(revenue, guest);
    const t = await actionsTimeline(w.actor(guest, "guest"));
    expect(t.workflows.map((x) => x.name)).toEqual(["Weekly numbers"]);
    const text = JSON.stringify(t);
    expect(text).not.toContain("Hidden flow");
    expect(text).not.toContain("Secret");
    // Other people are "Someone" on a Guest's lines.
    expect(t.items.find((i) => i.text.includes("about Loose coffee"))!.text).toMatch(/^Someone (asked|gave) Someone/);
  });

  it("answers a hidden Metric, a Workflow the person does not know and an id that does not exist the same way", async () => {
    const guest = await w.person("guest");
    await w.share(revenue, guest);
    const none = await actionsTimeline(w.actor(guest, "guest"), { metricId: 999999999 });
    const hidden = await actionsTimeline(w.actor(guest, "guest"), { metricId: secret });
    expect(hidden).toEqual(none);
    const noWf = await actionsTimeline(w.actor(guest, "guest"), { workflowId: 999999999 });
    const hiddenWf = await actionsTimeline(w.actor(guest, "guest"), { workflowId: (await db().from("workflows").select("id").eq("workspace_id", w.id).eq("name", "Hidden flow").single()).data!.id });
    expect(hiddenWf).toEqual(noWf);
    expect(noWf.items).toEqual([]);
    // The same for a member who does not see the Metric.
    expect(await actionsTimeline(benActor(), { metricId: secret })).toEqual(await actionsTimeline(benActor(), { metricId: 999999999 }));
  });

  it("opens a newer Workflow asked for by id, and counts what waits to be closed", async () => {
    const newer = await saveWorkflow(w.actor(sara), null, "Newer flow", { dueWorkingDays: 3, steps: [{ type: "publish", lock: true }] });
    await w.metric(sara, { name: "Newer metric", period: "week", workflow_id: newer });
    const t = await actionsTimeline(w.actor(sara, "owner"), { workflowId: newer });
    expect(t.workflows.map((x) => x.id)).toContain(newer);
    const answered = await w.action({ metric_id: loose, period_start: BEFORE, asker_id: ben, assignee_id: mia, status: "answered", question: "To close?" });
    expect(answered).toBeGreaterThan(0);
    expect(await toCloseCount(benActor())).toBe(1);
    expect(await toCloseCount(w.actor(mia, "member"))).toBe(0);
  });

  it("does not let a hidden Metric's activity change the order of Workflows", async () => {
    // Two Workflows: Ben sees a Metric of the first only. Fresh activity on a Metric of the second that he does not see
    // must not lift it above the first for him, though it does for the owner.
    const first = await saveWorkflow(w.actor(sara), null, "First flow", { dueWorkingDays: 3, steps: [{ type: "publish", lock: true }] });
    const second = await saveWorkflow(w.actor(sara), null, "Second flow", { dueWorkingDays: 3, steps: [{ type: "publish", lock: true }] });
    const a = await w.metric(sara, { name: "Order A", period: "week", workflow_id: first }); await w.token(a.id, ben);
    const b = await w.metric(sara, { name: "Order B", period: "week", workflow_id: second });
    await db().from("period_states").insert([
      { workspace_id: w.id, metric_id: a.id, period_start: PERIOD, state: "published", updated_at: "2026-11-20T09:00:00Z" },
      { workspace_id: w.id, metric_id: b.id, period_start: PERIOD, state: "published", updated_at: "2026-11-21T09:00:00Z" },
    ]);
    const names = (t: Awaited<ReturnType<typeof actionsTimeline>>) => t.items.filter((i) => ["First flow", "Second flow"].includes(i.workflowName ?? "")).map((i) => i.workflowName);
    expect(names(await actionsTimeline(benActor()))).toEqual(["First flow"]);
    expect(names(await actionsTimeline(w.actor(sara, "owner")))[0]).toBe("Second flow");
  });
});
