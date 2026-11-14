// Email invitations against the real database and the local Mailpit (spec 0004, ticket #72): sent with a working
// link, noted on the invitation, resent at most three times a minute apart, and never without settings.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { inviteByEmail, invitationFor, openInvitations, resendInvitation, revokeInvitation } from "./invitations";
import type { MailTransport } from "./mail";
import { workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
async function inbox(to: string) {
  const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string }[] };
  return Promise.all(messages.map(async (m) => (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json() as Promise<{ Subject: string; Text: string }>));
}
const row = async (token: string) => (await db().from("invitations").select("id, email_sent_at, email_sends, email_error").eq("token", token).single()).data!;

describe("email invitations", () => {
  it("emails the invitee a link that opens the invitation, and notes it on the invitation", async () => {
    const w = await ws("Acme Shop"); const sara = await w.person("owner");
    const to = address("new");
    const t = await inviteByEmail(w.actor(sara), { email: to, role: "member" });
    const [mail] = await inbox(to);
    expect(mail.Subject).toMatch(/invited you to Acme Shop on Ziffr/);
    expect(mail.Text).toContain(`https://ziffr.example.test/invite/${t}`);
    expect(mail.Text).toMatch(/as a Member/);
    expect(await invitationFor(t)).toEqual({ workspace: "Acme Shop", role: "member", forEmail: to, usable: true });
    expect(await row(t)).toMatchObject({ email_sent_at: expect.any(String), email_sends: 1, email_error: null });
    expect((await openInvitations(w.actor(sara)))[0]).toMatchObject({ email_sends: 1, email_error: null });
  });
  it("resends at most three times, a minute apart, only open invitations, and only for Owners and Admins", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const to = address("late");
    const t = await inviteByEmail(w.actor(sara), { email: to, role: "guest" });
    const { id } = await row(t);
    await expect(resendInvitation(w.actor(sara), id)).rejects.toThrow(/a moment ago/);
    const earlier = () => db().from("invitations").update({ email_sent_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", id);
    await earlier(); await resendInvitation(w.actor(sara), id);
    await earlier(); await resendInvitation(w.actor(sara), id);
    await earlier(); await expect(resendInvitation(w.actor(sara), id)).rejects.toThrow(/three times/);
    expect(await inbox(to)).toHaveLength(3);
    await expect(resendInvitation(w.actor(ben, "member"), id)).rejects.toEqual(expect.any(Forbidden));
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(resendInvitation(other.actor(zoe), id)).rejects.toEqual(expect.any(Forbidden));
    const t2 = await inviteByEmail(w.actor(sara), { email: address("gone"), role: "member" });
    await revokeInvitation(w.actor(sara), (await row(t2)).id);
    await earlier();
    await expect(resendInvitation(w.actor(sara), (await row(t2)).id)).rejects.toEqual(expect.any(Forbidden));
  });
  it("keeps the invitation when the email fails, says why, and sends nothing without settings", async () => {
    const w = await ws(); const sara = await w.person("owner");
    const broken: MailTransport = async () => { throw Object.assign(new Error("550 no such user"), { code: "EENVELOPE" }); };
    const t = await inviteByEmail(w.actor(sara), { email: address("bounce"), role: "member" }, broken);
    expect(await invitationFor(t)).toBeTruthy();
    expect(await row(t)).toMatchObject({ email_sent_at: null, email_sends: 1, email_error: "The mail server refused it (EENVELOPE)." });
    delete process.env.ZIFFR_SMTP_URL;
    const to = address("quiet");
    const t2 = await inviteByEmail(w.actor(sara), { email: to, role: "member" });
    expect(await row(t2)).toMatchObject({ email_sent_at: null, email_sends: 0, email_error: null });
    await expect(resendInvitation(w.actor(sara), (await row(t2)).id)).rejects.toThrow(/not set up/);
    process.env.ZIFFR_SMTP_URL = SETTINGS.ZIFFR_SMTP_URL;
    expect(await inbox(to)).toEqual([]);
  });
});
