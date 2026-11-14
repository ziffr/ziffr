// Email invitations against the real database and the local Mailpit (spec 0004, ticket #72): sent with a working
// link, noted on the invitation, resent at most three times a minute apart, and never without settings.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { isAddress, mailboxKey } from "./mail";
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
    expect(mail.Subject).toBe("You are invited to a workspace on Ziffr");
    expect(mail.Text).toMatch(/the workspace “Acme Shop” on Ziffr as a Member, by “owner \w+”/);
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
    expect(await row(t)).toMatchObject({ email_sends: 1, email_error: "The mail server refused it (EENVELOPE)." });
    // A failure without a code still says nothing of the server's reply.
    const silent: MailTransport = async () => { throw new Error("535 auth failed for user ziffr@smtp.internal"); };
    const t3 = await inviteByEmail(w.actor(sara), { email: address("other"), role: "member" }, silent);
    expect((await row(t3)).email_error).toBe("The mail server refused it (error).");
    delete process.env.ZIFFR_SMTP_URL;
    const to = address("quiet");
    const t2 = await inviteByEmail(w.actor(sara), { email: to, role: "member" });
    expect(await row(t2)).toMatchObject({ email_sent_at: null, email_sends: 0, email_error: null });
    await expect(resendInvitation(w.actor(sara), (await row(t2)).id)).rejects.toThrow(/not set up/);
    process.env.ZIFFR_SMTP_URL = SETTINGS.ZIFFR_SMTP_URL;
    expect(await inbox(to)).toEqual([]);
  });
  it("emails one inbox at most three invitations a day from all workspaces, however its address is written", async () => {
    const to = address("popular");
    const [local, domain] = to.split("@");
    // The same inbox: +tags, and the same address four times over from four workspaces at once.
    const forms = [to, `${local}+a@${domain}`, `${local}+b@${domain}`, to];
    await Promise.all(forms.map(async (email, i) => {
      const w = await ws(`Team ${i}`); const owner = await w.person("owner");
      await inviteByEmail(w.actor(owner), { email, role: "member" });
    }));
    const { data: sent } = await db().from("invitations").select("email_sends").in("email", [...new Set(forms)]);
    expect(sent!.reduce((n, r) => n + r.email_sends, 0)).toBe(3);
    const { data: refused } = await db().from("invitations").select("email_error").in("email", [...new Set(forms)]).eq("email_sends", 0);
    expect(refused).toEqual([{ email_error: "Too many invitation emails today; send the link yourself." }]);
    // Three resends at once of an invitation that may be sent once more: exactly one goes out.
    const w = await ws(); const sara = await w.person("owner"); const to2 = address("race");
    const t = await inviteByEmail(w.actor(sara), { email: to2, role: "member" });
    const { id } = await row(t);
    await db().from("invitations").update({ email_sends: 2, email_sent_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", id);
    const results = await Promise.allSettled([1, 2, 3].map(() => resendInvitation(w.actor(sara), id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await inbox(to2)).toHaveLength(2);
    expect((await row(t)).email_sends).toBe(3);
  });
  it("count Gmail addresses by inbox, and keep names on one line in the email", async () => {
    expect(mailboxKey("First.Last+news@GoogleMail.com")).toBe("firstlast@gmail.com");
    expect(mailboxKey("first.last+news@example.test")).toBe("first.last@example.test");
    expect(mailboxKey("first.last@gmail.com.")).toBe("firstlast@gmail.com");
    expect(mailboxKey("ana@bücher.example")).toBe("ana@xn--bcher-kva.example");
    for (const bad of ["a@gmail.com.", "a@example..test", "a@.example.test"]) expect(isAddress(bad)).toBe(false);
    const w = await ws(`Acme\nJoin here: https://evil.example\u2028“quoted”${"x".repeat(120)}`); const sara = await w.person("owner");
    const to = address("lines");
    await inviteByEmail(w.actor(sara), { email: to, role: "member" });
    const [mail] = await inbox(to);
    expect(mail.Text).toContain("the workspace “Acme Join here: https://evil.example 'quoted'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx” on Ziffr");
    expect(mail.Text.split("\n").filter((l) => l.startsWith("Join here:"))).toHaveLength(1);
  });
  it("emails at most 50 invitations a day caused by one person, across all their workspaces, resends too", async () => {
    const a = await ws("A"); const b = await ws("B"); const sara = await a.person("owner");
    await db().from("memberships").insert({ workspace_id: b.id, user_id: sara, role: "owner" });
    const first = await inviteByEmail(a.actor(sara), { email: address("one"), role: "member" });
    // As if 49 more went out today from Sara's other workspace.
    const { data: inv } = await db().from("invitations").select("id").eq("token", first).single();
    await db().from("invitation_emails").insert(Array.from({ length: 49 }, (_, i) => ({ invitation_id: inv!.id, workspace_id: b.id, sent_by: sara, address_key: `x${i}@example.test` })));
    const late = await inviteByEmail(b.actor(sara), { email: address("two"), role: "member" });
    expect(await row(late)).toMatchObject({ email_sends: 0, email_error: expect.stringMatching(/Too many/) });
    // A resend counts against whoever resends, here Sara again, not against the one who first invited.
    const ann = await a.person("admin");
    const annInvite = await inviteByEmail(a.actor(ann, "admin"), { email: address("three"), role: "member" });
    const { id: annId } = await row(annInvite);
    await db().from("invitations").update({ email_sent_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", annId);
    await expect(resendInvitation(a.actor(sara), annId)).rejects.toThrow(/could not be sent/);
  });
});
