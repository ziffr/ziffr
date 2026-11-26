// Practice Workspaces against the database (spec 0063; GLOSSARY: Practice Workspace, Made-up Person): the mark is set
// once; nobody else gets in; a message stays in the Outbox whoever tries to queue it; what would reach outside cannot be
// stored; the core refuses before the database has to; and an ordinary Workspace is as before.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cloudWorkspace } from "./cloud-api";
import { db } from "./db";
import { createInviteLink, inviteByEmail, setJoinDomain } from "./invitations";
import { sendMail, type OutgoingMail } from "./mail";
import { initialDeliveryState, sendAllWaiting } from "./outbound";
import { PRACTICE_HELD, PracticeRefused } from "./practice";
import { startSlackInstall, slackBot } from "./slack-connection";
import { addContact, DEMO_WORKSPACE_ID } from "./team";
import { telegramOnIn, setTelegramEnabled } from "./telegram-connection";
import { sendTestMessage } from "./test-message";
import { askForMissingValues } from "./questions";
import { workspace } from "./test/db-fixtures";

const SETTINGS = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test", ZIFFR_TELEGRAM_BOT_TOKEN: `123456:${"a".repeat(35)}` };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const c of cleanups.splice(0)) await c(); });

/** A Practice Workspace with its Owner, who has a real-looking address, a made-up Member and a Metric the Member sends. */
async function practice() {
  const w = await workspace("Practice", { practice: true }); cleanups.push(w.cleanup);
  const me = await w.person("owner", { id: w.practiceFor!, email: `admin-${randomUUID().slice(0, 8)}@example.test` });
  const ann = await w.madeUp("member");
  const metric = await w.metric(me, { name: "Visits" });
  await w.token(metric.id, ann);
  return { w, me, ann, metric };
}
const delivery = (workspaceId: string, recipient: string, mail_state: string, connector = "email") =>
  db().from("deliveries").insert({ workspace_id: workspaceId, connector, recipient_id: recipient, kind: "notice", subject: "Hello", body: "Hello", mail_state }).select("id, mail_state, last_error").single();
const code = (r: { error: { code?: string } | null }) => r.error?.code;

describe("the mark of a Practice Workspace", () => {
  it("is set when the Workspace is made and never added, changed or removed afterwards", async () => {
    const { w, me } = await practice();
    for (const practice_for of [null, "somebody-else"]) expect(code(await db().from("workspaces").update({ practice_for }).eq("id", w.id))).toBe("ZF4P0");
    const plain = await workspace("Plain"); cleanups.push(plain.cleanup);
    expect(code(await db().from("workspaces").update({ practice_for: me }).eq("id", plain.id))).toBe("ZF4P0");
    expect((await db().from("workspaces").select("practice_for").eq("id", w.id).single()).data?.practice_for).toBe(me);
  });
  it("goes to one Workspace per person, never a trial, one that joins by domain or the demo", async () => {
    const { me, w } = await practice();
    expect(code(await db().from("workspaces").insert({ name: "Second", practice_for: me }))).toBe("23505");
    expect(code(await db().from("workspaces").insert({ name: "Trial", practice_for: `t-${randomUUID()}`, trial_ends_at: new Date().toISOString() }))).toBe("23514");
    expect(code(await db().from("workspaces").update({ join_domain: "example.org" }).eq("id", w.id))).toBe("23514");
    expect((await db().from("workspaces").select("practice_for").eq("id", DEMO_WORKSPACE_ID).maybeSingle()).data?.practice_for ?? null).toBeNull();
  });
});

describe("nobody else gets in", () => {
  it("takes no other person, no second Owner and not its maker in another role", async () => {
    const { w, me, ann } = await practice();
    const stranger = `t-${randomUUID()}`;
    await db().from("profiles").insert({ id: stranger, name: "Stranger", role: "", color: "#000", email: `${stranger}@example.test` });
    cleanups.push(async () => void (await db().from("profiles").delete().eq("id", stranger)));
    for (const role of ["owner", "admin", "member", "guest"]) expect(code(await db().from("memberships").insert({ workspace_id: w.id, user_id: stranger, role }))).toBe("ZF4P2");
    expect(code(await db().from("memberships").update({ role: "owner" }).eq("workspace_id", w.id).eq("user_id", ann))).toBe("ZF4P2");
    // Its only Owner cannot step down either (the rule that a Workspace keeps an Owner refuses first).
    expect((await db().from("memberships").update({ role: "admin" }).eq("workspace_id", w.id).eq("user_id", me)).error).not.toBeNull();
  });
  it("keeps a made-up person without a sign-in, a real address or another Workspace", async () => {
    const { w, ann } = await practice();
    const plain = await workspace("Plain"); cleanups.push(plain.cleanup);
    expect(code(await db().from("memberships").insert({ workspace_id: plain.id, user_id: ann, role: "member" }))).toBe("ZF4P2");
    for (const patch of [{ email: "ann@example.org" }, { auth_user_id: randomUUID() }, { phone: "+15551234567" }, { slack_handle: "ann" }]) {
      expect(code(await db().from("profiles").update(patch).eq("id", ann))).toBe("23514");
    }
    expect(code(await db().from("profiles").update({ made_up_in: null }).eq("id", ann))).toBe("ZF4P0");
    expect(code(await db().from("profiles").insert({ id: `t-${randomUUID()}`, name: "X", role: "", color: "#000", made_up_in: plain.id }))).toBe("ZF4P2");
    expect((await db().from("memberships").select("user_id").eq("workspace_id", w.id)).data).toHaveLength(2);
  });
});

describe("a Delivery stays in the Outbox", () => {
  it("is kept when asked to be queued, and refused as sending or sent, whoever writes it", async () => {
    const { w, me, ann } = await practice();
    for (const who of [me, ann]) {
      for (const connector of ["email", "slack", "telegram"]) {
        const made = await delivery(w.id, who, "queued", connector);
        expect(made.data).toMatchObject({ mail_state: "outbox", last_error: PRACTICE_HELD });
        expect((await db().from("deliveries").update({ mail_state: "queued" }).eq("id", made.data!.id).select("mail_state").single()).data?.mail_state).toBe("outbox");
        for (const mail_state of ["sending", "sent"]) expect(code(await db().from("deliveries").update({ mail_state }).eq("id", made.data!.id))).toBe("ZF4P1");
      }
    }
    for (const mail_state of ["sending", "sent"]) expect(code(await delivery(w.id, me, mail_state))).toBe("ZF4P1");
  });
  it("cannot be moved in from another Workspace once queued", async () => {
    const { w } = await practice();
    const plain = await workspace("Plain"); cleanups.push(plain.cleanup);
    const them = await plain.person("owner", { email: "them@example.test" });
    const made = await delivery(plain.id, them, "queued");
    expect(made.data?.mail_state).toBe("queued");
    expect((await db().from("deliveries").update({ workspace_id: w.id }).eq("id", made.data!.id).select("mail_state").single()).data?.mail_state).toBe("outbox");
  });
  it("starts in the Outbox, and the day's asking sends nothing to anyone", async () => {
    const { w, me, ann } = await practice();
    for (const connector of ["email", "slack", "telegram"]) for (const who of [me, ann]) expect(await initialDeliveryState(connector, w.id, who)).toBe("outbox");
    await askForMissingValues(w.actor(me));
    const rows = (await db().from("deliveries").select("recipient_id, mail_state, body").eq("workspace_id", w.id)).data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.mail_state === "outbox")).toBe(true);
    await sendAllWaiting(200);
    expect(((await db().from("deliveries").select("sent_at").eq("workspace_id", w.id)).data ?? []).every((r) => r.sent_at === null)).toBe(true);
  });
  it("keeps a Test Message in the Outbox and says why", async () => {
    const { w, me } = await practice();
    const r = await sendTestMessage(w.actor(me), "email");
    expect(r).toMatchObject({ state: "kept", note: PRACTICE_HELD });
  });
});

describe("what would reach outside", () => {
  const REFUSED = ["calendar_links", "contacts", "email_sends", "feedback", "invitation_emails", "invitations", "join_requests", "share_proposals", "slack_install_states", "slack_installations", "slack_link_codes", "slack_links", "slack_sends", "telegram_link_codes", "telegram_links", "telegram_sends", "telegram_workspaces", "view_links", "webhook_sends", "webhooks", "workspace_limits"];
  it("cannot be stored for it", async () => {
    const { w } = await practice();
    expect((await db().rpc("practice_refused_tables")).data).toEqual(REFUSED);
    // A Share Proposal is refused only by email (a view_link): sharing with its own people can be proposed.
    for (const table of REFUSED) expect([table, code(await db().from(table).insert({ workspace_id: w.id, ...(table === "share_proposals" ? { kind: "view_link" } : {}) }))]).toEqual([table, "ZF4P2"]);
    expect(code(await db().from("share_proposals").insert({ workspace_id: w.id, kind: "share" }))).not.toBe("ZF4P2");
  });
  it("lets no Contact in, not even their person row", async () => {
    const { w, me } = await practice();
    await expect(addContact(w.actor(me), { name: "Real Person", email: "real@example.org" })).rejects.toThrow(/Practice Workspace/);
    expect(code(await db().from("profiles").insert({ id: `t-${randomUUID()}`, name: "Real Person", role: "Contact", color: "#000", contact_workspace: w.id }))).toBe("ZF4P2");
    expect((await db().from("profiles").select("id").eq("contact_workspace", w.id)).data).toEqual([]);
  });
  it("is refused by the core before the database has to, while nothing is switched on", async () => {
    const { w, me, metric } = await practice();
    const actor = w.actor(me);
    const attempts: [string, () => Promise<unknown>][] = [
      ["an invitation", () => inviteByEmail(actor, { email: "someone@example.org", role: "member" })],
      ["an invite link", () => createInviteLink(actor, "member")],
      ["domain joining", () => setJoinDomain(actor, "me@example.org", true)],
      ["Slack", () => startSlackInstall(actor)],
      ["Telegram", () => setTelegramEnabled(actor, true)],
    ];
    for (const [what, attempt] of attempts) await expect(attempt(), what).rejects.toThrow(/Practice Workspace/);
    expect(await slackBot(w.id)).toBeNull();
    expect(await telegramOnIn(w.id)).toBe(false);
    expect(metric.id).toBeGreaterThan(0);
  });
  it("includes every other email: the mail module sends none for it", async () => {
    const { w } = await practice();
    const sent: OutgoingMail[] = [];
    await expect(sendMail({ to: "someone@example.org", subject: "Hello", text: "Hello" }, w.id, async (m) => { sent.push(m); return { messageId: "1" }; })).rejects.toBeInstanceOf(PracticeRefused);
    expect(sent).toEqual([]);
  });
});

describe("what it is not counted for", () => {
  it("has no Workspace Limit, leaves its maker their own, and is unknown to Ziffr Cloud and the limits page", async () => {
    const { w, me } = await practice();
    const plain = await workspace("Plain"); cleanups.push(plain.cleanup);
    // An ordinary Workspace is given the Installation's default (which may be no limit at all); this one is given none.
    expect((await db().rpc("workspace_limit_of", { p_workspace: plain.id })).data).toHaveLength(1);
    expect((await db().rpc("workspace_limit_of", { p_workspace: w.id })).data).toEqual([]);
    expect((await db().rpc("owns_default_workspace", { p_person: me })).data).toBe(false);
    expect(((await db().rpc("workspace_limits_overview")).data as { workspace_id: string }[]).map((r) => r.workspace_id)).not.toContain(w.id);
    expect(await cloudWorkspace({} as never, w.id)).toMatchObject({ exists: false, metrics: null });
  });
  it("is never warned or deleted as unused", async () => {
    const { w } = await practice();
    await db().from("workspaces").update({ last_used_at: "2020-01-01T00:00:00Z" }).eq("id", w.id);
    expect((await db().rpc("claim_unused_warning", { p_workspace: w.id, p_days: 30, p_wait: 14 })).data).toBe(false);
    expect((await db().rpc("deletable_as_unused", { p_workspace: w.id, p_days: 30 })).data).toBe(false);
    expect(((await db().rpc("unused_workspace_candidates", { p_days: 30, p_limit: 1000 })).data as { workspace_id: string }[]).map((c) => c.workspace_id)).not.toContain(w.id);
  });
  it("is left out of the Installation's usage totals", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const totals = async () => (await db().rpc("usage_rollup_day", { p_day: day, p_exclude: null, p_states: true })).data as { workspaces: number; metrics: number };
    const before = await totals();
    await practice();
    expect(await totals()).toMatchObject({ workspaces: before.workspaces, metrics: before.metrics });
  });
});
