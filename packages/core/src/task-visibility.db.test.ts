// Who reads a Workflow's task and its Thread (ticket 323; GLOSSARY: Thread, Approval, Share, Group, Workspace Role):
// the people on it, and anyone else only if they see its Metric. Before, every member read a task that named no
// Group, and the action page drew the Metric's chart for anyone who could open it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { readableActions } from "./access";
import { actionThread } from "./page-data";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { workspace } from "./test/db-fixtures";

let w: Awaited<ReturnType<typeof workspace>>;
let sara: string, ben: string, ada: string, ann: string, carla: string;
let metricId: number, taskId: number, limitedId: number, groupId: number;
const thisMonth = periodStart(new Date(), "month", JANUARY);

beforeAll(async () => {
  w = await workspace();
  sara = await w.person("owner");
  ben = await w.person("member");
  ada = await w.person("admin");
  ann = await w.person("member");
  carla = await w.person("member");
  const m = await w.metric(sara, { name: "Payroll" });
  metricId = m.id;
  let obs = 0;
  for (let i = 5; i >= 0; i--) obs = await w.value(m.id, shiftPeriod(thisMonth, "month", -i), 100 + i, sara);
  // Carla sees the Metric through a Share; Ben and Ada (an Admin) do not; Ann is only the task's Approver.
  await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: m.id, user_id: carla, role: "viewer" });
  // A Workflow's Approval task, open to the whole workspace by its Group (none), as the engine makes them.
  taskId = await w.action({ metric_id: m.id, period_start: thisMonth, asker_id: sara, assignee_id: ann, kind: "task", purpose: "approval", observation_id: obs, question: "Approve Payroll: 100." });
  const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Board" }).select("id").single();
  groupId = g!.id as number;
  await db().from("group_members").insert({ workspace_id: w.id, group_id: groupId, user_id: ben });
  limitedId = await w.action({ metric_id: m.id, period_start: thisMonth, asker_id: sara, assignee_id: sara, read_group_id: groupId });
});
afterAll(async () => { await w.cleanup(); });

const listed = async (person: string) => (await readableActions(w.id, person)).map((a) => a.id);

describe("a Workflow's task", () => {
  it("is neither listed nor opened for a member who does not see its Metric", async () => {
    expect(await listed(ben)).not.toContain(taskId);
    expect(await actionThread(w.actor(ben, "member"), taskId)).toBeNull();
    // Nor for one metric's page of Actions.
    expect((await readableActions(w.id, ben, { metricId })).map((a) => a.id)).toEqual([]);
  });

  it("gives an Admin nothing for being one: only a Share does", async () => {
    expect(await listed(ada)).not.toContain(taskId);
    expect(await actionThread(w.actor(ada, "admin"), taskId)).toBeNull();
    const { data: share } = await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: metricId, user_id: ada, role: "viewer" }).select("id").single();
    try {
      expect(await listed(ada)).toContain(taskId);
      const t = await actionThread(w.actor(ada, "admin"), taskId);
      expect(t?.seesMetric).toBe(true);
      expect(t?.chart.length).toBeGreaterThan(1);
    } finally {
      await db().from("shares").delete().eq("id", share!.id);
    }
  });

  it("is opened for its Assignee with its value, but without the Metric's history they do not see", async () => {
    expect(await listed(ann)).toContain(taskId);
    const t = await actionThread(w.actor(ann, "member"), taskId);
    expect(t).not.toBeNull();
    expect(t!.seesMetric).toBe(false);
    expect(t!.chart).toEqual([]);
    expect(Number(t!.observation?.value)).toBe(100);
  });

  it("is opened, with the chart, for a member the Metric is shared with, and for its owner", async () => {
    for (const [person, role] of [[carla, "member"], [sara, "owner"]] as const) {
      expect(await listed(person)).toContain(taskId);
      const t = await actionThread(w.actor(person, role), taskId);
      expect(t?.seesMetric).toBe(true);
      expect(t!.chart.map((p) => p.period)).toContain(thisMonth);
      expect(t!.chart.length).toBeGreaterThan(1);
    }
  });
});

describe("a Thread limited to a Group", () => {
  it("needs both: being in the Group, and seeing the Metric", async () => {
    // Ben is in the Group but does not see the Metric; Carla sees it but is not in the Group.
    expect(await listed(ben)).not.toContain(limitedId);
    expect(await listed(carla)).not.toContain(limitedId);
    await db().from("group_members").insert({ workspace_id: w.id, group_id: groupId, user_id: carla });
    expect(await listed(carla)).toContain(limitedId);
    expect(await actionThread(w.actor(carla, "member"), limitedId)).not.toBeNull();
  });
});
