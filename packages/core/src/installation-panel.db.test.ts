// The Installation's panel against the real database (spec 0066; GLOSSARY: Installation Admin, User, Blocked User,
// Installation Health): only Installation Admins read or change anything; the lists hold account and Workspace facts and
// nothing a Workspace holds; a block ends sessions, refuses sign-in and stops every way of acting as the person until it
// is lifted; only a running trial gets more days; and each action is in the panel's Changes.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { actorForKey, createAccessKey } from "./access-keys";
import { Forbidden } from "./actor";
import { fetchCalendar, makeCalendarLink } from "./calendar-links";
import { db } from "./db";
import { addInstallationAdmin, installationEvents } from "./installation-admins";
import { installationHealth } from "./installation-health";
import { ADMIN_ACTIONS_PER_HOUR, blockUser, installationUsers, signOutUser, unblockUser } from "./installation-users";
import { extendTrial, installationWorkspaces, TRIAL_EXTEND_MAX_DAYS } from "./installation-workspaces";
import { initialDeliveryState } from "./outbound";
import { submissionForm } from "./page-data";
import { routeReply } from "./reply-routing";
import { submitValue } from "./submissions";
import { BLOCKED_HOLDS_BACK, personBlocked, sendingHeldBack } from "./user-block";
import { auditRowsOf, installationAdmin, workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<unknown>)[] = [];
const accounts: string[] = [];
let admin: Awaited<ReturnType<typeof installationAdmin>>;
const savedAdmins = process.env.ZIFFR_INSTALLATION_ADMINS;

beforeAll(async () => { delete process.env.ZIFFR_INSTALLATION_ADMINS; admin = await installationAdmin(); });
afterEach(async () => {
  delete process.env.ZIFFR_INSTALLATION_ADMINS;
  for (const c of cleanups.splice(0)) await c();
  for (const id of accounts.splice(0)) await db().auth.admin.deleteUser(id).catch(() => {});
});
afterAll(async () => {
  await admin.cleanup();
  if (savedAdmins !== undefined) process.env.ZIFFR_INSTALLATION_ADMINS = savedAdmins;
});

async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A client of its own for signing in, so no session ever sticks to the core's database client. */
const authClient = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).auth;

/** Links an account with a password to a person, as someone who signed up would have. */
async function account(personId: string | null) {
  const mark = randomUUID().slice(0, 12);
  const email = `panel-${mark}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const userId = data.user.id;
  accounts.push(userId);
  if (personId) await db().from("profiles").update({ auth_user_id: userId, email }).eq("id", personId);
  const signIn = () => authClient().signInWithPassword({ email, password });
  return { userId, email, mark, signIn };
}

/** The panel's list as it shows one account. */
const listed = async (userId: string, search: string) => (await installationUsers(admin.actor, { search })).rows.find((u) => u.userId === userId);

describe("who may use the panel", () => {
  it("refuses everyone who is not an Installation Admin, an Owner of a Workspace included", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = await account(sara);
    const actor = { personId: sara };
    await expect(installationUsers(actor)).rejects.toThrow(Forbidden);
    await expect(installationWorkspaces(actor)).rejects.toThrow(Forbidden);
    await expect(installationHealth(actor)).rejects.toThrow(Forbidden);
    await expect(blockUser(actor, a.userId)).rejects.toThrow(Forbidden);
    await expect(unblockUser(actor, a.userId)).rejects.toThrow(Forbidden);
    await expect(signOutUser(actor, a.userId)).rejects.toThrow(Forbidden);
    await expect(extendTrial(actor, w.id, 3)).rejects.toThrow(Forbidden);
    expect(await personBlocked(sara)).toBe(false);
  });

  it("refuses in the database too, should the core ever call it for someone who is none", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = await account(sara);
    const { data } = await db().rpc("installation_user_action", { p_actor: sara, p_actor_on_server: false, p_actor_name: "Sara", p_user: a.userId, p_action: "block", p_server_admins: [], p_limit: 60 });
    expect(data).toBe("forbidden");
    expect(await personBlocked(sara)).toBe(false);
  });
});

describe("Users", () => {
  it("lists account facts and how many Workspaces, found by a part of the name or address", async () => {
    const w = await ws("Secret Workspace Name"); const sara = await w.person("owner"); const a = await account(sara);
    await w.metric(sara, { name: "Secretname revenue" });
    const row = (await listed(a.userId, a.mark.toUpperCase()))!;
    expect(row).toEqual({ userId: a.userId, name: expect.any(String), email: a.email, signedUpAt: expect.any(String), lastSignInAt: null, status: "never_signed_in", workspaces: 1, installationAdmin: false, you: false });
    await a.signIn();
    expect((await listed(a.userId, a.mark))!.status).toBe("active");
    expect((await installationUsers(admin.actor, { search: `${a.mark}-nobody` })).rows).toEqual([]);
    // A search is text, never a pattern.
    expect((await installationUsers(admin.actor, { search: "%" })).rows).toEqual([]);
  });

  it("blocks: signed out at once, no sign-in until unblocked, and the Changes say who", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = await account(sara);
    const signedIn = await a.signIn();
    const token = signedIn.data.session!.access_token;
    expect((await authClient().getUser(token)).data.user?.id).toBe(a.userId);

    await blockUser(admin.actor, a.userId);
    expect((await authClient().getUser(token)).data.user).toBeNull();
    expect((await authClient().refreshSession({ refresh_token: signedIn.data.session!.refresh_token })).data.session).toBeNull();
    expect((await a.signIn()).data.session).toBeNull();
    expect(await personBlocked(sara)).toBe(true);
    expect((await listed(a.userId, a.mark))!.status).toBe("blocked");
    await expect(blockUser(admin.actor, a.userId)).rejects.toThrow(/blocked already/);
    await expect(addInstallationAdmin(admin.actor, a.email)).rejects.toThrow(/blocked/);

    await unblockUser(admin.actor, a.userId);
    expect(await personBlocked(sara)).toBe(false);
    expect((await a.signIn()).data.session).not.toBeNull();
    await expect(unblockUser(admin.actor, a.userId)).rejects.toThrow(/not blocked/);

    const events = (await installationEvents(admin.actor, 10)).filter((e) => e.kind.startsWith("user."));
    expect(events.slice(0, 2).map((e) => e.kind)).toEqual(["user.unblocked", "user.blocked"]);
    expect(events[0].subject).toContain("owner");
    // The audit keeps the account's id, never a name or address.
    const { data: kept } = await db().from("installation_audit_events").select("subject").eq("kind", "user.blocked").eq("actor_id", admin.actor.personId).order("id", { ascending: false }).limit(1).single();
    expect(kept!.subject).toBe(a.userId);
  });

  it("signs out everywhere without blocking", async () => {
    const a = await account(null);
    const token = (await a.signIn()).data.session!.access_token;
    await signOutUser(admin.actor, a.userId);
    expect((await authClient().getUser(token)).data.user).toBeNull();
    expect((await a.signIn()).data.session).not.toBeNull();
  });

  it("never blocks yourself or an Installation Admin, added on the page or named on the server", async () => {
    const mine = await account(admin.actor.personId);
    cleanups.push(async () => { await db().from("profiles").update({ auth_user_id: null, email: null }).eq("id", admin.actor.personId); });
    await expect(blockUser(admin.actor, mine.userId)).rejects.toThrow(/yourself/);

    const other = await installationAdmin(); cleanups.push(other.cleanup);
    const theirs = await account(other.actor.personId);
    await expect(blockUser(admin.actor, theirs.userId)).rejects.toThrow(/Installation Admin cannot be blocked/);

    const named = await account(null);
    process.env.ZIFFR_INSTALLATION_ADMINS = named.email.toUpperCase();
    await expect(blockUser(admin.actor, named.userId)).rejects.toThrow(/Installation Admin cannot be blocked/);
    expect((await named.signIn()).data.session).not.toBeNull();
  });

  it("makes no blocked User an Installation Admin, and the database refuses someone who is no admin", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const a = await account(ben);
    await blockUser(admin.actor, a.userId);
    const add = async (actor: string) => (await db().rpc("add_installation_admin", { p_actor: actor, p_actor_on_server: false, p_person: ben })).data;
    expect(await add(admin.actor.personId)).toBe("blocked");
    expect(await add(sara)).toBe("forbidden");
    await unblockUser(admin.actor, a.userId);
    cleanups.unshift(async () => { await db().from("installation_admins").delete().eq("person_id", ben); });
    expect(await add(admin.actor.personId)).toBe("ok");
    expect(await add(admin.actor.personId)).toBe("exists");
  });

  it("refuses an id that is no User, and stops at the hourly number", async () => {
    await expect(blockUser(admin.actor, "not-an-id")).rejects.toThrow(/no such User/);
    await expect(blockUser(admin.actor, randomUUID())).rejects.toThrow(/no such User/);
    const busy = await installationAdmin(); cleanups.push(busy.cleanup);
    const a = await account(null);
    const { error } = await db().from("installation_audit_events").insert(Array.from({ length: ADMIN_ACTIONS_PER_HOUR }, () => ({ actor_id: busy.actor.personId, actor_name: "Busy", kind: "user.signed_out", subject: a.userId })));
    expect(error).toBeNull();
    await expect(blockUser(busy.actor, a.userId)).rejects.toThrow(/an hour/);
    expect((await a.signIn()).data.session).not.toBeNull();
  });
});

describe("what a block stops", () => {
  it("stops their keys, form links, replies, Calendar Link and messages, and unblocking brings them back", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const a = await account(ben);
    const m = await w.metric(sara);
    const code = await w.token(m.id, ben);
    const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Script", scopes: ["metrics:read"], expiresOn: inDays(30) });
    const { secret: calendar } = await makeCalendarLink(w.actor(ben, "member"));
    expect(await actorForKey(secret)).not.toBeNull();

    await blockUser(admin.actor, a.userId);
    expect(await actorForKey(secret)).toBeNull();
    expect(await submissionForm(code)).toBeNull();
    expect(await submitValue({ source: "web_form", sender: code, text: "7" })).toMatchObject({ ok: false, detail: "This account is blocked, so nothing was recorded." });
    expect((await db().from("observations").select("id").eq("metric_id", m.id)).data).toEqual([]);
    expect(await fetchCalendar(calendar, "https://ziffr.example")).toEqual({ status: "not_found" });
    expect(await initialDeliveryState("email", w.id, ben)).toBe("outbox");
    expect(await sendingHeldBack(w.id, ben)).toBe(BLOCKED_HOLDS_BACK.blocked);
    const answers: string[] = [];
    expect(await routeReply({ id: 0, workspace_id: w.id, recipient_id: ben, kind: "question", action_id: null, prompt_id: null } as never, "7", { source: "mail", sender: a.email, answer: async (s: string) => { answers.push(s); } })).toBe("refused");
    expect(answers).toEqual([]);
    // Their colleague is untouched.
    expect(await sendingHeldBack(w.id, sara)).toBeNull();

    await unblockUser(admin.actor, a.userId);
    expect(await actorForKey(secret)).not.toBeNull();
    expect(await submissionForm(code)).not.toBeNull();
    expect((await submitValue({ source: "web_form", sender: code, text: "7" })).ok).toBe(true);
  });
});

describe("Workspaces", () => {
  it("lists kind, Owners, limit and counts, and nothing the Workspace holds", async () => {
    const mark = randomUUID().slice(0, 12);
    const w = await ws(`Panel ${mark}`); const sara = await w.person("owner", { email: `owner-${mark}@example.test` }); await w.person("member");
    await w.metric(sara, { name: "Secretname revenue" });
    await w.limit(25, "Team");
    const found = await installationWorkspaces(admin.actor, { search: mark.toUpperCase() });
    expect(found.total).toBe(1);
    expect(found.rows[0]).toMatchObject({ workspaceId: w.id, name: `Panel ${mark}`, kind: "workspace", people: 2, metrics: 1, dashboards: 0, limit: 25, label: "Team", own: true, trialEndsAt: null, daysLeft: null, extendable: false, owners: [{ email: `owner-${mark}@example.test` }] });
    expect(JSON.stringify(found)).not.toContain("Secretname");
    expect((await installationWorkspaces(admin.actor, { search: `owner-${mark}` })).rows.map((r) => r.workspaceId)).toEqual([w.id]);
  });

  it("lists no Practice Workspace and not the demo", async () => {
    const mark = randomUUID().slice(0, 12);
    const w = await workspace(`Practice ${mark}`, { practice: true }); cleanups.push(w.cleanup);
    expect((await installationWorkspaces(admin.actor, { search: mark })).rows).toEqual([]);
    await expect(extendTrial(admin.actor, w.id, 3)).rejects.toThrow(Forbidden);
    await expect(extendTrial(admin.actor, "d3e00000-0000-4000-8000-000000000001", 3)).rejects.toThrow(Forbidden);
  });

  it("gives a running trial more days: reminders again, shortened keys longer, and both audits", async () => {
    const mark = randomUUID().slice(0, 12);
    const w = await ws(`Trial ${mark}`); const sara = await w.person("owner");
    await w.trial(new Date(Date.now() + 3 * 86_400_000).toISOString());
    await db().from("workspaces").update({ trial_reminded_3_at: new Date().toISOString() }).eq("id", w.id);
    const { id: keyId } = await createAccessKey(w.actor(sara), { name: "Script", scopes: ["metrics:read"], expiresOn: inDays(60) });
    const before = (await db().from("access_keys").select("expires_on").eq("id", keyId).single()).data!.expires_on;
    expect(before).toBe(inDays(3));
    expect((await installationWorkspaces(admin.actor, { search: mark })).rows[0]).toMatchObject({ kind: "trial", daysLeft: 3, extendable: true });

    const { endsAt } = await extendTrial(admin.actor, w.id, "10");
    expect(endsAt.slice(0, 10)).toBe(inDays(13));
    const { data: after } = await db().from("workspaces").select("trial_reminded_3_at").eq("id", w.id).single();
    expect(after!.trial_reminded_3_at).toBeNull();
    expect((await db().from("access_keys").select("expires_on").eq("id", keyId).single()).data!.expires_on).toBe(inDays(13));
    expect(await auditRowsOf(w.id, "workspace.trial_extended")).toHaveLength(1);
    expect((await installationEvents(admin.actor, 5))[0]).toMatchObject({ kind: "workspace.trial_extended", subject: w.id });
  });

  it("never past the longest a trial may last, and never a trial that ended or a Workspace that is none", async () => {
    const w = await ws(); await w.person("owner");
    await expect(extendTrial(admin.actor, w.id, 3)).rejects.toThrow(/still running/);
    await w.trial(new Date(Date.now() + 10 * 86_400_000).toISOString());
    await expect(extendTrial(admin.actor, w.id, TRIAL_EXTEND_MAX_DAYS)).rejects.toThrow(/at most/);
    await expect(extendTrial(admin.actor, w.id, 0)).rejects.toThrow(/whole number/);
    await expect(extendTrial(admin.actor, w.id, "2.5")).rejects.toThrow(/whole number/);
    await w.trial(new Date(Date.now() - 3_600_000).toISOString());
    await expect(extendTrial(admin.actor, w.id, 3)).rejects.toThrow(/still running/);
    expect(await auditRowsOf(w.id, "workspace.trial_extended")).toEqual([]);
  });
});

describe("Health", () => {
  it("counts failed messages by channel and names nobody", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const failedEmail = async () => (await installationHealth(admin.actor)).failed.find((f) => f.channel === "email")?.day ?? 0;
    const before = await failedEmail();
    const { error } = await db().from("deliveries").insert({ workspace_id: w.id, connector: "email", recipient_id: sara, kind: "reminder", subject: "Secretname", body: "Secretname", mail_state: "failed", last_attempt_at: new Date().toISOString() });
    expect(error).toBeNull();
    expect(await failedEmail()).toBe(before + 1);
    const health = await installationHealth(admin.actor);
    expect(health.jobs.map((j) => j.id)).toEqual(expect.arrayContaining(["workflows", "deliveries", "retention", "usage"]));
    expect(JSON.stringify(health)).not.toContain("Secretname");
  });
});
