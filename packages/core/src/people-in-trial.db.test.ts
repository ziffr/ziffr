// People in a trial against the real database (spec 0040, ticket 3; ADR 0015): a trial invites colleagues by email within
// the Trial Limits: its people (ZF435), the invitation emails of a day for the trial and for all trials together and one
// open invitation per address (ZF436), and nothing before the Owner's first value (ZF439), all held when requests come
// at once. The Owner's view of usage is the Owner's and the Admins'.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { setCloudTrialLimits } from "./cloud-api";
import { db } from "./db";
import { acceptInvitation, createInviteLink, inviteByEmail, openInvitations, resendInvitation, revokeInvitation } from "./invitations";
import type { MailTransport } from "./mail";
import { forgetStoredSettings } from "./settings-in-effect";
import { resetTrialLimits, workspace } from "./test/db-fixtures";
import { reachedWords, trialUsage, usageLine } from "./trial-usage";

const caller = { cloud: true } as const;
const SETTINGS = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
const sent: string[] = [];
// Mail that goes nowhere: the claim in the database is what is tested, not delivery.
const transport: MailTransport = async (m) => { sent.push(String(m.to)); return { messageId: "test" }; };
const cleanups: (() => Promise<void>)[] = [];
beforeAll(async () => {
  for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; }
  saved.ZIFFR_CLOUD_KEY = process.env.ZIFFR_CLOUD_KEY;
  process.env.ZIFFR_CLOUD_KEY = "k".repeat(40);
  await resetTrialLimits();
});
afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  await resetTrialLimits();
  forgetStoredSettings();
});
beforeEach(async () => { sent.length = 0; await resetTrialLimits(); forgetStoredSettings(); });
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); await resetTrialLimits(); forgetStoredSettings(); });

const address = (who = "p") => `${who}-${randomUUID().slice(0, 8)}@example.test`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A Trial Workspace with its Owner, who has already recorded a value of their own unless `valued` is false. */
async function trial(valued = true) {
  const w = await workspace("Trial");
  cleanups.push(async () => { await db().from("invitation_emails").delete().eq("workspace_id", w.id); await w.cleanup(); });
  await w.trial(day(7));
  const owner = await w.person("owner");
  if (valued) { const m = await w.metric(owner); await w.value(m.id, "2026-11-01", 3, owner); }
  return { ...w, owner, actor: w.actor(owner), actorOf: w.actor };
}
/** A signed-in person who belongs to no Workspace yet, with the address an invitation is for. */
async function stranger(email: string) {
  const id = `t-${randomUUID()}`;
  cleanups.push(async () => { await db().from("profiles").delete().eq("id", id); });
  const { error } = await db().from("profiles").insert({ id, name: "Guest", role: "", color: "#000", email });
  if (error) throw new Error(error.message);
  return { personId: id, verifiedEmail: email };
}
const invite = (t: Awaited<ReturnType<typeof trial>>, email = address(), role: "member" | "admin" | "guest" = "member") => inviteByEmail(t.actor, { email, role }, transport);
const fulfilled = (r: PromiseSettledResult<unknown>[]) => r.filter((x) => x.status === "fulfilled").length;
const messages = (r: PromiseSettledResult<unknown>[]) => r.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => String(x.reason.message));

describe("the first-value gate", () => {
  it("opens invitations only after the Owner has recorded a value of their own", async () => {
    const t = await trial(false);
    await expect(invite(t)).rejects.toThrow(/Invitations open once the Owner has recorded a first value/);
    // A value that came in through a Feed or an Import is not the Owner's own.
    const m = await t.metric(t.owner);
    const other = await t.person("member");
    await t.value(m.id, "2026-10-01", 1, other);
    await db().from("observations").insert({ metric_id: m.id, period_start: "2026-09-01", value: 1, submitter_id: t.owner, source: "import", imported: true, workspace_id: t.id });
    await expect(invite(t)).rejects.toThrow(/Invitations open once/);
    await t.value(m.id, "2026-11-01", 3, t.owner);
    expect((await invite(t)).emailed).toBe(true);
  });
  it("is the database's: a direct insert is refused too, with ZF439", async () => {
    const t = await trial(false);
    const { error } = await db().from("invitations").insert({ workspace_id: t.id, token: randomUUID().replace(/-/g, "") + "ab", email: address(), role: "member", created_by: t.owner, expires_at: new Date(Date.now() + 86_400_000).toISOString() });
    expect(error?.code).toBe("ZF439");
  });
});

describe("the people limit", () => {
  it("counts the Owner, members and open invitations: the sixth person is refused with ZF435", async () => {
    const t = await trial();
    for (let i = 0; i < 4; i++) await invite(t);
    await expect(invite(t)).rejects.toThrow(/at most 5 people/);
    // Revoking one makes room again; an expired one counts for nothing.
    const [first, second] = await openInvitations(t.actor);
    await revokeInvitation(t.actor, first.id);
    await invite(t);
    await db().from("invitations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", second.id);
    await invite(t);
    const { error } = await db().from("memberships").insert({ workspace_id: t.id, user_id: (await stranger(address())).personId, role: "member" });
    expect(error?.code).toBe("ZF435");
  });
  it("holds when ten invitations are made at once", async () => {
    const t = await trial();
    const r = await Promise.allSettled(Array.from({ length: 10 }, () => invite(t)));
    expect(fulfilled(r)).toBe(4);
    expect(messages(r).every((m) => /at most 5 people/.test(m))).toBe(true);
    expect((await openInvitations(t.actor))).toHaveLength(4);
  });
  it("holds when invitations are accepted while others are made", async () => {
    const t = await trial();
    const first = await Promise.all(Array.from({ length: 4 }, async () => { const email = address(); return { email, made: await invite(t, email) }; }));
    // Everyone accepts at once, and the Owner tries to invite meanwhile: never more than five people in all (an invitation made in the gap
    // between a claim and its join may leave one joiner out: the limit is for people, and it holds).
    const people = await Promise.all(first.map((f) => stranger(f.email)));
    await Promise.allSettled([...first.map((f, i) => acceptInvitation(people[i], f.made.token)), invite(t), invite(t)]);
    const { count } = await db().from("memberships").select("user_id", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(count).toBeLessThanOrEqual(5);
    expect(count).toBeGreaterThanOrEqual(4);
  });
  it("keeps the place of an invitation that was accepted but whose person has not joined yet", async () => {
    const t = await trial();
    const emails = [address(), address(), address(), address()];
    for (const e of emails) await invite(t, e);
    const joiner = await stranger(emails[0]);
    // The gap inside an accept: marked accepted, membership not inserted yet. Nobody else may take the place.
    await db().from("invitations").update({ accepted_at: new Date().toISOString(), accepted_by: joiner.personId }).eq("email", emails[0]);
    await expect(invite(t)).rejects.toThrow(/at most 5 people/);
    const { error } = await db().from("memberships").insert({ workspace_id: t.id, user_id: joiner.personId, role: "member" });
    expect(error).toBeNull();
  });
  it("takes a lowered limit without deleting anyone: a full trial refuses the next join", async () => {
    const t = await trial();
    const a = address(); const b = address();
    const ta = (await invite(t, a)).token; await invite(t, b);
    await setCloudTrialLimits(caller, { people: 2 });
    forgetStoredSettings();
    // Owner + the other open invitation already fill the two places: joining by the first is refused, and it works again later.
    const joiner = await stranger(a);
    await expect(acceptInvitation(joiner, ta)).rejects.toThrow(/as many people as it may/);
    expect((await openInvitations(t.actor)).map((i) => i.email).sort()).toEqual([a, b].sort());
    await setCloudTrialLimits(caller, { people: 3 });
    await expect(acceptInvitation(joiner, ta)).resolves.toBe(t.id);
  });
  it("applies only to trials: an ordinary Workspace holds as many people as it likes", async () => {
    const w = await workspace("Ordinary"); cleanups.push(w.cleanup);
    for (let i = 0; i < 8; i++) await w.person("member");
    const { count } = await db().from("memberships").select("user_id", { count: "exact", head: true }).eq("workspace_id", w.id);
    expect(count).toBe(8);
  });
});

describe("invitations by address", () => {
  it("allows one open invitation per address in a trial, however the address is written", async () => {
    const t = await trial();
    const to = address("same");
    const [local, domain] = to.split("@");
    await invite(t, to);
    await expect(invite(t, to)).rejects.toThrow(/open invitation already/);
    await expect(invite(t, `${local}+again@${domain}`)).rejects.toThrow(/open invitation already/);
    const r = await Promise.allSettled([invite(t, address("race") ), invite(t, address("race2"))]);
    expect(fulfilled(r)).toBe(2);
    // Once it is revoked the address may be invited again.
    const [open] = (await openInvitations(t.actor)).filter((i) => i.email === to);
    await revokeInvitation(t.actor, open.id);
    await invite(t, to);
  });
  it("holds when the same address is invited at once", async () => {
    const t = await trial();
    const to = address("twice");
    const r = await Promise.allSettled([1, 2, 3, 4].map(() => invite(t, to)));
    expect(fulfilled(r)).toBe(1);
    expect((await openInvitations(t.actor))).toHaveLength(1);
  });
});

describe("invitation emails a day", () => {
  it("sends at most ten for one trial and keeps the rest as links, never dropped", async () => {
    const t = await trial();
    await setCloudTrialLimits(caller, { people: 25 });
    forgetStoredSettings();
    const results: boolean[] = [];
    for (let i = 0; i < 12; i++) results.push((await invite(t)).emailed);
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(sent).toHaveLength(10);
    const open = await openInvitations(t.actor);
    expect(open).toHaveLength(12);
    expect(open.filter((i) => i.email_error?.startsWith("A trial sends at most 10 invitation emails a day"))).toHaveLength(2);
    // A resend is an email too: it does not pass the number either.
    await expect(resendInvitation(t.actor, open.find((i) => i.email_error)!.id)).rejects.toThrow();
    expect(sent).toHaveLength(10);
    // A day later the oldest sends are out of the window.
    await db().from("invitation_emails").update({ sent_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("workspace_id", t.id);
    const again = await openInvitations(t.actor);
    await db().from("invitations").update({ email_sent_at: null, email_sends: 0 }).eq("id", again.find((i) => i.email_error)!.id);
    await resendInvitation(t.actor, again.find((i) => i.email_error)!.id, transport);
    expect(sent).toHaveLength(11);
  });
  it("holds when twenty are sent at once", async () => {
    const t = await trial();
    await setCloudTrialLimits(caller, { people: 25 });
    forgetStoredSettings();
    const r = await Promise.all(Array.from({ length: 20 }, () => invite(t)));
    expect(r.filter((x) => x.emailed)).toHaveLength(10);
    const { count } = await db().from("invitation_emails").select("id", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(count).toBe(10);
  });
  it("holds for all trials together, also when they send at once", async () => {
    const [a, b, c] = await Promise.all([trial(), trial(), trial()]);
    const { count: already } = await db().from("invitation_emails").select("id", { count: "exact", head: true }).eq("in_trial", true).gt("sent_at", new Date(Date.now() - 86_400_000).toISOString());
    await setCloudTrialLimits(caller, { invitationsAllPerDay: (already ?? 0) + 4 });
    forgetStoredSettings();
    const r = await Promise.all([a, a, b, b, c, c].map((t) => invite(t)));
    expect(r.filter((x) => x.emailed)).toHaveLength(4);
    const errors = await Promise.all([a, b, c].map(async (t) => (await openInvitations(t.actor)).map((i) => i.email_error).filter(Boolean)));
    expect(errors.flat().every((e) => /not sending invitation emails for trials right now/.test(String(e)))).toBe(true);
    expect(errors.flat()).toHaveLength(2);
  });
  it("sends none when the limit is 0, and an ended trial invites nobody", async () => {
    const t = await trial();
    await setCloudTrialLimits(caller, { invitationsPerDay: 0 });
    forgetStoredSettings();
    expect((await invite(t)).emailed).toBe(false);
    expect(sent).toEqual([]);
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", t.id);
    await expect(invite(t)).rejects.toThrow(Forbidden);
  });
  it("leaves ordinary Workspaces to their own limits", async () => {
    const w = await workspace("Ordinary"); cleanups.push(async () => { await db().from("invitation_emails").delete().eq("workspace_id", w.id); await w.cleanup(); });
    const owner = await w.person("owner");
    for (let i = 0; i < 12; i++) expect((await inviteByEmail(w.actor(owner), { email: address(), role: "member" }, transport)).emailed).toBe(true);
    const { count } = await db().from("invitation_emails").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("in_trial", false);
    expect(count).toBe(12);
  });
});

describe("what a trial still refuses", () => {
  it("makes no invite link and takes no one by one", async () => {
    const t = await trial();
    await expect(createInviteLink(t.actor, "member")).rejects.toThrow(/invite people by email instead/);
  });
  it("lets an invited person in by the invitation for their address only", async () => {
    const t = await trial();
    const to = address("join");
    const { token } = await invite(t, to, "guest");
    await expect(acceptInvitation(await stranger(address("else")), token)).rejects.toThrow(/is for/);
    await expect(acceptInvitation(await stranger(to), token)).resolves.toBe(t.id);
    const { data } = await db().from("memberships").select("role").eq("workspace_id", t.id);
    expect(data!.map((m) => m.role).sort()).toEqual(["guest", "owner"]);
  });
});

describe("the Owner's view of usage", () => {
  it("shows the counts to the Owner and Admins only, and says what a reached limit means", async () => {
    const t = await trial();
    const admin = await t.person("admin");
    const member = await t.person("member");
    await invite(t); await invite(t);
    expect(await trialUsage(t.actorOf(member, "member"))).toBeNull();
    const rows = (await trialUsage(t.actor))!;
    expect(usageLine(rows)).toBe("5 of 5 people, 2 of 10 invitation emails today, 1 of 25 Metrics");
    expect((await trialUsage(t.actorOf(admin, "admin")))).toHaveLength(3);
    expect(reachedWords(rows[0])).toMatch(/holds as many people as it may \(5\)/);
    expect(reachedWords(rows[1])).toBeNull();
    // Fill the day: the words say when it resets.
    await setCloudTrialLimits(caller, { invitationsPerDay: 2 });
    forgetStoredSettings();
    const full = (await trialUsage(t.actor))!;
    expect(full[1].reached).toBe(true);
    expect(reachedWords(full[1])).toMatch(/all 2 invitation emails of today; more can go from \d\d:\d\d UTC/);
    // Outside a trial and after its end there is nothing to show.
    await db().from("workspaces").update({ trial_ends_at: null }).eq("id", t.id);
    expect(await trialUsage(t.actor)).toBeNull();
  });
});
