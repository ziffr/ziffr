// The review queue of Feedback against the real database (spec 0049, ticket #919): who may use it, that nothing about the
// sender is in it, and each decision (approve, edit and approve, reject) with what the person is told and what the audit
// holds. Serial with the other DB files.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { createFeedback, getMyFeedback } from "./feedback";
import { approveFeedback, listFeedbackQueue, rejectFeedback } from "./feedback-review";
import { installationSettingsView, saveInstallationSettings } from "./installation-settings";
import { forgetStoredSettings } from "./settings-in-effect";
import { installationAdmin, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
const authUsers: string[] = [];
const savedKey = process.env.ZIFFR_CLOUD_KEY;
const savedMode = process.env.ZIFFR_FEEDBACK_MODE;
beforeEach(() => { process.env.ZIFFR_CLOUD_KEY = "k".repeat(32); process.env.ZIFFR_FEEDBACK_MODE = "review"; forgetStoredSettings(); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  for (const id of authUsers.splice(0)) await db().auth.admin.deleteUser(id);
  if (savedKey === undefined) delete process.env.ZIFFR_CLOUD_KEY; else process.env.ZIFFR_CLOUD_KEY = savedKey;
  if (savedMode === undefined) delete process.env.ZIFFR_FEEDBACK_MODE; else process.env.ZIFFR_FEEDBACK_MODE = savedMode;
  forgetStoredSettings();
});

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const id = await w.person("member");
  const { data } = await db().auth.admin.createUser({ email: `fb-${id.slice(2, 10)}@review.test`, email_confirm: true });
  authUsers.push(data.user!.id);
  await db().from("profiles").update({ auth_user_id: data.user!.id }).eq("id", id);
  const admin = await installationAdmin(); cleanups.push(admin.cleanup);
  const sender = w.actor(id, "member");
  const send = (words = "The chart is wrong.") => createFeedback(sender, { kind: "problem", words, route: "/dashboards/q1", appVersion: "0.11.0" });
  return { w, sender, admin: admin.actor, send };
}
const row = async (id: string) => (await db().from("feedback").select("*").eq("id", id).single()).data!;
const events = async (kind: string) => (await db().from("installation_audit_events").select("actor_id, kind, subject").eq("kind", kind).order("id", { ascending: false }).limit(5)).data ?? [];

describe("the queue", () => {
  it("lists what waits, oldest first, with nothing about who sent it", async () => {
    const { admin, send } = await setup();
    const first = await send("first"); const second = await send("second");
    const queue = (await listFeedbackQueue(admin)).filter((q) => [first.id, second.id].includes(q.id));
    expect(queue.map((q) => q.words)).toEqual(["first", "second"]);
    expect(Object.keys(queue[0]).sort()).toEqual(["appVersion", "createdAt", "id", "kind", "route", "words"]);
    expect(queue[0]).toMatchObject({ kind: "problem", route: "/dashboards/:name", appVersion: "0.11.0" });
  });
  it("does not list feedback that was posted directly", async () => {
    const { admin, send } = await setup();
    process.env.ZIFFR_FEEDBACK_MODE = "direct"; forgetStoredSettings();
    const open = await send("goes straight");
    expect((await listFeedbackQueue(admin)).some((q) => q.id === open.id)).toBe(false);
  });
  it("is only for an Installation Admin of the central version", async () => {
    const { w, sender, admin } = await setup();
    await expect(listFeedbackQueue({ personId: sender.personId })).rejects.toBeInstanceOf(Forbidden);
    await expect(listFeedbackQueue({ personId: await w.person("owner") })).rejects.toBeInstanceOf(Forbidden);
    delete process.env.ZIFFR_CLOUD_KEY; forgetStoredSettings();
    await expect(listFeedbackQueue(admin)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("approving", () => {
  it("makes the feedback open, so the bridge files it, and records it by its opaque reference", async () => {
    const { admin, send } = await setup();
    const made = await send();
    await approveFeedback(admin, made.id);
    expect(await row(made.id)).toMatchObject({ status: "open", edited_by_team: false, words: "The chart is wrong." });
    expect(await events("feedback.approved")).toContainEqual({ actor_id: admin.personId, kind: "feedback.approved", subject: (await row(made.id)).public_ref });
  });
  it("stores edited words, says so to the person and flags it", async () => {
    const { admin, sender, send } = await setup();
    const made = await send("Call me on 555-0100, the chart is wrong");
    await approveFeedback(admin, made.id, { words: "The chart is wrong." });
    expect(await row(made.id)).toMatchObject({ status: "open", edited_by_team: true, words: "The chart is wrong." });
    const mine = await getMyFeedback(sender, made.id);
    expect(mine).toMatchObject({ words: "The chart is wrong.", status: "open" });
    expect(mine?.messages).toHaveLength(1);
    expect(mine?.messages[0]).toMatchObject({ fromTeam: true });
    expect(mine?.messages[0].words).toMatch(/edited your words/);
    expect(await events("feedback.edited")).toContainEqual(expect.objectContaining({ subject: (await row(made.id)).public_ref }));
  });
  it("treats an edit that changes nothing as a plain approval", async () => {
    const { admin, send } = await setup();
    const made = await send("same");
    await approveFeedback(admin, made.id, { words: "same" });
    expect(await row(made.id)).toMatchObject({ status: "open", edited_by_team: false });
    const ref = (await row(made.id)).public_ref;
    expect(await events("feedback.edited")).not.toContainEqual(expect.objectContaining({ subject: ref }));
    expect(await events("feedback.approved")).toContainEqual(expect.objectContaining({ subject: ref }));
  });
  it("refuses empty or too long edited words and feedback that is not waiting", async () => {
    const { admin, send } = await setup();
    const made = await send();
    await expect(approveFeedback(admin, made.id, { words: "  " })).rejects.toThrow();
    await expect(approveFeedback(admin, made.id, { words: "x".repeat(2001) })).rejects.toThrow();
    expect((await row(made.id)).status).toBe("waiting_for_review");
    await approveFeedback(admin, made.id);
    await expect(approveFeedback(admin, made.id)).rejects.toThrow(/not waiting/);
    await expect(approveFeedback(admin, "not-an-id")).rejects.toThrow(/not waiting/);
  });
  it("lets only one of two maintainers deciding at once win", async () => {
    const { admin, send } = await setup();
    const made = await send();
    const results = await Promise.allSettled([approveFeedback(admin, made.id), rejectFeedback(admin, made.id, "no"), approveFeedback(admin, made.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("is refused for anyone who is not an Installation Admin, and changes nothing", async () => {
    const { sender, send } = await setup();
    const made = await send();
    await expect(approveFeedback({ personId: sender.personId }, made.id)).rejects.toBeInstanceOf(Forbidden);
    await expect(rejectFeedback({ personId: sender.personId }, made.id, "no")).rejects.toBeInstanceOf(Forbidden);
    expect((await row(made.id)).status).toBe("waiting_for_review");
  });
});

describe("rejecting", () => {
  it("needs a reason, closes the feedback and tells the person why", async () => {
    const { admin, sender, send } = await setup();
    const made = await send();
    await expect(rejectFeedback(admin, made.id, "  ")).rejects.toThrow();
    await expect(rejectFeedback(admin, made.id, undefined)).rejects.toThrow();
    expect((await row(made.id)).status).toBe("waiting_for_review");
    await rejectFeedback(admin, made.id, "This is a support request, please write to support.");
    expect(await row(made.id)).toMatchObject({ status: "closed", filed_at: null });
    const mine = await getMyFeedback(sender, made.id);
    expect(mine?.status).toBe("closed");
    expect(mine?.messages).toEqual([expect.objectContaining({ fromTeam: true, words: expect.stringContaining("This is a support request") })]);
    expect(await events("feedback.rejected")).toContainEqual(expect.objectContaining({ subject: (await row(made.id)).public_ref }));
  });
});

describe("the setting", () => {
  const stored = async () => (await db().from("installation_settings").select("value").eq("name", "ZIFFR_FEEDBACK_MODE").maybeSingle()).data?.value ?? null;
  afterEach(async () => { await db().from("installation_settings").delete().eq("name", "ZIFFR_FEEDBACK_MODE"); });
  it("is saved by an Installation Admin of the central version, recorded by name, and applies to new feedback only", async () => {
    const { admin, send } = await setup();
    delete process.env.ZIFFR_FEEDBACK_MODE; forgetStoredSettings();
    const before = await send("posted directly");
    expect(before.status).toBe("open");
    await saveInstallationSettings(admin, "feedback", { ZIFFR_FEEDBACK_MODE: "review" });
    expect(await stored()).toBe("review");
    expect(await events("setting.set")).toContainEqual({ actor_id: admin.personId, kind: "setting.set", subject: "ZIFFR_FEEDBACK_MODE" });
    const after = await send("now reviewed");
    expect(after.status).toBe("waiting_for_review");
    expect((await row(before.id)).status).toBe("open");
    const feedback = (await installationSettingsView(admin)).sections.find((s) => s.id === "feedback")!;
    expect(feedback.settings.find((x) => x.name === "ZIFFR_FEEDBACK_MODE")).toMatchObject({ value: "review", source: "page" });
  });
  it("refuses a value that is not a mode and anyone who is not an Installation Admin", async () => {
    const { sender, admin: actor } = await setup();
    delete process.env.ZIFFR_FEEDBACK_MODE; forgetStoredSettings();
    await expect(saveInstallationSettings(actor, "feedback", { ZIFFR_FEEDBACK_MODE: "sometimes" })).rejects.toThrow(/directly or reviewed first/);
    await expect(saveInstallationSettings({ personId: sender.personId }, "feedback", { ZIFFR_FEEDBACK_MODE: "review" })).rejects.toBeInstanceOf(Forbidden);
    expect(await stored()).toBeNull();
  });
  it("does not exist on an Installation that is not the central version", async () => {
    const { admin } = await setup();
    delete process.env.ZIFFR_CLOUD_KEY; delete process.env.ZIFFR_FEEDBACK_MODE; forgetStoredSettings();
    await expect(saveInstallationSettings(admin, "feedback", { ZIFFR_FEEDBACK_MODE: "review" })).rejects.toThrow();
    const feedback = (await installationSettingsView(admin)).sections.find((s) => s.id === "feedback")!;
    expect(feedback.settings.map((x) => x.name)).not.toContain("ZIFFR_FEEDBACK_MODE");
    expect(await stored()).toBeNull();
  });
});
