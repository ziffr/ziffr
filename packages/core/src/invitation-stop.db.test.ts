// "Do not invite me again" and what an invited person is told (spec 0040, ticket 5), against the real database: the
// invitation email of a trial says it is a trial, until when and what follows, and carries a one-click stop link; using
// it stops invitation emails to that address from every Workspace and costs no limit; the accept page says the same; a
// trial's name for its Owner is what Members are shown.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { invitationFor, inviteByEmail, openInvitations } from "./invitations";
import { invitationStopTokenValid, stopInvitationsByToken } from "./invitation-stop";
import { mailboxKey, type MailTransport, type OutgoingMail } from "./mail";
import { workspace } from "./test/db-fixtures";
import { trialStatus } from "./trial-end";

const SETTINGS = { ZIFFR_SECRETS_KEY: Buffer.alloc(32, 9).toString("base64"), ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test", ZIFFR_CLOUD_KEY: "k".repeat(40) };
const saved: Record<string, string | undefined> = {};
const mails: OutgoingMail[] = [];
const transport: MailTransport = async (m) => { mails.push(m); return { messageId: "test" }; };
const cleanups: (() => Promise<void>)[] = [];
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
afterEach(async () => { mails.length = 0; for (const c of cleanups.splice(0)) await c(); });

const address = () => `stop-${randomUUID().slice(0, 8)}@example.test`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** A Workspace with its Owner, a trial ending in a week unless `trial` is false; a trial's Owner has recorded a value. */
async function ws(trial = true) {
  const w = await workspace("Stop test");
  cleanups.push(async () => { await db().from("invitation_emails").delete().eq("workspace_id", w.id); await w.cleanup(); });
  const owner = await w.person("owner");
  if (trial) { await w.trial(day(7)); const m = await w.metric(owner); await w.value(m.id, "2026-11-01", 3, owner); }
  return { ...w, owner, actor: w.actor(owner) };
}
const stopUrl = (m: OutgoingMail) => m.text.match(/https:\/\/ziffr\.example\.test\/api\/unsubscribe\/invitations\/([A-Za-z0-9_.-]+)/)?.[1] ?? null;
const forget = async (to: string) => { await db().from("invitation_stops").delete().eq("address_key", mailboxKey(to)); };

describe("the invitation email of a trial", () => {
  it("says it is a trial, until when and what follows, and carries the one-click stop", async () => {
    const w = await ws(); const to = address();
    const { token } = await inviteByEmail(w.actor, { email: to, role: "member" }, transport);
    const [mail] = mails;
    expect(mail.subject).toBe("You are invited to a trial of Ziffr");
    const end = new Date(day(7)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
    expect(mail.text).toMatch(new RegExp(`invited you to a trial of Ziffr that ends on ${end}\\. After that it either becomes a subscription or is closed and its data is deleted\\.`));
    expect(mail.text).toContain(`https://ziffr.example.test/invite/${token}`);
    expect(mail.text).toContain("Sent by Ziffr for ");
    expect(stopUrl(mail)).not.toBeNull();
    expect(mail.unsubscribe).toContain("/api/unsubscribe/invitations/");
    expect(mail.html ?? "").toContain("Do not invite me again");
    // The link is in the HTML once (as its own line), not twice.
    expect((mail.html ?? "").split("/api/unsubscribe/invitations/").length - 1).toBeLessThanOrEqual(2);
  });
  it("is the ordinary email, still with the stop link, in a Workspace that is not a trial", async () => {
    const w = await ws(false);
    await inviteByEmail(w.actor, { email: address(), role: "member" }, transport);
    expect(mails[0].subject).toBe("You are invited to a workspace on Ziffr");
    expect(mails[0].text).not.toMatch(/trial/i);
    expect(stopUrl(mails[0])).not.toBeNull();
  });
  it("is not sent, and the invitation keeps its link, where no key can sign the stop link", async () => {
    const w = await ws();
    const key = process.env.ZIFFR_SECRETS_KEY; delete process.env.ZIFFR_SECRETS_KEY; const job = process.env.ZIFFR_JOB_SECRET; delete process.env.ZIFFR_JOB_SECRET;
    try {
      const r = await inviteByEmail(w.actor, { email: address(), role: "member" }, transport);
      expect(r.emailed).toBe(false);
      expect(mails).toHaveLength(0);
      expect((await openInvitations(w.actor))[0]).toMatchObject({ email_sends: 0, email_error: expect.stringMatching(/send the link yourself/) });
    } finally { process.env.ZIFFR_SECRETS_KEY = key; if (job !== undefined) process.env.ZIFFR_JOB_SECRET = job; }
  });
});

describe("Do not invite me again", () => {
  it("stops invitation emails to that address from every Workspace, counts nothing against any limit, and keeps the invitation", async () => {
    const a = await ws(); const b = await ws(false); const to = address();
    await inviteByEmail(a.actor, { email: to, role: "member" }, transport);
    const token = stopUrl(mails[0])!;
    expect(invitationStopTokenValid(token)).toBe(true);
    expect(await stopInvitationsByToken(token)).toBe(true);
    expect(await stopInvitationsByToken(token)).toBe(true);
    mails.length = 0;
    // Another Workspace, and the same address written another way (case): no mail.
    const r = await inviteByEmail(b.actor, { email: to.toUpperCase(), role: "guest" }, transport);
    expect(r.emailed).toBe(false);
    expect(mails).toHaveLength(0);
    expect((await openInvitations(b.actor))[0]).toMatchObject({ email_sends: 0, email_error: expect.stringMatching(/does not get invitation emails/) });
    expect((await db().from("invitation_emails").select("id").eq("workspace_id", b.id)).data).toEqual([]);
    // Another address is not touched.
    await inviteByEmail(b.actor, { email: address(), role: "guest" }, transport);
    expect(mails).toHaveLength(1);
    await forget(to);
  });
  it("is refused for a token that was not signed here, and changes nothing", async () => {
    const before = (await db().from("invitation_stops").select("address_key")).data!.length;
    for (const bad of ["", "nope", "bmlhQGV4YW1wbGUudGVzdA." + "A".repeat(43), "a.b"]) expect(await stopInvitationsByToken(bad)).toBe(false);
    expect((await db().from("invitation_stops").select("address_key")).data!.length).toBe(before);
  });
  it("is a table the public keys cannot read", async () => {
    const { data: key } = await db().from("invitation_stops").select("address_key").limit(1);
    expect(Array.isArray(key)).toBe(true);
    const url = `${process.env.SUPABASE_URL}/rest/v1/invitation_stops?select=address_key`;
    const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anon) return;
    const res = await fetch(url, { headers: { apikey: anon, authorization: `Bearer ${anon}` } });
    const body = await res.json().catch(() => []);
    expect(Array.isArray(body) ? body : []).toEqual([]);
  });
});

describe("what the accept page and the bar say", () => {
  it("tells an invited person it is a trial, by whom, until when and what follows", async () => {
    const w = await ws(); const to = address();
    const { token } = await inviteByEmail(w.actor, { email: to, role: "member" }, transport);
    const info = await invitationFor(token);
    expect(info?.trial?.words).toMatch(/invited you to a trial of Ziffr that ends on \d+ \w+\. After that it either becomes a subscription or is closed and its data is deleted\./);
    expect(JSON.stringify(info)).not.toContain(w.owner);
  });
  it("says nothing of a trial for an ordinary Workspace, and nothing once the invitation is no longer usable", async () => {
    const w = await ws(false);
    const { token } = await inviteByEmail(w.actor, { email: address(), role: "member" }, transport);
    expect((await invitationFor(token))?.trial).toBeNull();
    const t = await ws();
    const { token: t2 } = await inviteByEmail(t.actor, { email: address(), role: "member" }, transport);
    await db().from("invitations").update({ revoked_at: new Date().toISOString() }).eq("token", t2);
    expect((await invitationFor(t2))?.trial).toBeNull();
  });
  it("gives the trial's status the Owner's name, for the Members' bar", async () => {
    const w = await ws();
    const { data } = await db().from("profiles").select("name").eq("id", w.owner).single();
    expect((await trialStatus(w.id))?.ownerName).toBe(data!.name);
    expect(await trialStatus((await ws(false)).id)).toBeNull();
  });
});
