// One state change, one event (spec 0034, ticket #400), against the database: whichever way an Action is answered, closed
// or reopened, the one call that changed it writes one send row per Webhook that chose the event; repeats, a lost race
// and a change already made write none. The Slack case is the whole path: a reply in a Slack thread to a Task sends
// `action.done` to the Webhook.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { changeActionState } from "./action-state";
import { removeMember } from "./handover";
import { closeEndedTrials, deleteExpiredTrials } from "./trial-end";
import { archiveMetric } from "./archived-metrics";
import { db } from "./db";
import { mailHostResolver } from "./mail-hosts";
import { ask, markTaskDone, reply, setActionStatus } from "./questions";
import { finishSlackInstall, slackBot, startSlackInstall } from "./slack-connection";
import { receiveSlackEvent } from "./slack-inbound";
import { fakeSlack } from "./test/fake-slack";
import { workspace } from "./test/db-fixtures";
import { finishTask, postReply } from "./threads";
import { createWebhook, setWebhookEnabled, updateWebhook } from "./webhooks";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
const realLookup = mailHostResolver.lookup;
const cleanups: (() => Promise<void>)[] = [];
let slack: Awaited<ReturnType<typeof fakeSlack>>;
beforeAll(async () => { slack = await fakeSlack(); });
afterAll(async () => { await slack.stop(); });
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 78).toString("base64");
  mailHostResolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved;
});

const mail = (who: string) => `${who}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** A Workspace with an asker (Owner), an assignee, a Metric, and two Webhooks: one hears everything about Actions, one only creations. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: mail("sara") });
  const ann = await w.person("member", { email: mail("ann") });
  const m = await w.metric(sara, { name: "Field visits" });
  const a = w.actor(sara); const annActor = w.actor(ann, "member");
  const all = await createWebhook(a, { name: "To Do", url: "https://todo.example.test/hook/1", events: ["action.created", "action.updated", "action.answered", "action.done"] });
  const creations = await createWebhook(a, { name: "Planner", url: "https://planner.example.test/hook/2", events: ["action.created"] });
  const task = (kind: "task" | "question" = "task") => ask(a, { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Send the report", kind });
  return { w, sara, ann, m, a, annActor, all: all.id, creations: creations.id, task };
}
type Ctx = Awaited<ReturnType<typeof setup>>;
type SendRow = { webhook_id: string; type: string; action_id: number; source_type: string; source_webhook_id: string | null; reason: string | null };
const sends = async (actionId: number): Promise<SendRow[]> => ((await db().from("webhook_sends").select("webhook_id, type, action_id, source_type, source_webhook_id, reason").eq("action_id", actionId).order("created_at").order("id")).data ?? []) as SendRow[];
const ofType = (rows: SendRow[], type: string, webhook?: string) => rows.filter((r) => r.type === type && (!webhook || r.webhook_id === webhook));
const statusOf = async (id: number) => (await db().from("actions").select("status").eq("id", id).single()).data?.status;

describe("giving a Task or Question", () => {
  it("sends action.created to each Webhook that chose it, and to none that did not", async () => {
    const { a, all, creations, task } = await setup();
    const id = await task();
    expect((await sends(id)).map((r) => [r.webhook_id === all ? "all" : "creations", r.type, r.source_type]).sort()).toEqual([["all", "action.created", "app"], ["creations", "action.created", "app"]]);
    await updateWebhook(a, creations, { events: [] });
    await setWebhookEnabled(a, all, false);
    expect(await sends(await task("question"))).toEqual([]);
  });
});

describe("answering a Task, whichever way", () => {
  it.each([
    ["the app", "app", (c: Ctx, id: number) => markTaskDone(c.annActor, id)],
    ["email", "email", (c: Ctx, id: number) => postReply(c.w.id, id, c.ann, "Done.", null, { type: "email" })],
    ["Slack", "slack", (c: Ctx, id: number) => postReply(c.w.id, id, c.ann, "Done.", null, { type: "slack" })],
    ["Telegram", "telegram", (c: Ctx, id: number) => postReply(c.w.id, id, c.ann, "Done.", null, { type: "telegram" })],
    ["a reply in the app", "app", (c: Ctx, id: number) => reply(c.annActor, id, "Done.", null)],
  ])("%s fires exactly one action.done, marked with its source, to the Webhook that chose it", async (_name, source, answer) => {
    const c = await setup();
    const id = await c.task();
    await answer(c, id);
    const rows = await sends(id);
    expect(ofType(rows, "action.done")).toEqual([expect.objectContaining({ webhook_id: c.all, source_type: source, reason: "done" })]);
    expect(rows.filter((r) => r.webhook_id === c.creations && r.type !== "action.created")).toEqual([]);
  });

  it("is one event when the same answer comes twice, at once or later: the first change wins, the rest are no-ops", async () => {
    const c = await setup();
    const id = await c.task();
    const [x, y] = await Promise.all([finishTask(c.w.id, id, c.ann, { type: "slack" }), finishTask(c.w.id, id, c.ann, { type: "email" })]);
    expect([x, y].filter(Boolean)).toHaveLength(1);
    expect(await finishTask(c.w.id, id, c.ann, { type: "telegram" })).toBe(false);
    await expect(markTaskDone(c.annActor, id)).rejects.toThrow();
    const done = ofType(await sends(id), "action.done");
    expect(done).toHaveLength(1);
    expect(["slack", "email"]).toContain(done[0].source_type);
  });

  it("does not fire a second action.done when the asker then closes a Task that is done; reopening is an update", async () => {
    const c = await setup();
    const id = await c.task();
    await markTaskDone(c.annActor, id);
    await setActionStatus(c.a, id, "closed");
    expect(ofType(await sends(id), "action.done")).toHaveLength(1);
    await setActionStatus(c.a, id, "closed");
    await setActionStatus(c.a, id, "open");
    expect(ofType(await sends(id), "action.updated")).toHaveLength(1);
    expect(await statusOf(id)).toBe("open");
  });

  it("only the assignee finishes a Task: someone else's try changes and sends nothing", async () => {
    const c = await setup();
    const id = await c.task();
    expect(await finishTask(c.w.id, id, c.sara, { type: "app" })).toBe(false);
    await expect(setActionStatus(c.annActor, id, "closed")).rejects.toThrow();
    expect(ofType(await sends(id), "action.done")).toEqual([]);
    expect(await statusOf(id)).toBe("open");
  });

  it("answering a Task by Slack sends action.done to the Webhook, through the real reply path", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner", { email: mail("sara") });
    slack.newTeam();
    const state = new URL(await startSlackInstall(w.actor(sara))).searchParams.get("state")!;
    expect(await finishSlackInstall(w.actor(sara), { code: "code-1234567890", state })).toBe("connected");
    const bot = (await slackBot(w.id))!;
    const annMail = mail("ann");
    const ann = await w.person("member", { email: annMail });
    const annSlack = slack.user(annMail);
    const m = await w.metric(sara, { name: "Field visits" });
    const hook = await createWebhook(w.actor(sara), { name: "To Do", url: "https://todo.example.test/hook/1", events: ["action.done"] });
    const id = await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Send the report", kind: "task", via: "slack" });
    const d = (await db().from("deliveries").select("slack_channel, slack_ts").eq("workspace_id", w.id).eq("recipient_id", ann).eq("connector", "slack").order("id", { ascending: false }).limit(1).single()).data!;
    const event = { type: "event_callback", team_id: bot.teamId, api_app_id: bot.appId, event_id: `Ev${Math.random().toString(36).slice(2, 12).toUpperCase()}`, event_time: Math.floor(Date.now() / 1000), event: { type: "message", channel_type: "im", channel: d.slack_channel, user: annSlack, text: "Done, sent it.", ts: `${Math.floor(Date.now() / 1000)}.000300`, thread_ts: d.slack_ts } };
    expect(await receiveSlackEvent(event)).toEqual({ outcome: "replied" });
    expect(await sends(id)).toEqual([expect.objectContaining({ webhook_id: hook.id, type: "action.done", source_type: "slack", reason: "done" })]);
  });
});

describe("a Question", () => {
  it("is action.answered when answered and action.done with reason answered when the asker closes it", async () => {
    const c = await setup();
    const id = await c.task("question");
    await reply(c.annActor, id, "Because of the holiday.", null);
    await reply(c.annActor, id, "And one more thing.", null);
    await setActionStatus(c.a, id, "closed");
    const rows = await sends(id);
    expect(ofType(rows, "action.answered", c.all)).toHaveLength(1);
    // The second reply changed no state: it is an update of its own.
    expect(ofType(rows, "action.updated", c.all)).toHaveLength(1);
    expect(ofType(rows, "action.done", c.all)).toEqual([expect.objectContaining({ reason: "answered" })]);
  });
  it("closed without an answer says so", async () => {
    const c = await setup();
    const id = await c.task("question");
    await setActionStatus(c.a, id, "closed");
    expect(ofType(await sends(id), "action.done", c.all)).toEqual([expect.objectContaining({ reason: "closed" })]);
  });
});

describe("the system's closes and a Webhook's own change", () => {
  it("archiving a Metric closes what is open about it, once each, with its reason and the system as source", async () => {
    const c = await setup();
    const openTask = await c.task();
    const openQuestion = await c.task("question");
    const answered = await c.task("question");
    await reply(c.annActor, answered, "Because.", null);
    const doneTask = await c.task();
    await markTaskDone(c.annActor, doneTask);
    expect(await archiveMetric(c.a, c.m.id)).toEqual({ archived: true });
    for (const id of [openTask, openQuestion, answered]) expect(ofType(await sends(id), "action.done", c.all)).toEqual([expect.objectContaining({ reason: "metric_archived", source_type: "system" })]);
    // A Task that was done is not told again.
    expect(ofType(await sends(doneTask), "action.done")).toEqual([expect.objectContaining({ reason: "done" })]);
    expect(await archiveMetric(c.a, c.m.id)).toEqual({ archived: false });
    expect(ofType(await sends(openTask), "action.done")).toHaveLength(1);
    expect(await statusOf(openTask)).toBe("closed");
  });
  it("a change that came from a Webhook goes to every other Webhook, marked with its id, and never back to it", async () => {
    const c = await setup();
    await updateWebhook(c.a, c.creations, { events: ["action.created", "action.done"] });
    const id = await c.task();
    const r = await changeActionState(c.w.id, id, { to: "answered", from: ["open"], reason: "done", guard: { assigneeId: c.ann, kind: "task" } }, { type: "webhook", webhookId: c.all });
    expect(r).toEqual({ changed: true, status: "answered", refused: false });
    const done = ofType(await sends(id), "action.done");
    expect(done.map((x) => x.webhook_id)).toEqual([c.creations]);
    for (const row of done) expect(row).toMatchObject({ source_type: "webhook", source_webhook_id: c.all });
    // Replayed: the same state is no error and no second event.
    expect(await changeActionState(c.w.id, id, { to: "answered", from: ["open"], guard: { assigneeId: c.ann } }, { type: "webhook", webhookId: c.all })).toMatchObject({ changed: false, status: "answered", refused: false });
    expect(ofType(await sends(id), "action.done")).toHaveLength(1);
  });
  it("refuses an Action of another Workspace as one that is not there, and writes nothing", async () => {
    const c = await setup();
    const other = await workspace(); cleanups.push(other.cleanup);
    const id = await c.task();
    expect(await changeActionState(other.id, id, { to: "closed" }, { type: "system" })).toEqual({ changed: false, status: null, refused: true });
    expect(await statusOf(id)).toBe("open");
  });
  it("changes the Action and tells no one when no Webhook is left", async () => {
    const c = await setup();
    const id = await c.task();
    await db().from("webhook_sends").delete().eq("action_id", id);
    // Taking the Webhooks away from under the send (not a mock): the change still happens.
    await db().from("webhooks").delete().eq("workspace_id", c.w.id);
    await markTaskDone(c.annActor, id);
    expect(await statusOf(id)).toBe("answered");
    expect(await sends(id)).toEqual([]);
  });
});

describe("the database guard on an Action's state", () => {
  it("refuses a change of the state that does not come through changeActionState, and allows the one that does", async () => {
    const c = await setup();
    const id = await c.task();
    const direct = await db().from("actions").update({ status: "closed" }).eq("id", id);
    expect(direct.error?.message).toMatch(/changes only through change_action_status/);
    expect(await statusOf(id)).toBe("open");
    // Other columns are not guarded.
    expect((await db().from("actions").update({ updated_at: new Date().toISOString() }).eq("id", id)).error).toBeNull();
    expect((await changeActionState(c.w.id, id, { to: "closed" })).changed).toBe(true);
    expect(await statusOf(id)).toBe("closed");
    // The setting that allows it does not outlive the call.
    expect((await db().from("actions").update({ status: "open" }).eq("id", id)).error).not.toBeNull();
  });
});

describe("the system's own closes", () => {
  it("a person removed from the Workspace: what was asked of them closes with assignee_left, once, and nothing else does", async () => {
    const c = await setup();
    const mine = await c.task();
    const asked = await ask(c.a, { metricId: c.m.id, period: "2026-10-01", assigneeId: c.sara, text: "Check it", kind: "task" });
    await removeMember(c.a, c.ann, c.sara);
    expect(await statusOf(mine)).toBe("closed");
    expect(await statusOf(asked)).toBe("open");
    const done = ofType(await sends(mine), "action.done", c.all);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ source_type: "system", reason: "assignee_left" });
    expect(ofType(await sends(asked), "action.done")).toEqual([]);
  });
});

describe("a closing Workspace", () => {
  it("closes its open Actions with workspace_closing when its trial closes, and a deleted trial goes without trouble", async () => {
    const c = await setup();
    const id = await c.task();
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", c.w.id);
    await closeEndedTrials();
    expect(await statusOf(id)).toBe("closed");
    const done = ofType(await sends(id), "action.done", c.all);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ source_type: "system", reason: "workspace_closing" });
    // A week on it is deleted; what is still open then closes first and nothing stops the deletion.
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - 9 * 86_400_000).toISOString() }).eq("id", c.w.id);
    await deleteExpiredTrials();
    expect((await db().from("workspaces").select("id").eq("id", c.w.id).maybeSingle()).data).toBeNull();
  });
});

describe("switching a Webhook back on", () => {
  it("resets what counted its failures, and sends nothing that was held back meanwhile", async () => {
    const c = await setup();
    await db().from("webhooks").update({ failing_since: new Date(Date.now() - 86_400_000).toISOString(), failure_count: 4 }).eq("id", c.all);
    await setWebhookEnabled(c.a, c.all, false);
    const id = await c.task();
    expect(ofType(await sends(id), "action.created", c.all)).toEqual([]);
    await setWebhookEnabled(c.a, c.all, true);
    expect((await db().from("webhooks").select("failing_since, failure_count, disabled_at, disabled_reason").eq("id", c.all).single()).data).toEqual({ failing_since: null, failure_count: 0, disabled_at: null, disabled_reason: null });
    expect(ofType(await sends(id), "action.created", c.all)).toEqual([]);
  });
});
