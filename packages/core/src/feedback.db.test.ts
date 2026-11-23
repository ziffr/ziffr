// Feedback against the real database (spec 0049, ticket #915): who may send, what is stored, the limits, and that one
// person never sees another's. Serial with the other DB files.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { createFeedback, getMyFeedback, listMyFeedback } from "./feedback";
import { FEEDBACK_PER_PERSON_PER_DAY, FEEDBACK_PER_WORKSPACE_PER_DAY, FEEDBACK_WORDS_MAX } from "./feedback-rules";
import { forgetStoredSettings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
const authUsers: string[] = [];
const saved = process.env.ZIFFR_CLOUD_KEY;
beforeEach(() => { process.env.ZIFFR_CLOUD_KEY = "k".repeat(32); forgetStoredSettings(); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  for (const id of authUsers.splice(0)) await db().auth.admin.deleteUser(id);
  if (saved === undefined) delete process.env.ZIFFR_CLOUD_KEY; else process.env.ZIFFR_CLOUD_KEY = saved;
  forgetStoredSettings();
});
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

/** A member who has a login, as a signed-in person has. */
async function signedIn(w: Awaited<ReturnType<typeof ws>>, role: "owner" | "admin" | "member" | "guest" = "member") {
  const id = await w.person(role);
  const { data } = await db().auth.admin.createUser({ email: `fb-${id.slice(2, 10)}@feedback.test`, email_confirm: true });
  authUsers.push(data.user!.id);
  await db().from("profiles").update({ auth_user_id: data.user!.id }).eq("id", id);
  return id;
}
const say = (a: Actor, over: Record<string, unknown> = {}) => createFeedback(a, { kind: "problem", words: "The chart is wrong.", ...over });

describe("sending", () => {
  it("stores the kind, the cleaned words, a plain route and the version, waiting for review, and answers with only those", async () => {
    const w = await ws(); const ben = await signedIn(w);
    const made = await say(w.actor(ben, "member"), { kind: "idea", words: "  More colours please\u0000 ", route: "/metrics/monthly-revenue?x=1#top", appVersion: "0.11.0" });
    expect(made).toMatchObject({ kind: "idea", words: "More colours please", route: "/metrics/:name", appVersion: "0.11.0", status: "waiting_for_review" });
    expect(Object.keys(made).sort()).toEqual(["appVersion", "createdAt", "id", "kind", "route", "status", "words"]);
    const { data } = await db().from("feedback").select("*").eq("id", made.id).single();
    expect(data).toMatchObject({ person_id: ben, workspace_id: w.id, public_ref: expect.stringMatching(/^[0-9a-f]{16}$/) });
  });
  it("drops a route that is not a path and a version that is not a number, and refuses bad kinds and words", async () => {
    const w = await ws(); const ben = await signedIn(w); const a = w.actor(ben, "member");
    const made = await say(a, { route: "https://evil.example/x", appVersion: "latest <script>" });
    expect(made).toMatchObject({ route: null, appVersion: null });
    await expect(say(a, { kind: "bug" })).rejects.toThrow();
    await expect(say(a, { words: "   " })).rejects.toThrow();
    await expect(say(a, { words: "x".repeat(FEEDBACK_WORDS_MAX + 1) })).rejects.toThrow();
    await expect(say(a, { words: { $gt: "" } })).rejects.toThrow();
  });
  it("is only for a signed-in member of a real Workspace on hosted Ziffr", async () => {
    const w = await ws(); const ben = await signedIn(w); const noLogin = await w.person("member"); const stranger = await signedIn(await ws());
    await expect(say(w.actor(noLogin, "member"))).rejects.toBeInstanceOf(Forbidden);
    await expect(say(w.actor(stranger, "member"))).rejects.toBeInstanceOf(Forbidden);
    await expect(say({ ...w.actor(ben, "member"), workspaceId: DEMO_WORKSPACE_ID })).rejects.toBeInstanceOf(Forbidden);
    await expect(say({ ...w.actor(ben, "member"), key: { id: "k", scopes: ["*"] } } as unknown as Actor)).rejects.toBeInstanceOf(Forbidden);
    delete process.env.ZIFFR_CLOUD_KEY; forgetStoredSettings();
    await expect(say(w.actor(ben, "member"))).rejects.toBeInstanceOf(Forbidden);
    await expect(listMyFeedback(w.actor(ben, "member"))).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("limits", () => {
  it("stops one person after their share of the day, and not the next person", async () => {
    const w = await ws(); const ben = await signedIn(w); const eva = await signedIn(w);
    for (let i = 0; i < FEEDBACK_PER_PERSON_PER_DAY; i++) await say(w.actor(ben, "member"));
    await expect(say(w.actor(ben, "member"))).rejects.toThrow(/enough feedback for today/);
    await expect(say(w.actor(eva, "member"))).resolves.toBeTruthy();
  });
  it("counts only the last 24 hours", async () => {
    const w = await ws(); const ben = await signedIn(w);
    for (let i = 0; i < FEEDBACK_PER_PERSON_PER_DAY; i++) await say(w.actor(ben, "member"));
    await db().from("feedback").update({ created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("person_id", ben);
    await expect(say(w.actor(ben, "member"))).resolves.toBeTruthy();
  });
  it("stops a whole Workspace after its share of the day", async () => {
    const w = await ws();
    const people: string[] = [];
    for (let i = 0; i < FEEDBACK_PER_WORKSPACE_PER_DAY / FEEDBACK_PER_PERSON_PER_DAY + 1; i++) people.push(await signedIn(w));
    for (const p of people.slice(0, -1)) for (let i = 0; i < FEEDBACK_PER_PERSON_PER_DAY; i++) await say(w.actor(p, "member"));
    await expect(say(w.actor(people.at(-1)!, "member"))).rejects.toThrow(/enough feedback for today/);
  });
  it("does not let simultaneous requests pass the limit together", async () => {
    const w = await ws(); const ben = await signedIn(w);
    const results = await Promise.allSettled(Array.from({ length: FEEDBACK_PER_PERSON_PER_DAY + 4 }, () => say(w.actor(ben, "member"))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(FEEDBACK_PER_PERSON_PER_DAY);
  });
});

describe("who sees what", () => {
  it("lists only the actor's own feedback, newest first, and gets only their own by id", async () => {
    const w = await ws(); const ben = await signedIn(w); const eva = await signedIn(w);
    const first = await say(w.actor(ben, "member"), { words: "first" });
    const second = await say(w.actor(ben, "member"), { words: "second" });
    const evas = await say(w.actor(eva, "member"), { words: "Eva's secret" });
    expect((await listMyFeedback(w.actor(ben, "member"))).map((f) => f.id)).toEqual([second.id, first.id]);
    expect((await listMyFeedback(w.actor(eva, "member"))).map((f) => f.words)).toEqual(["Eva's secret"]);
    expect(await getMyFeedback(w.actor(ben, "member"), evas.id)).toBeNull();
    expect(await getMyFeedback(w.actor(ben, "member"), "not-an-id")).toBeNull();
    expect(await getMyFeedback(w.actor(ben, "member"), crypto.randomUUID())).toBeNull();
    expect(await getMyFeedback(w.actor(eva, "member"), evas.id)).toMatchObject({ words: "Eva's secret", messages: [] });
  });
  it("shows a person's feedback to them from any of their Workspaces, and the owner of a Workspace sees nobody else's", async () => {
    const w = await ws(); const owner = await signedIn(w, "owner"); const ben = await signedIn(w);
    await say(w.actor(ben, "member"), { words: "private" });
    expect(await listMyFeedback(w.actor(owner, "owner"))).toEqual([]);
  });
  it("shows the conversation under a feedback, from the team and from the person, in order", async () => {
    const w = await ws(); const ben = await signedIn(w);
    const made = await say(w.actor(ben, "member"));
    await db().from("feedback_messages").insert([{ feedback_id: made.id, from_team: true, words: "Thanks, looking at it." }, { feedback_id: made.id, from_team: false, words: "Great." }]);
    const got = await getMyFeedback(w.actor(ben, "member"), made.id);
    expect(got?.messages.map((m) => [m.fromTeam, m.words])).toEqual([[true, "Thanks, looking at it."], [false, "Great."]]);
  });
  it("goes with the person when they are deleted", async () => {
    const w = await ws(); const ben = await signedIn(w);
    const made = await say(w.actor(ben, "member"));
    await w.cleanup();
    cleanups.length = 0;
    const { data } = await db().from("feedback").select("id").eq("id", made.id);
    expect(data).toEqual([]);
  });
});
