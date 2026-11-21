// Share Proposals against the real database (ticket #538, GLOSSARY: Share Proposal): an assistant prepares a share and
// only the person confirms it, in the app. Covers the scopes, what can be proposed, the refusals (what the person may not
// share, expired, another Workspace, someone else confirming, a key confirming, the cap), the email only after confirming,
// and the Audit Log naming the connection. Mail goes to a stub transport, never to a real address.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Actor, ASSISTANT_SCOPES, Forbidden, KEY_ONLY_SCOPES, Refused, type KeyActor, type Scope } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { proposeShareWithKey } from "./api-share-proposals";
import { createDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import type { MailTransport } from "./mail";
import {
  confirmShareProposal, declineShareProposal, getShareProposal, listShareProposals, MAX_OPEN_PROPOSALS, previewFingerprint, previewShareProposal, PROPOSAL_EMAILS_PER_ADDRESS,
} from "./share-proposals";
import { DEMO_WORKSPACE_ID } from "./team";
import { auditRowsOf, changeRows, insertRow, rowsOf, workspace } from "./test/db-fixtures";

const SETTINGS = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const forbidden = expect.any(Forbidden);
const refused = expect.any(Refused);

/** What the confirm page would have shown, as its fingerprint. */
const seen = async (w: Awaited<ReturnType<typeof ws>>, person: string, id: number) => previewFingerprint(await previewShareProposal(w.actor(person), id));

/** A stub transport that keeps what would have been sent. */
function outbox() {
  const sent: { to: string; subject: string; text: string }[] = [];
  const transport: MailTransport = async (m) => { sent.push({ to: m.to, subject: m.subject, text: m.text }); return { messageId: "stub" }; };
  return { sent, transport };
}

async function setup(scopes: Scope[] = ["shares:propose", "dashboards:read"], kind: "assistant" | "program" = "program") {
  const w = await ws("Acme"); const sara = await w.person("owner"); const ben = await w.person("member");
  const m = await w.metric(sara, { name: "Coffee" });
  const dash = await createDashboard(w.actor(sara), "Coffee, last 4 weeks");
  await placeWidget(w.actor(sara), dash, { type: "metric", id: m.id });
  const { id, secret } = await createAccessKey(w.actor(sara), { name: "Claude.ai", scopes, expiresOn: inDays(30) });
  const key = (await actorForKey(secret)) as KeyActor;
  return { w, sara, ben, m, dash, keyId: id, key, kind };
}
const viewLink = (dash: number, over: Record<string, unknown> = {}) => ({ dashboard: dash, email: "jenny@example.test", ends: inDays(14), message: "Here are the numbers.", ...over });

describe("proposing", () => {
  it("prepares a View Link and shares nothing, sends nothing and makes no link", async () => {
    const { w, sara, dash, key, keyId } = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash));
    expect(p).toMatchObject({ status: "open", how: "view_link", recipient: "jenny@example.test", message: "Here are the numbers.", live: false, dashboard: { id: dash, name: "Coffee, last 4 weeks" } });
    expect(p.url).toBe(`https://ziffr.example.test/actions/share/${p.id}`);
    expect(p.preview.name).toBe("Coffee, last 4 weeks");
    expect(await rowsOf("view_links", { workspace_id: w.id })).toEqual([]);
    expect((await listShareProposals(w.actor(sara))).map((x) => x.id)).toEqual([p.id]);
    const [event] = await auditRowsOf(w.id, "share_proposal.proposed");
    expect(event).toMatchObject({ access_key_id: keyId, details: { proposal_id: p.id, how: "view_link" } });
    expect(JSON.stringify(event)).not.toContain("jenny");
    expect(JSON.stringify(event)).not.toContain("numbers");
  });
  it("needs shares:propose and dashboards:read, and an Assistant's connection may hold the first", async () => {
    const a = await setup(["dashboards:read"]);
    await expect(proposeShareWithKey(a.key, viewLink(a.dash))).rejects.toEqual(forbidden);
    const b = await setup(["shares:propose"]);
    await expect(proposeShareWithKey(b.key, viewLink(b.dash))).rejects.toEqual(forbidden);
    // An assistant's connection may hold it (it changes nobody's access), and still none of the scopes that do.
    expect(ASSISTANT_SCOPES).toContain("shares:propose");
    expect(KEY_ONLY_SCOPES).not.toContain("shares:propose");
    expect(ASSISTANT_SCOPES).not.toContain("shares:write");
  });
  it("refuses what the person may not share: another person's dashboard, a Guest, a missing dashboard", async () => {
    const { w, sara, ben, dash, key } = await setup();
    await w.person("owner");
    const bens = await createDashboard(w.actor(ben, "member"), "Bens");
    await expect(proposeShareWithKey(key, viewLink(bens))).rejects.toEqual(forbidden);
    await expect(proposeShareWithKey(key, viewLink(999999999))).rejects.toEqual(forbidden);
    await w.setRole(sara, "guest");
    const guest = { ...key, role: "guest" as const };
    await expect(proposeShareWithKey(guest, viewLink(dash))).rejects.toEqual(forbidden);
  });
  it("refuses a dashboard of another Workspace", async () => {
    const a = await setup(); const b = await setup();
    await expect(proposeShareWithKey(a.key, viewLink(b.dash))).rejects.toEqual(forbidden);
  });
  it("refuses bad input in words: address, end date, message, mixed ways, a Share with a message", async () => {
    const { dash, key, ben } = await setup();
    await expect(proposeShareWithKey(key, viewLink(dash, { email: "not an address" }))).rejects.toEqual(refused);
    await expect(proposeShareWithKey(key, viewLink(dash, { ends: inDays(400) }))).rejects.toEqual(refused);
    await expect(proposeShareWithKey(key, viewLink(dash, { ends: inDays(-1) }))).rejects.toEqual(refused);
    await expect(proposeShareWithKey(key, viewLink(dash, { message: "x".repeat(501) }))).rejects.toEqual(refused);
    await expect(proposeShareWithKey(key, { dashboard: dash })).rejects.toEqual(refused);
    await expect(proposeShareWithKey(key, { ...viewLink(dash), person: ben })).rejects.toEqual(refused);
    await expect(proposeShareWithKey(key, { dashboard: dash, person: ben, message: "hi" })).rejects.toEqual(refused);
    await expect(proposeShareWithKey(key, viewLink(dash, { snapshot: 999999 }))).rejects.toEqual(refused);
  });
  it("refuses a Share to someone outside the Workspace, to oneself, or to a Group of another Workspace", async () => {
    const a = await setup(); const b = await setup();
    await expect(proposeShareWithKey(a.key, { dashboard: a.dash, person: b.ben })).rejects.toEqual(forbidden);
    await expect(proposeShareWithKey(a.key, { dashboard: a.dash, person: a.sara })).rejects.toEqual(forbidden);
    const { data: g } = await db().from("groups").insert({ workspace_id: b.w.id, name: "Others" }).select("id").single();
    await expect(proposeShareWithKey(a.key, { dashboard: a.dash, group: g!.id })).rejects.toEqual(forbidden);
  });
  it("refuses the demo and a Trial Workspace's emails", async () => {
    const { createShareProposal } = await import("./share-proposals");
    await expect(createShareProposal({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, 1, { dashboard: 1, email: "a@example.test", ends: inDays(3) })).rejects.toThrow();
  });
  it("allows at most the cap of open proposals", async () => {
    const { w, sara, dash, key } = await setup();
    for (let i = 0; i < MAX_OPEN_PROPOSALS; i++) await proposeShareWithKey(key, viewLink(dash, { email: `p${i}@example.test` }));
    await expect(proposeShareWithKey(key, viewLink(dash))).rejects.toEqual(refused);
    // Declining one makes room.
    const [first] = await listShareProposals(w.actor(sara));
    await declineShareProposal(w.actor(sara), first.id);
    await proposeShareWithKey(key, viewLink(dash));
  });
});

describe("confirming a View Link", () => {
  it("makes the link through the core, emails the recipient only now, and names the connection in the Audit Log", async () => {
    const { w, sara, dash, key } = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash, { message: "Hi Jenny,\nthe coffee numbers." }));
    const mail = outbox();
    expect(mail.sent).toEqual([]);
    const done = await confirmShareProposal(w.actor(sara), p.id, await seen(w, sara, p.id), mail.transport);
    expect(done).toMatchObject({ kind: "view_link", emailState: "sent", linkPath: expect.stringMatching(/^\/v\/[A-Za-z0-9_-]{20,}$/) });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "jenny@example.test", subject: "Numbers were shared with you on Ziffr" });
    expect(mail.sent[0].text).toContain(`https://ziffr.example.test${done.linkPath}`);
    expect(mail.sent[0].text).toContain("> the coffee numbers.");
    expect(mail.sent[0].text).toContain("written by the sender");
    const links = await rowsOf("view_links", { workspace_id: w.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ object_id: dash, created_by: sara });
    expect((await getShareProposal(w.actor(sara), p.id))).toMatchObject({ status: "confirmed", emailState: "sent" });
    const [event] = await auditRowsOf(w.id, "share_proposal.confirmed");
    expect(event.details).toMatchObject({ proposal_id: p.id, how: "view_link", email: "sent", proposed_through: "Claude.ai" });
    expect(await auditRowsOf(w.id, "view_link.created")).toHaveLength(1);
  });
  it("keeps the numbers live only when asked, and notes a failed email with the link still made", async () => {
    const { w, sara, dash, key } = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash, { live: true }));
    expect(p.live).toBe(true);
    const failing: MailTransport = async () => { throw new Error("down"); };
    expect(await confirmShareProposal(w.actor(sara), p.id, await seen(w, sara, p.id), failing)).toMatchObject({ emailState: "failed", linkPath: expect.any(String) });
    expect((await rowsOf("view_links", { workspace_id: w.id }))[0]).toMatchObject({ frozen: null });
  });
  it("previews what the recipient sees, only for the person", async () => {
    const { w, sara, ben, dash, key, m } = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash));
    const view = await previewShareProposal(w.actor(sara), p.id);
    expect(view).toMatchObject({ type: "dashboard", id: dash, name: "Coffee, last 4 weeks" });
    expect(view?.data.metrics.map((x) => x.id)).toEqual([m.id]);
    expect(await previewShareProposal(w.actor(ben, "member"), p.id)).toBeNull();
  });
  it("refuses a second confirmation and a confirmation after a decline", async () => {
    const { w, sara, dash, key } = await setup();
    const a = await proposeShareWithKey(key, viewLink(dash)); const b = await proposeShareWithKey(key, viewLink(dash));
    const mail = outbox();
    await confirmShareProposal(w.actor(sara), a.id, await seen(w, sara, a.id), mail.transport);
    await expect(confirmShareProposal(w.actor(sara), a.id, await seen(w, sara, a.id), mail.transport)).rejects.toEqual(refused);
    const before = await seen(w, sara, b.id);
    await declineShareProposal(w.actor(sara), b.id);
    await expect(confirmShareProposal(w.actor(sara), b.id, before, mail.transport)).rejects.toEqual(refused);
    expect(mail.sent).toHaveLength(1);
    expect(await auditRowsOf(w.id, "share_proposal.declined")).toHaveLength(1);
  });
  it("refuses once it has expired, and lists none that expired", async () => {
    const { w, sara, dash, key } = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash));
    await changeRows("share_proposals", { id: p.id }, { expires_at: new Date(Date.now() - 1000).toISOString() });
    const mail = outbox();
    await expect(confirmShareProposal(w.actor(sara), p.id, await seen(w, sara, p.id), mail.transport)).rejects.toEqual(refused);
    await expect(declineShareProposal(w.actor(sara), p.id)).rejects.toEqual(refused);
    expect(await listShareProposals(w.actor(sara))).toEqual([]);
    expect(await getShareProposal(w.actor(sara), p.id)).toMatchObject({ status: "expired" });
    expect(mail.sent).toEqual([]);
    expect(await rowsOf("view_links", { workspace_id: w.id })).toEqual([]);
  });
  it("is confirmed by the proposer alone: not by someone else, not from another Workspace, not through a key", async () => {
    const { w, sara, ben, dash, key, keyId } = await setup();
    const other = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash));
    const mail = outbox();
    await expect(confirmShareProposal(w.actor(ben, "member"), p.id, "", mail.transport)).rejects.toEqual(forbidden);
    await expect(confirmShareProposal(w.actor(w.id === other.w.id ? sara : other.sara), p.id, "", mail.transport)).rejects.toEqual(forbidden);
    await expect(declineShareProposal(w.actor(ben, "member"), p.id)).rejects.toEqual(forbidden);
    // The key itself, as an Actor carrying its key, is refused whatever it holds.
    const asKey = { ...w.actor(sara), key: { id: String(keyId), scopes: ["shares:propose", "dashboards:read", "shares:write", "view-links:write"] } } as unknown as Actor;
    await expect(confirmShareProposal(asKey, p.id, "", mail.transport)).rejects.toEqual(forbidden);
    await expect(declineShareProposal(asKey, p.id)).rejects.toEqual(forbidden);
    expect(await getShareProposal(w.actor(ben, "member"), p.id)).toBeNull();
    expect(mail.sent).toEqual([]);
    expect(await rowsOf("view_links", { workspace_id: w.id })).toEqual([]);
    expect((await getShareProposal(w.actor(sara), p.id))?.status).toBe("open");
  });
  it("checks again at confirmation: a dashboard that changed hands makes nothing and stays open", async () => {
    const { w, sara, ben, dash, key } = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash));
    const before = await seen(w, sara, p.id);
    await changeRows("dashboards", { id: dash }, { owner_id: ben });
    const mail = outbox();
    await expect(confirmShareProposal(w.actor(sara), p.id, before, mail.transport)).rejects.toEqual(forbidden);
    expect((await getShareProposal(w.actor(sara), p.id))?.status).toBe("open");
    expect(mail.sent).toEqual([]);
  });
  it("limits links to one address in a day", async () => {
    const { w, sara, dash, key } = await setup();
    const mail = outbox();
    const day = { workspace_id: w.id, proposer_id: sara, kind: "view_link", dashboard_id: dash, recipient_email: "Jenny+x@Example.test", recipient_key: "jenny@example.test", ends_on: inDays(5), status: "confirmed", decided_at: new Date().toISOString(), expires_at: inDays(5) };
    for (let i = 0; i < PROPOSAL_EMAILS_PER_ADDRESS; i++) await insertRow("share_proposals", day);
    const extra = await proposeShareWithKey(key, viewLink(dash, { email: "jenny@example.test" }));
    await expect(confirmShareProposal(w.actor(sara), extra.id, await seen(w, sara, extra.id), mail.transport)).rejects.toEqual(refused);
    expect(mail.sent).toEqual([]);
  });
  it("refuses without email set up and leaves the proposal open", async () => {
    const { w, sara, dash, key } = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash));
    const smtp = process.env.ZIFFR_SMTP_URL; delete process.env.ZIFFR_SMTP_URL;
    try { await expect(confirmShareProposal(w.actor(sara), p.id, await seen(w, sara, p.id), outbox().transport)).rejects.toEqual(refused); } finally { process.env.ZIFFR_SMTP_URL = smtp; }
    expect((await getShareProposal(w.actor(sara), p.id))?.status).toBe("open");
  });
});

describe("confirming a Share", () => {
  it("gives a Viewer Share to a person, and to a Group, through the core", async () => {
    const { w, sara, ben, dash, key } = await setup();
    const p = await proposeShareWithKey(key, { dashboard: dash, person: ben });
    expect(p).toMatchObject({ how: "share", ends: null });
    const done = await confirmShareProposal(w.actor(sara), p.id, "");
    expect(done).toEqual({ kind: "share", emailState: null, linkPath: null });
    expect(await rowsOf("shares", { workspace_id: w.id, object_id: dash, user_id: ben })).toMatchObject([{ role: "viewer" }]);
    const { data: g } = await db().from("groups").insert({ workspace_id: w.id, name: "Sales" }).select("id").single();
    const q = await proposeShareWithKey(key, { dashboard: dash, group: g!.id });
    expect(q.recipient).toBe("Sales");
    await confirmShareProposal(w.actor(sara), q.id, "");
    expect(await rowsOf("shares", { workspace_id: w.id, object_id: dash, group_id: g!.id })).toMatchObject([{ role: "viewer" }]);
    expect(await auditRowsOf(w.id, "share_proposal.confirmed")).toHaveLength(2);
  });
  it("makes no Share when the person has left the Workspace by confirmation", async () => {
    const { w, sara, ben, dash, key } = await setup();
    const p = await proposeShareWithKey(key, { dashboard: dash, person: ben });
    await w.dropMember(ben);
    await expect(confirmShareProposal(w.actor(sara), p.id, "")).rejects.toEqual(forbidden);
    expect(await rowsOf("shares", { workspace_id: w.id, user_id: ben })).toEqual([]);
    expect((await getShareProposal(w.actor(sara), p.id))?.status).toBe("open");
  });

});

describe("what the person confirms is what goes out, and what only an assistant could cause", () => {
  it("refuses a View Link when the dashboard gained a widget after the preview was drawn", async () => {
    const { w, sara, dash, key } = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash));
    const before = await seen(w, sara, p.id);
    const extra = await w.metric(sara, { name: "Payroll" });
    await placeWidget(w.actor(sara), dash, { type: "metric", id: extra.id });
    const mail = outbox();
    await expect(confirmShareProposal(w.actor(sara), p.id, before, mail.transport)).rejects.toEqual(refused);
    await expect(confirmShareProposal(w.actor(sara), p.id, "", mail.transport)).rejects.toEqual(refused);
    expect(mail.sent).toEqual([]);
    expect(await rowsOf("view_links", { workspace_id: w.id })).toEqual([]);
    // Looking again shows the new widget, and then it can be confirmed.
    await confirmShareProposal(w.actor(sara), p.id, await seen(w, sara, p.id), mail.transport);
    expect(mail.sent).toHaveLength(1);
  });
  it("does not replace someone's existing access, when proposing or when confirming", async () => {
    const { w, sara, ben, dash, key } = await setup();
    await insertRow("shares", { workspace_id: w.id, object_type: "dashboard", object_id: dash, user_id: ben, role: "editor" });
    await expect(proposeShareWithKey(key, { dashboard: dash, person: ben })).rejects.toEqual(refused);
    const gone = await setup();
    const p = await proposeShareWithKey(gone.key, { dashboard: gone.dash, person: gone.ben });
    await insertRow("shares", { workspace_id: gone.w.id, object_type: "dashboard", object_id: gone.dash, user_id: gone.ben, role: "editor" });
    await expect(confirmShareProposal(gone.w.actor(gone.sara), p.id, "")).rejects.toEqual(refused);
    expect(await rowsOf("shares", { workspace_id: gone.w.id, user_id: gone.ben })).toMatchObject([{ role: "editor" }]);
    void sara;
  });
  it("cannot be confirmed once the assistant that prepared it is disconnected", async () => {
    const { w, sara, dash, key, keyId } = await setup();
    const p = await proposeShareWithKey(key, viewLink(dash));
    const before = await seen(w, sara, p.id);
    await changeRows("access_keys", { id: keyId }, { revoked_at: new Date().toISOString() });
    const mail = outbox();
    await expect(confirmShareProposal(w.actor(sara), p.id, before, mail.transport)).rejects.toEqual(refused);
    expect(mail.sent).toEqual([]);
    await declineShareProposal(w.actor(sara), p.id);
  });
  it("keeps the database's cap when proposals arrive at the same moment", async () => {
    const { w, sara, dash, key } = await setup();
    const results = await Promise.allSettled(Array.from({ length: MAX_OPEN_PROPOSALS + 6 }, (_, i) => proposeShareWithKey(key, viewLink(dash, { email: `q${i}@example.test` }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(MAX_OPEN_PROPOSALS);
    expect((await listShareProposals(w.actor(sara)))).toHaveLength(MAX_OPEN_PROPOSALS);
  });
  it("labels the View Link without the address, and counts an address in every Workspace", async () => {
    const a = await setup(); const b = await setup();
    const mail = outbox();
    const day = (x: Awaited<ReturnType<typeof setup>>) => ({ workspace_id: x.w.id, proposer_id: x.sara, kind: "view_link", dashboard_id: x.dash, recipient_email: "jenny@example.test", recipient_key: "jenny@example.test", ends_on: inDays(5), status: "confirmed", decided_at: new Date().toISOString(), expires_at: inDays(5) });
    for (let i = 0; i < PROPOSAL_EMAILS_PER_ADDRESS; i++) await insertRow("share_proposals", day(a));
    const p = await proposeShareWithKey(b.key, viewLink(b.dash));
    await expect(confirmShareProposal(b.w.actor(b.sara), p.id, await seen(b.w, b.sara, p.id), mail.transport)).rejects.toEqual(refused);
    const c = await setup();
    const q = await proposeShareWithKey(c.key, viewLink(c.dash, { email: "someone@example.test" }));
    await confirmShareProposal(c.w.actor(c.sara), q.id, await seen(c.w, c.sara, q.id), mail.transport);
    const [link] = await rowsOf("view_links", { workspace_id: c.w.id });
    expect(String(link.label)).not.toContain("someone");
  });
});
