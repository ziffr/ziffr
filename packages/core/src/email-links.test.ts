// The links of every kind of email Ziffr sends (GLOSSARY: Delivery), through the real senders down to the raw message
// the SMTP library writes: the HTML part shows no address as text and has a button for the main action, the plain-text
// part keeps every address whole on its own line, and no transfer encoding breaks one. The database is a stand-in.
import nodemailer from "nodemailer";
import PostalMime from "postal-mime";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sendAuthEmail } from "./auth-email";
import { email } from "./connectors/email";
import type { DeliveryKind } from "./connectors/types";
import { plainBody } from "./deliveries";
import { headsUpMessage } from "./heads-up-message";
import { resendInvitation } from "./invitations";
import { startReplyTest } from "./installation-replies";
import { sendTestEmail } from "./installation-settings";
import { brandedParts, FORM_LINK, sendDelivery, sendMail, smtpMessage, type OutgoingMail } from "./mail";
import { screenLinkText } from "./screen-link-words";
import { viewLinkEmail } from "./share-proposals";
import { testText } from "./test-message-words";
import { digestText } from "./usage-digest";
import type { UsageReport } from "./usage-report";

const SITE = "https://ziffr.example.test";
const AUTH = "https://auth.ziffr.example.test";
const SETTINGS = { ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: SITE, ZIFFR_INBOUND_DOMAIN: "in.example.test", ZIFFR_INBOUND_SECRET: "x".repeat(32) };
// A form token far longer than a line of a message may be.
const CODE = `tk-${"AbC123_-".repeat(20)}`;

const fake = vi.hoisted(() => ({ rows: {} as Record<string, unknown>, rpc: {} as Record<string, unknown>, noTheme: false }));
vi.mock("./db", () => {
  const query = (table: string): unknown => new Proxy({}, { get: (_t, key) => key === "then"
    ? (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve({ data: fake.rows[table] ?? null, error: null, count: 0 }).then(ok, no)
    : () => query(table) });
  return { db: () => ({ from: query, rpc: async (name: string) => ({ data: fake.rpc[name] ?? null, error: null }) }) };
});
vi.mock("./sealed-columns", async (actual) => ({ ...(await actual<object>()), openRows: async (_t: string, _w: string, rows: unknown[]) => rows, openNames: async (_w: string, rows: unknown[]) => rows }));
vi.mock("./settings-in-effect", async (actual) => ({ ...(await actual<object>()), settingsInEffect: async () => SETTINGS }));
vi.mock("./limits", async (actual) => ({ ...(await actual<object>()), effectiveLimit: async () => 50 }));
vi.mock("./sending-limit", () => ({ sendingLimit: async () => 100 }));
vi.mock("./trials", async (actual) => ({ ...(await actual<object>()), trialHoldsBack: async () => null, claimTrialSend: async () => "ok", trialEndsAt: async () => null, trialEnded: async () => false }));
vi.mock("./workspace-look", async () => {
  const { themeLook } = await import("./theme-look");
  return { workspaceLook: async () => { if (fake.noTheme) throw new Error("unreadable"); return themeLook(undefined, "Acme"); } };
});
vi.mock("./internal/delivery-send", async (actual) => ({ ...(await actual<object>()), archivedMetricHolds: async () => null }));
vi.mock("./installation-admins", async (actual) => ({ ...(await actual<object>()), assertInstallationAdmin: async () => {}, recordInstallationEvent: async () => {} }));

const saved: Record<string, string | undefined> = {};
const ENV = { ZIFFR_SITE_URL: SITE, ZIFFR_SMTP_URL: SETTINGS.ZIFFR_SMTP_URL, ZIFFR_MAIL_FROM: SETTINGS.ZIFFR_MAIL_FROM, SUPABASE_PUBLIC_URL: AUTH, ZIFFR_JOB_SECRET: "j".repeat(40) };
beforeAll(() => { for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });

let sent: OutgoingMail[] = [];
const transport = async (m: OutgoingMail) => { sent.push(m); return { messageId: "<1@test>" }; };
beforeEach(() => {
  sent = [];
  fake.noTheme = false;
  fake.rows = { profiles: { id: "p1", name: "Ann Lee", email: "ann@example.test" }, memberships: { user_id: "p1", role: "owner" }, tokens: { code: CODE } };
  fake.rpc = { claim_delivery_send: "ok", claim_invitation_email: "ok", claim_installation_test_email: true, make_installation_reply_test: 1 };
});

/** The message as it goes over the wire, and as a mail app reads it back. */
async function wire(mail: OutgoingMail) {
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const raw = String((await stream.sendMail(smtpMessage(mail, SETTINGS))).message);
  const read = await PostalMime.parse(raw);
  return { raw, text: (read.text ?? "").replace(/\r\n/g, "\n"), html: read.html ?? "", headers: new Map(read.headers.map((h) => [h.key, h.value])) };
}

/** What a person sees of the HTML: its text without the tags, styles and addresses behind links. */
const visible = (html: string) => html.replace(/<(style|head)[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, " ");
const button = (html: string) => /<a href="([^"]+)" class="btn"[^>]*>([^<]+)<\/a>/.exec(html)?.slice(1).map((s) => s.replace(/&amp;/g, "&"));

/** The rules every email follows: `main` is the button's address and words, `stop` the footer link's words. */
async function check(mail: OutgoingMail, main: [string, string] | null, stop?: string) {
  const m = await wire(mail);
  expect(visible(m.html)).not.toMatch(/https?:\/\//);
  expect(m.raw.split("\r\n").every((l) => l.length <= 998)).toBe(true);
  const lines = m.text.split("\n");
  for (const [i, line] of lines.entries()) {
    if (!line.includes(SITE) && !line.includes(AUTH)) continue;
    expect(line.trim()).toMatch(/^<https:\/\/[^\s<>]+>$/);
    expect(lines.slice(0, i).some((l) => /[a-z]/i.test(l) && !l.includes("://"))).toBe(true);
  }
  // Every address the message was given is in the text part as it was, unbroken.
  for (const url of String(mail.text).match(/https:\/\/[^\s<>"]+/g) ?? []) expect(m.text).toContain(url.replace(/[.,;]+$/, ""));
  if (main) {
    expect(button(m.html)).toEqual(main);
    expect(lines).toContain(`<${main[0]}>`);
  } else expect(button(m.html)).toBeUndefined();
  if (stop) {
    const link = new RegExp(`<a href="([^"]+)" class="muted"[^>]*>${stop}</a>`).exec(m.html);
    expect(link?.[1]).toContain(`${SITE}/api/unsubscribe/`);
    expect(m.headers.get("list-unsubscribe")?.replace(/\s/g, "")).toBe(`<${link![1]}>`);
    expect(m.headers.get("list-unsubscribe-post")).toBe("List-Unsubscribe=One-Click");
    expect(lines).toContain(`<${link![1]}>`);
  } else expect(m.headers.has("list-unsubscribe")).toBe(false);
  return m;
}

const sara = { id: "p2", name: "Sara Kim", email: "sara@example.test" } as never;
const ann = { id: "p1", name: "Ann Lee", email: "ann@example.test" } as never;
const LONG = `${SITE}/metrics/${"monthly-recurring-revenue-".repeat(8)}end`;
const path = LONG.slice(SITE.length);
const delivery = async (kind: string, body: string, more: Record<string, unknown> = {}) => {
  fake.rows.deliveries = { id: 1, workspace_id: "w1", recipient_id: "p1", kind, subject: "Subject", body, attempts: 0, reply_token: null, unsubscribe_token: null, form_token_id: 5, sender_id: "p2", ...more };
  expect(await sendDelivery(1, transport)).toBe("sent");
  return sent[0];
};
const prompt = (answerHere: boolean) => email.renderPrompt!({ recipient: ann, metric: "Visits", question: "What’s the number for Visits this month?", period: "November 2026", answerHere, formLink: answerHere ? "" : FORM_LINK }).body;
const action = (kind: DeliveryKind, repliesReturn: boolean) => email.render({ kind, action: { id: 7, kind: "task", question: "Please check this.", metric: "Visits", period: "November 2026", due: "2026-12-01" }, sender: sara, recipient: ann, text: "Looks high to me.", link: `${SITE}/actions/7`, ref: "ZIF-7", repliesReturn }).body;

describe("Deliveries by email", () => {
  it("a Prompt with a form link: a button, and a stop link in the footer", async () => {
    await check(await delivery("prompt", prompt(false)), [`${SITE}/submit/${CODE}`, "Open your form"], "Unsubscribe from these emails");
  });
  it("a Prompt answered by reply: no button, only the stop link", async () => {
    const mail = await delivery("prompt", prompt(true));
    await check(mail, null, "Unsubscribe from these emails");
    expect(mail.replyTo).toMatch(/^reply\+/);
  });
  it("a reminder", async () => {
    await check(await delivery("reminder", action("reminder", true)), [`${SITE}/actions/7`, "Open in Ziffr"], "Unsubscribe from these emails");
  });
  it.each(["question", "task", "reply", "correction", "decision", "closed", "done"] as const)("a %s message (tasks include Approvals, Self-checks and Escalations)", async (kind) => {
    for (const replies of [true, false]) {
      sent = [];
      const m = await check(await delivery(kind, action(kind, replies)), [`${SITE}/actions/7`, "Open in Ziffr"]);
      // The words that say how to answer stay above the button.
      expect(visible(m.html)).toContain(replies ? "Answer by replying to this email, or open it in Ziffr." : "Answer it in Ziffr.");
    }
  });
  it("a notice with a long address, also with no Theme to read", async () => {
    for (const unread of [false, true]) {
      sent = [];
      fake.noTheme = unread;
      const m = await check(await delivery("notice", plainBody("email", "You now own Visits.", path)), [LONG, "Open the Metric"]);
      expect(visible(m.html)).toContain(unread ? "Sent by Ziffr." : "Sent by Ziffr for Acme");
    }
  });
  it("a notice in a script the library encodes as base64, or with very long words, keeps the address whole", async () => {
    for (const words of ["値".repeat(400), `Ünïcode ${"x".repeat(1500)}`]) {
      sent = [];
      const m = await wire(await delivery("notice", plainBody("email", words, path)));
      expect(m.raw).toMatch(/Content-Transfer-Encoding: (base64|quoted-printable)/);
      expect(m.raw.split("\r\n").every((l) => l.length <= 998)).toBe(true);
      expect(m.text.split("\n")).toContain(`<${LONG}>`);
      expect(button(m.html)?.[0]).toBe(LONG);
    }
  });
  it.each([
    ["/settings/export", "Download your data"], ["/settings/workspace/download", "Download your data"], ["/workflows?id=3", "Open the Workflow"],
    ["/dashboards/3", "Open the dashboard"], ["/dashboards/3/snapshots/9", "Open the Snapshot"], ["/?panel=feedback", "Open My feedback"], ["/", "Open Ziffr"],
    [`/api/confirm-reply/${"a".repeat(43)}`, "Check your reply"], ["/settings/webhooks", "Open in Ziffr"], ["/analyze#heads-ups", "Open in Ziffr"],
  ])("a notice that leads to %s", async (to, words) => {
    await check(await delivery("notice", plainBody("email", "Something happened.", to)), [`${SITE}${to}`, words]);
  });
  it("a Screen Link and a Test Message", async () => {
    await check(await delivery("notice", plainBody("email", screenLinkText("Acme", "Themes"), "/themes")), [`${SITE}/themes`, "Open in Ziffr"]);
    sent = [];
    await check(await delivery("test", plainBody("email", testText("Acme", "email"), "/")), [`${SITE}/`, "Open Ziffr"]);
  });
  it("an Alert, a Tell message and the daily limit note", async () => {
    await check(await delivery("alert", plainBody("email", "Visits is above 10.", path), { alert_id: 3 }), [LONG, "Open the Metric"], "Pause this Alert");
    sent = [];
    await check(await delivery("alert", plainBody("email", "Visits is above 10.", path), { tell_workflow_id: 3 }), [LONG, "Open the Metric"], "Stop being told by this Workflow");
    sent = [];
    await check(await delivery("alert", plainBody("email", "More Alerts fired today. Open Ziffr to see them.", "/settings/alerts")), [`${SITE}/settings/alerts`, "Open in Ziffr"]);
  });
  it("a Heads-up", async () => {
    const m = headsUpMessage({ takeaway: { kind: "answer", sentence: "Visits fell.", basis: "12 months", footer: "A pattern, not a cause." } } as never, ["Visits"])!;
    await check(await delivery("heads_up", plainBody("email", m.text, "/analyze#heads-ups")), [`${SITE}/analyze#heads-ups`, "Open in Ziffr"], "Stop Heads-ups by message");
  });
  it("a Checklist Item and a Send Snapshot message", async () => {
    await check(await delivery("checklist", plainBody("email", "Close the books. See https://wiki.example.org/close/the/books?month=11 first.", "/workflows?id=3"), { tell_workflow_id: 3 }), [`${SITE}/workflows?id=3`, "Open the Workflow"], "Stop being told by this Workflow");
    // A person's own link elsewhere stays a link, in words that name where it leads, and never becomes the button.
    expect(sent[0].html).toContain(">Link to wiki.example.org</a>");
  });
  it("a Filled-in Value, to a member and to a Contact", async () => {
    await check(await delivery("filled_in", plainBody("email", "Sara entered 42 for you.", path)), [LONG, "Open the Metric"]);
    sent = [];
    await check(await delivery("filled_in", plainBody("email", "A colleague entered 42 for you.", FORM_LINK)), [`${SITE}/submit/${CODE}`, "Open your form"]);
  });
  it("the usage digest", async () => {
    const report = { countingSince: "2026-01-01", unusedDays: 90, fillsInOn: null, notOpened: { dashboards: [{ name: "Old", why: "not opened" }], decks: [], metrics: [] }, noValues: [], submitters: [] } as unknown as UsageReport;
    await check(await delivery("digest", digestText(report, "Acme")!), [`${SITE}/settings/usage`, "Open the Usage page"], "Unsubscribe from this digest");
  });
});

describe("emails that are no Delivery", () => {
  it("an invitation: accept as the button, stop in the footer", async () => {
    fake.rows.invitations = { id: 1, workspace_id: "w1", token: "i".repeat(43), email: "new@example.test", role: "member", expires_at: new Date(Date.now() + 86_400_000).toISOString(), email_sends: 0, email_sent_at: null, revoked_at: null, accepted_at: null, held_at: null, created_by: "p2", workspaces: { name: "Acme" }, profiles: { name: "Sara Kim", email: "sara@example.test" } };
    await resendInvitation({ personId: "p2", workspaceId: "w1", role: "owner" }, 1, transport);
    await check(sent[0], [`${SITE}/invite/${"i".repeat(43)}`, "Accept the invitation"], "Do not invite me again from any workspace on this Ziffr");
  });
  it("a View Link, also with a link in the sender's message", async () => {
    const mail = viewLinkEmail({ sender: "Sara", dashboard: "Board", url: `${SITE}/v/${"v".repeat(120)}`, endsOn: "2026-12-31", message: `Look at ${SITE}/dashboards/1\nand https://evil.example.org/${"x".repeat(90)}` });
    await sendMail({ to: "bo@example.org", subject: mail.subject, text: mail.text, ...(await brandedParts("w1", { text: mail.text })) }, transport);
    const m = await wire(sent[0]);
    expect(visible(m.html)).not.toMatch(/https?:\/\//);
    expect(button(m.html)).toEqual([`${SITE}/v/${"v".repeat(120)}`, "Open the dashboard"]);
    expect(m.html).toContain(">Link to evil.example.org</a>");
    expect(m.text).toContain(`Open it here:\n<${SITE}/v/${"v".repeat(120)}>`);
    // The sender's words stay quoted, as written.
    expect(m.text).toContain(`> Look at ${SITE}/dashboards/1\n> and https://evil.example.org/${"x".repeat(90)}`);
  });
  it.each(["magiclink", "signup", "recovery", "invite", "email_change"])("the %s sign-in email", async (kind) => {
    await sendAuthEmail({ user: { email: "a@example.test", new_email: "b@example.test" }, email_data: { email_action_type: kind, token_hash: "h".repeat(120), token_hash_new: "k".repeat(120), redirect_to: `${SITE}/auth/callback?next=%2F` } }, transport);
    expect(sent).toHaveLength(kind === "email_change" ? 2 : 1);
    for (const mail of sent) {
      const url = mail.text.match(/<([^>]+)>/)![1];
      expect(url.startsWith(`${AUTH}/auth/v1/verify?token=`)).toBe(true);
      const m = await check(mail, [url, kind === "invite" ? "Accept and sign in" : kind !== "email_change" ? "Sign in to Ziffr" : mail.to === "b@example.test" ? "Confirm the new address" : "Confirm the change"]);
      expect(m.text).toContain(`\n<${url}>\n`);
    }
  });
  it("the Installation's test email and test of replies", async () => {
    fake.rows.profiles = { id: "p1", name: "Ann", email: "ann@example.test" };
    fake.rows.installation_reply_tests = null;
    await sendTestEmail({ personId: "p1" }, transport);
    await startReplyTest({ personId: "p1" }, transport);
    expect(sent).toHaveLength(2);
    for (const mail of sent) await check(mail, [SITE, "Open Ziffr"]);
  });
  it("the answer to a reply that holds the form link", async () => {
    const text = `This Metric takes values only through your form:\n${SITE}/submit/${CODE}`;
    await sendMail({ to: "a@example.test", subject: "Your value was not recorded", text, ...(await brandedParts("w1", { text })) }, transport);
    const m = await check(sent[0], [`${SITE}/submit/${CODE}`, "Open your form"]);
    expect(visible(m.html)).toContain("only through your form.");
  });
});

describe("the one-click headers", () => {
  it("keep a long address whole, whatever folding the header needs", async () => {
    const url = `${SITE}/api/unsubscribe/invitations/${"A".repeat(400)}.${"b".repeat(43)}`;
    const m = await wire({ to: "a@example.test", subject: "s", text: "x", unsubscribe: url });
    expect(m.headers.get("list-unsubscribe")).toBe(`<${url}>`);
  });
});
