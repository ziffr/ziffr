// What a Guest is shown (GLOSSARY: Workspace Role; ticket #504): only what is shared with them, never the Workspace's
// members and Groups, other Workflows, or anyone's email, against the real database.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { activityView, connectorsView, metricExtras, teamView, workflowsView } from "./page-data";
import { listWorkflowNames, periodTimeline, workflowPeriods } from "./period-timeline";
import { tellEditorFacts } from "./tell";
import { saveWorkflow, setMetricWorkflow, workflowAskingRun } from "./workflows";
import { createGroup, setGroupMember } from "./team";
import { getCanvasData } from "./access";
import { listGroups } from "./api";
import { peopleIn } from "./submissions";
import { setPreference } from "./questions";
import { workspace } from "./test/db-fixtures";
import { JANUARY, periodStart } from "./periods";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const month = periodStart(new Date(), "month", JANUARY);
const publish = { type: "publish", lock: false } as const;

/** A Workspace with an owner, a member and a Guest; the Guest has one Metric shared, on Workflow `seen`; another
 * Metric runs on Workflow `hidden`, whose Approver is the member. */
async function setUp() {
  const w = await ws();
  const sara = await w.person("owner", { email: `sara-${randomUUID()}@example.test`, slack_handle: `@sara-${randomUUID().slice(0, 8)}` });
  const ben = await w.person("member", { email: `ben-${randomUUID()}@example.test` });
  const gus = await w.person("guest");
  const owner = w.actor(sara);
  const seen = await saveWorkflow(owner, null, "Shared close", { dueWorkingDays: 1, steps: [publish] });
  const hidden = await saveWorkflow(owner, null, "Board pack", { dueWorkingDays: 1, steps: [{ type: "approve", approvers: [ben], values: "every" }, publish] });
  const shared = await w.metric(sara, { name: "Field visits" });
  const secret = await w.metric(sara, { name: "Payroll" });
  await setMetricWorkflow(owner, shared.id, seen);
  await setMetricWorkflow(owner, secret.id, hidden);
  await w.share(shared.id, gus);
  await w.token(secret.id, ben);
  return { w, sara, ben, gus, seen, hidden, shared, secret, guest: w.actor(gus, "guest"), member: w.actor(ben, "member") };
}

describe("a Guest", () => {
  it("is refused the Team page's members, roles and days away; a member is not", async () => {
    const { guest, member } = await setUp();
    await expect(teamView(guest)).rejects.toThrow(Forbidden);
    expect((await teamView(member)).roles.length).toBe(3);
  });

  it("gets only the Workflows of Metrics shared with them, in the page, the API list and the timeline", async () => {
    const { guest, member, seen, hidden, shared } = await setUp();
    expect((await workflowsView(guest)).workflows.map((x) => x.id)).toEqual([seen]);
    expect((await workflowsView(member)).workflows.map((x) => x.id).sort()).toEqual([seen, hidden].sort());
    expect((await listWorkflowNames(guest, { limit: 50 })).items.map((x) => x.name)).toEqual(["Shared close"]);
    await expect(periodTimeline(guest, hidden, month)).rejects.toThrow(Forbidden);
    await expect(workflowPeriods(guest, hidden)).rejects.toThrow(Forbidden);
    expect((await periodTimeline(guest, seen, month)).workflow.id).toBe(seen);
    expect(await workflowAskingRun(guest, hidden)).toBeNull();
    expect((await metricExtras(guest, shared.id, "month")).workflows.map((x) => x.id)).toEqual([seen]);
  });

  it("is shown no Groups to tell, and in a canvas only their own Groups, no team templates and no other Metric's submitters", async () => {
    const { w, sara, ben, gus, guest, secret, shared } = await setUp();
    const owner = w.actor(sara);
    const theirs = await createGroup(owner, "Field");
    const board = await createGroup(owner, "Board");
    await setGroupMember(owner, theirs, gus, true);
    await setGroupMember(owner, board, ben, true);
    await db().from("team_templates").insert({ workspace_id: w.id, owner_id: sara, kind: "widget", name: "Sara's", view: "number", slots: [], body: {}, w: 2, h: 2 });
    expect((await tellEditorFacts(guest, null)).groups).toEqual([]);
    const canvas = await getCanvasData(w.id, gus);
    expect(canvas.groups.map((g) => g.name)).toEqual(["Field"]);
    expect(canvas.templates).toEqual([]);
    expect(Object.keys(canvas.submitters).map(Number)).not.toContain(secret.id);
    expect(canvas.metrics.map((m) => m.id)).toEqual([shared.id]);
    expect((await listGroups(guest, { limit: 50 })).items.map((g) => g.name)).toEqual(["Field"]);
    // A member still sees every Group to share with.
    expect((await getCanvasData(w.id, ben)).groups.map((g) => g.name)).toEqual(expect.arrayContaining(["Board", "Field"]));
  });

  it("sees no change to another Workflow in Activity, and only their own Delivery Preferences", async () => {
    const { w, sara, ben, guest, member, hidden, seen } = await setUp();
    // Editing a Workflow records its Versions.
    await saveWorkflow(w.actor(sara), hidden, "Board pack, monthly", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ben], values: "every" }, publish] });
    await saveWorkflow(w.actor(sara), seen, "Shared close, monthly", { dueWorkingDays: 2, steps: [publish] });
    const workflowVersions = async (a: typeof guest) => (await activityView(a)).versions.filter((v) => v.object_type === "workflow").map((v) => v.object_id);
    expect(await workflowVersions(guest)).not.toContain(hidden);
    expect(await workflowVersions(member)).toEqual(expect.arrayContaining([hidden, seen]));
    await setPreference(w.actor(ben, "member"), ben, "question", "email");
    expect((await connectorsView(guest)).prefs.some((p) => p.user_id === ben)).toBe(false);
    expect((await connectorsView(member)).prefs.some((p) => p.user_id === ben)).toBe(true);
  });
});

describe("the people a page is given", () => {
  it("carry no member's email, Slack handle or sign-in account; intake still gets them", async () => {
    const { w, sara } = await setUp();
    const shown = (await peopleIn(w.id)).find((p) => p.id === sara)!;
    expect(shown).toMatchObject({ email: "", slack_handle: "" });
    expect(Object.keys(shown)).not.toContain("auth_user_id");
    const forIntake = (await peopleIn(w.id, { contactDetails: true })).find((p) => p.id === sara)!;
    expect(forIntake.email).toMatch(/^sara-.*@example\.test$/);
    expect(forIntake.slack_handle).toMatch(/^@sara-/);
  });
});
