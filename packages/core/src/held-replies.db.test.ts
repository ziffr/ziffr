// Held Replies against the real database and the local Mailpit (ticket #513 part b): a reply by email that no provider
// vouched for changes nothing until the person it went to confirms it with a one-time link sent to the address on
// file; a vouched-for one is taken at once; the link works once, within its hours, for the address it was sent to, and
// answers the same when unknown, expired or used. Mail goes only to the local Mailpit.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { deliverPrompt } from "./deliveries";
import { confirmHeldReply, HELD_PER_DELIVERY, heldReplyView } from "./held-replies";
import { parseInbound, receiveEmail } from "./inbound-email";
import { ask } from "./questions";
import type { SubmissionEffects } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { rowsOf, auditRowsOf, valuesOf, workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const DOMAIN = "in.ziffr.example.test";
const SETTINGS = {
  ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test",
  ZIFFR_INBOUND_DOMAIN: DOMAIN, ZIFFR_INBOUND_SECRET: "i".repeat(40),
};
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries({ ...SETTINGS, ZIFFR_INBOUND_AUTHSERV_ID: "" })) { saved[k] = process.env[k]; if (v) process.env[k] = v; else delete process.env[k]; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); delete process.env.ZIFFR_INBOUND_AUTHSERV_ID; });
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });
const emailOf = async (person: string) => (await db().from("profiles").select("email").eq("id", person).single()).data!.email as string;

const reply = (o: { from: string; token: string; text: string; headers?: string }) => [
  `From: Someone <${o.from}>`, `To: Ziffr <reply+${o.token}@${DOMAIN}>`, "Subject: Re: your question", `Message-ID: <${randomUUID()}@mail.example.test>`,
  ...(o.headers ? [o.headers] : []), "Content-Type: text/plain; charset=utf-8", "", o.text,
].join("\r\n");
const receive = async (o: Parameters<typeof reply>[0]) => receiveEmail(await parseInbound(reply(o)), { submission: quiet() });

async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
async function promptFor() {
  const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
  const m = await w.metric(sara, { name: "Field visits", sources: ["web_form", "mail"], submission_rule: "overwrite" }); await w.token(m.id, ann);
  await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
  const { data: d } = await db().from("deliveries").select("id, reply_token").eq("workspace_id", w.id).eq("recipient_id", ann).eq("kind", "prompt").single();
  return { w, sara, ann, m, d: d!, annMail: await emailOf(ann) };
}

/** The confirmation links in the mail to an address, oldest first, read from Mailpit as the person would see them. */
async function linksTo(to: string): Promise<string[]> {
  const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}" subject:"Confirm your reply"`)}`)).json() as { messages: { ID: string }[] };
  const texts = await Promise.all(messages.map(async (m) => ((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string }).Text));
  return texts.reverse().flatMap((t) => [...t.matchAll(/\/api\/confirm-reply\/([A-Za-z0-9_-]{43})/g)].map((x) => x[1]));
}
const heldRows = async (deliveryId: number) => (await db().from("held_replies").select("*").eq("delivery_id", deliveryId)).data ?? [];

describe("the note on a Held Reply's page (spec 0064)", () => {
  it("offers a field with the question above Confirm, saves what is typed with the value, and sends no further email", async () => {
    const { w, m, d, annMail } = await promptFor();
    expect(await receive({ from: annMail, token: d.reply_token!, text: "42" })).toBe("held");
    const [token] = await linksTo(annMail);
    expect(await heldReplyView(token!)).toMatchObject({ question: "Anything behind it?", notes: [{ position: 1, asks: true }] });
    const before = (await rowsOf("deliveries", { workspace_id: w.id })).length;
    const done = await confirmHeldReply(token!, undefined, { 1: "Two visits moved.", 2: "Nobody's" });
    expect(done).toMatchObject({ ok: true, detail: expect.stringContaining("Your note was saved.") });
    expect(done!.detail).not.toContain("Anything behind");
    expect((await rowsOf("deliveries", { workspace_id: w.id })).length).toBe(before);
    expect(await rowsOf("value_notes", { metric_id: m.id })).toHaveLength(1);
    expect(await rowsOf("note_questions", { workspace_id: w.id })).toEqual([]);
  });

  it("keeps the field without the question where the Metric never asks, and none where the reply holds a note", async () => {
    const { m, d, annMail } = await promptFor();
    await db().from("metrics").update({ ask_note: "never" }).eq("id", m.id);
    expect(await receive({ from: annMail, token: d.reply_token!, text: "42" })).toBe("held");
    expect(await receive({ from: annMail, token: d.reply_token!, text: "43\r\nCounted twice." })).toBe("held");
    const [first, second] = await linksTo(annMail);
    const plain = await heldReplyView(first!);
    expect(plain!.notes).toEqual([expect.objectContaining({ position: 1, asks: false })]);
    expect(plain).not.toHaveProperty("question");
    expect(await heldReplyView(second!)).not.toHaveProperty("notes");
  });
});

describe("held replies", () => {
  it("holds an unvouched reply, mails the link to the address on file, and records it only when confirmed, once", async () => {
    const { w, m, d, annMail } = await promptFor();
    expect(await receive({ from: annMail, token: d.reply_token!, text: "42 visits" })).toBe("held");
    // Nothing is recorded yet.
    expect(await valuesOf(m.id)).toEqual([]);
    const [token] = await linksTo(annMail);
    expect(token).toBeTruthy();
    // The row keeps the token's hash and the words sealed: neither the token nor the text is in it.
    const rows = await heldRows(d.id);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain("42 visits");
    // Asking changes nothing; the page shows the reply and what it would do.
    const view = await heldReplyView(token);
    expect(view).toMatchObject({ kind: "value", text: "42 visits" });
    expect(view!.effect).toMatch(/42.*Field visits/);
    expect(await valuesOf(m.id)).toEqual([]);
    const done = await confirmHeldReply(token);
    expect(done).toMatchObject({ ok: true });
    expect(done!.detail).toMatch(/42.*Field visits/);
    expect(await valuesOf(m.id)).toMatchObject([{ value: 42, source: "mail" }]);
    // Used: the same answer as for any other link that does not work, and nothing is recorded twice.
    expect(await confirmHeldReply(token)).toBeNull();
    expect(await heldReplyView(token)).toBeNull();
    expect(await valuesOf(m.id)).toHaveLength(1);
    expect(await heldRows(d.id)).toEqual([]);
    // Held and confirmed are in the Audit Log, without the value.
    const held = await auditRowsOf(w.id, "email_reply.held");
    const confirmed = await auditRowsOf(w.id, "email_reply.confirmed");
    expect(held).toHaveLength(1);
    expect(confirmed).toHaveLength(1);
    expect(JSON.stringify([held, confirmed])).not.toContain("42");
  });

  it("shows the note and the offered change of a later reply, and takes the change only by its button (spec 0064)", async () => {
    const { w, m, d, annMail } = await promptFor();
    expect(await receive({ from: annMail, token: d.reply_token!, text: "42\r\nFewer trips." })).toBe("held");
    const [first] = await linksTo(annMail);
    expect((await heldReplyView(first))!.effect).toMatch(/42.*Field visits[\s\S]*Fewer trips\./);
    expect(await confirmHeldReply(first)).toMatchObject({ ok: true });
    for (const text of ["It was 44 in fact", "It was 44 in fact"]) expect(await receive({ from: annMail, token: d.reply_token!, text })).toBe("held");
    const [one, two] = (await linksTo(annMail)).slice(1);
    const view = await heldReplyView(one);
    expect(view).toMatchObject({ kind: "value", offer: { take: "1:overwrite:44", label: expect.stringContaining("change the value to 44") } });
    expect(view!.effect).toContain("Saves your note");
    expect(await rowsOf("value_notes", { metric_id: m.id })).toHaveLength(1);
    // Confirm alone saves the note, which the page says, and leaves the value and no offer open.
    expect(await confirmHeldReply(one)).toMatchObject({ ok: true, detail: expect.stringContaining("Saved as your note") });
    expect(await valuesOf(m.id)).toMatchObject([{ value: 42 }]);
    expect(await rowsOf("reply_offers", { workspace_id: w.id })).toEqual([]);
    // A change other than the one offered is not taken.
    expect(await receive({ from: annMail, token: d.reply_token!, text: "Or 45?" })).toBe("held");
    expect(await confirmHeldReply(two, "1:add:45")).toMatchObject({ ok: true });
    expect(await valuesOf(m.id)).toMatchObject([{ value: 42 }]);
    const last = (await linksTo(annMail)).at(-1)!;
    expect(await confirmHeldReply(last, "1:overwrite:45")).toMatchObject({ ok: true, detail: expect.stringContaining("45") });
    expect(await valuesOf(m.id)).toMatchObject([{ value: 45 }]);
  });

  it("takes a vouched-for reply at once, and holds one whose Authentication-Results do not pass", async () => {
    const { m, d, annMail } = await promptFor();
    process.env.ZIFFR_INBOUND_AUTHSERV_ID = "mx.provider.test";
    const domain = annMail.split("@")[1];
    // The named provider says DMARC failed: a verdict against the sender, so refused and nobody is emailed a link.
    expect(await receive({ from: annMail, token: d.reply_token!, text: "5", headers: `Authentication-Results: mx.provider.test; dmarc=fail header.from=${domain}` })).toBe("unverified");
    expect(await heldRows(d.id)).toEqual([]);
    expect(await linksTo(annMail)).toEqual([]);
    // No verdict from the named provider (a pass written by someone else does not count): held.
    expect(await receive({ from: annMail, token: d.reply_token!, text: "6", headers: `Authentication-Results: mx.evil.test; dmarc=pass header.from=${domain}` })).toBe("held");
    expect(await valuesOf(m.id)).toEqual([]);
    expect(await receive({ from: annMail, token: d.reply_token!, text: "7", headers: `Authentication-Results: mx.provider.test; dmarc=pass header.from=${domain}` })).toBe("recorded");
    expect(await valuesOf(m.id)).toMatchObject([{ value: 7, source: "mail" }]);
    // The vouched-for reply held nothing of its own.
    expect(await heldRows(d.id)).toHaveLength(1);
  });

  it("never mails a forger: a sender other than the address on file gets no link and holds nothing", async () => {
    const { d, annMail } = await promptFor();
    const forger = address("forger");
    expect(await receive({ from: forger, token: d.reply_token!, text: "99" })).toBe("wrong_sender");
    expect(await heldRows(d.id)).toEqual([]);
    expect(await linksTo(forger)).toEqual([]);
    expect(await linksTo(annMail)).toEqual([]);
  });

  it("answers the same for an unknown, malformed, expired link, and refuses a link whose address is no longer the person's", async () => {
    const { w, ann, m, d, annMail } = await promptFor();
    expect(await receive({ from: annMail, token: d.reply_token!, text: "8" })).toBe("held");
    const [token] = await linksTo(annMail);
    for (const bad of ["x".repeat(43), "short", `${token}x`, "", "../../etc/passwd"]) {
      expect(await heldReplyView(bad)).toBeNull();
      expect(await confirmHeldReply(bad)).toBeNull();
    }
    // Past its hours: nothing, and the row is not consumed by the refusal.
    await db().from("held_replies").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("delivery_id", d.id);
    expect(await heldReplyView(token)).toBeNull();
    expect(await confirmHeldReply(token)).toBeNull();
    // A fresh hold clears the expired one away.
    expect(await receive({ from: annMail, token: d.reply_token!, text: "9" })).toBe("held");
    expect(await heldRows(d.id)).toHaveLength(1);
    const fresh = (await linksTo(annMail)).at(-1)!;
    expect(fresh).not.toBe(token);
    // The person's address changed since the link was sent: it acts for nobody.
    await db().from("profiles").update({ email: address("new-ann") }).eq("id", ann);
    expect(await confirmHeldReply(fresh)).toBeNull();
    expect(await valuesOf(m.id)).toEqual([]);
    void w;
  });

  it("holds a reply about a question and a Correction line, and posts them to the Thread only when confirmed", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ben = await w.person("member", { email: address("ben") });
    const m = await w.metric(sara, { name: "Revenue" });
    const actionId = await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ben, text: "Is October right?" });
    const { data: d } = await db().from("deliveries").select("id, reply_token").eq("action_id", actionId).eq("recipient_id", ben).single();
    const benMail = await emailOf(ben);
    const messages = async () => (await openRows("thread_messages", w.id, (await db().from("thread_messages").select("id, author_id, body, correction_value, correction_value_sealed").eq("action_id", actionId).order("id")).data)).filter((t) => t.author_id === ben);
    expect(await receive({ from: benMail, token: d!.reply_token!, text: "Yes, checked with the bank." })).toBe("held");
    expect(await receive({ from: benMail, token: d!.reply_token!, text: "Actually not.\r\nCorrection: 1250" })).toBe("held");
    expect(await messages()).toEqual([]);
    const [one, two] = await linksTo(benMail);
    expect(await heldReplyView(one)).toMatchObject({ kind: "reply", text: "Yes, checked with the bank." });
    // The page shows the whole text and the Correction's number, so nothing taken is hidden from the person.
    expect(await heldReplyView(two)).toMatchObject({ text: "Actually not.\nCorrection: 1250", effect: expect.stringMatching(/Correction to 1250/) });
    expect(await confirmHeldReply(one)).toMatchObject({ ok: true });
    expect(await confirmHeldReply(two)).toMatchObject({ ok: true });
    expect(await messages()).toEqual(expect.arrayContaining([
      expect.objectContaining({ body: "Yes, checked with the bank.", correction_value: null }),
      expect.objectContaining({ body: "Actually not.", correction_value: 1250 }),
    ]));
  });

  it("does not hold what would record nothing, and holds at most a few per email", async () => {
    const { m, d, annMail } = await promptFor();
    // No number in it: answered, not held, nothing mailed as a link.
    expect(await receive({ from: annMail, token: d.reply_token!, text: "thanks, will do" })).toBe("refused");
    expect(await heldRows(d.id)).toEqual([]);
    expect(await linksTo(annMail)).toEqual([]);
    for (let i = 0; i < HELD_PER_DELIVERY; i++) expect(await receive({ from: annMail, token: d.reply_token!, text: String(10 + i) })).toBe("held");
    expect(await receive({ from: annMail, token: d.reply_token!, text: "20" })).toBe("limited");
    expect(await valuesOf(m.id)).toEqual([]);
  });

  it("holds at most the words it shows, and takes no confirmation for an Action that became an Approval or a reply address that ran out", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ben = await w.person("member", { email: address("ben") });
    const m = await w.metric(sara, { name: "Revenue" });
    const actionId = await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ben, text: "Is October right?" });
    const { data: d } = await db().from("deliveries").select("id, reply_token").eq("action_id", actionId).eq("recipient_id", ben).single();
    const benMail = await emailOf(ben);
    expect(await receive({ from: benMail, token: d!.reply_token!, text: "ä".repeat(6000) })).toBe("held");
    const [link] = await linksTo(benMail);
    expect((await heldReplyView(link))!.text).toHaveLength(5000);
    // The Action became an Approval since: never confirmed by email unvouched.
    await db().from("actions").update({ purpose: "approval" }).eq("id", actionId);
    expect(await heldReplyView(link)).toBeNull();
    await db().from("actions").update({ purpose: null }).eq("id", actionId);
    expect(await heldReplyView(link)).not.toBeNull();
    // Past the days a reply address works.
    await db().from("deliveries").update({ created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq("id", d!.id);
    expect(await confirmHeldReply(link)).toBeNull();
  });

  it("is refused for the demo Workspace by the database", async () => {
    await expect(Promise.resolve(db().from("held_replies").insert({ workspace_id: DEMO_WORKSPACE_ID, delivery_id: 1, token_hash: "a".repeat(64), address_hash: "b".repeat(64), sealed_text: "x", kind: "value", expires_at: new Date(Date.now() + 60_000).toISOString() }))).rejects.toThrow(/demo/i);
  });
});
