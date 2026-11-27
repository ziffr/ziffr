// Opting out of email and the sending limits, against the real database and the local Mailpit (spec 0004, ticket
// #74): one click stops Prompts and reminders by email for that person and workspace and tells the Metric owners;
// a workspace sends at most 500 a day and a person gets at most 20 an hour, also under parallel sends.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { askMeNow } from "./ask-now";
import { emailOptedOut, optBackIn, optOutByToken, optOutOfEmail, undoEmailStop, unsubscribeTokenValid } from "./email-opt-out";
import { askToResumeEmail, RESUME_AGAIN_DAYS, resumeByLink, resumeLinkValid } from "./email-resume";
import { askingStops, nextPromptWays } from "./prompt-preview";
import { askForMissingValues } from "./questions";
import { addSubmitterWithAnswer } from "./who-submits";
import { MAIL_PER_RECIPIENT_PER_HOUR, MAIL_PER_SENDER_PER_DAY, MAIL_PER_WORKSPACE_PER_DAY, sendDelivery, sendWaiting } from "./mail";
import { connectorsView } from "./page-data";
import { ask } from "./questions";
import { workspace, opened } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
const forbidden = expect.any(Forbidden);
const latest = async (wsId: string, recipient: string, kind?: string) => {
  let q = db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient);
  if (kind) q = q.eq("kind", kind);
  return (await opened("deliveries", wsId, [(await q.order("id", { ascending: false }).limit(1).single()).data!]))[0];
};
const emailOf = async (person: string) => (await db().from("profiles").select("email").eq("id", person).single()).data!.email as string;

describe("opting out", () => {
  it("puts a one-click link on a Prompt, stops Prompts by email with it, tells the owner once, and lets the person opt back in", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    const m = await w.metric(sara, { name: "Visits" }); await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const first = await latest(w.id, ann);
    expect(first).toMatchObject({ mail_state: "sent", unsubscribe_token: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) });
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${await emailOf(ann)}"`)}`)).json() as { messages: { ID: string }[] };
    const headers = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}/headers`)).json() as Record<string, string[]>;
    const link = `https://ziffr.example.test/api/unsubscribe/${first.unsubscribe_token}`;
    expect(headers["List-Unsubscribe"]).toEqual([`<${link}>`]);
    expect(headers["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
    const text = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { Text: string }).Text;
    expect(text).toContain(link);

    expect(await unsubscribeTokenValid(first.unsubscribe_token)).toBe(true);
    expect(await optOutByToken(first.unsubscribe_token)).toEqual({ undo: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(true);
    const notice = await latest(w.id, sara, "notice");
    expect(notice.subject).toMatch(/is no longer asked for numbers by email$/);
    expect(notice.body).toContain("- Visits");
    // From Ziffr itself, so the person who stopped does not read it in their Outbox.
    expect(notice.sender_id).toBeNull();
    // Again: nothing more, no Undo, and nobody is told twice.
    expect(await optOutByToken(first.unsubscribe_token)).toEqual({ undo: null });
    const { count } = await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("recipient_id", sara).eq("kind", "notice");
    expect(count).toBe(1);

    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect(await latest(w.id, ann, "prompt")).toMatchObject({ mail_state: "failed", last_error: "They unsubscribed from requests by email." });
    // A question still reaches them.
    await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Is this right?" });
    expect(await latest(w.id, ann, "question")).toMatchObject({ mail_state: "sent", unsubscribe_token: null });

    await optBackIn(w.actor(ann, "member"));
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect((await latest(w.id, ann, "prompt")).mail_state).toBe("sent");
  });
  it("knows no token of another kind, a made-up one, or one in the wrong shape", async () => {
    expect(await optOutByToken("x".repeat(32))).toBe(false);
    expect(await optOutByToken("../../etc")).toBe(false);
    expect(await unsubscribeTokenValid("")).toBe(false);
  });
});

/** The text of the newest email to an address, as it left. */
async function mailTo(to: string): Promise<{ text: string; count: number }> {
  const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string }[] };
  if (!messages.length) return { text: "", count: 0 };
  return { text: (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { Text: string }).Text, count: messages.length };
}
const resumeSecret = (text: string) => /\/api\/unsubscribe\/again\/([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? "";
/** A Prompt sent to a submitter, and the token of its unsubscribe link. */
async function prompted(metricId: number, wsId: string, submitter: string, sender: string) {
  await deliverPrompt({ metricId, submitterId: submitter, senderId: sender });
  return (await latest(wsId, submitter, "prompt")).unsubscribe_token as string;
}
const noticesTo = async (wsId: string, who: string) => opened("deliveries", wsId, (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", who).eq("kind", "notice").order("id")).data ?? []);

describe("what the owners are told", () => {
  it("names only the Metrics that owner owns, says who is still asked, and what stays empty", async () => {
    const w = await ws();
    const sara = await w.person("owner", { email: address("sara") }); const ben = await w.person("member", { email: address("ben") }); const ann = await w.person("member", { email: address("ann") });
    const visits = await w.metric(sara, { name: "Visits" }); const revenue = await w.metric(sara, { name: "Revenue" }); const secret = await w.metric(ben, { name: "Secret Margin" });
    const gone = await w.metric(sara, { name: "Old Thing", archived_at: new Date().toISOString() });
    for (const m of [visits, revenue, secret, gone]) await w.token(m.id, ann);
    await w.token(revenue.id, ben);
    expect(await optOutByToken(await prompted(visits.id, w.id, ann, sara))).toBeTruthy();
    const [hers] = await noticesTo(w.id, sara);
    expect(hers.body).toContain("- Visits");
    expect(hers.body).toContain("- Revenue");
    expect(hers.body).toMatch(/is still asked for Revenue\./);
    expect(hers.body).toContain("Nobody else is asked for Visits, so it will stay empty.");
    expect(hers.body).not.toMatch(/Secret Margin|Old Thing|tk-test-/);
    expect(hers.body).toContain(`/metrics/${visits.slug}?tab=settings#who-submits`);
    const [his] = await noticesTo(w.id, ben);
    expect(his.body).toContain("- Secret Margin");
    expect(his.body).not.toMatch(/Visits|Revenue/);
  });
});

describe("the Undo of a stop just made", () => {
  it("takes back that stop once, never with a link used again, a wrong secret, another person's, or too late", async () => {
    const w = await ws();
    const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") }); const bob = await w.person("member", { email: address("bob") });
    const m = await w.metric(sara); await w.token(m.id, ann); await w.token(m.id, bob);
    const token = await prompted(m.id, w.id, ann, sara);
    const bobs = await prompted(m.id, w.id, bob, sara);
    const first = await optOutByToken(token);
    if (!first || !first.undo) throw new Error("No Undo was given.");
    // The old email again: nothing to take back with it.
    expect(await optOutByToken(token)).toEqual({ undo: null });
    expect(await undoEmailStop(token, "A".repeat(43))).toBe(false);
    expect(await undoEmailStop(bobs, first.undo)).toBe(false);
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(true);
    const both = await Promise.all([undoEmailStop(token, first.undo), undoEmailStop(token, first.undo)]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(false);
    // A stop made in Ziffr has none, and the earlier secret does nothing to it.
    await optOutOfEmail(w.actor(ann, "member"));
    expect(await undoEmailStop(token, first.undo)).toBe(false);
    // Over: the secret of a stop older than the window does nothing.
    const late = await optOutByToken(bobs);
    if (!late || !late.undo) throw new Error("No Undo was given.");
    await db().from("email_opt_outs").update({ undo_until: new Date(Date.now() - 1000).toISOString() }).eq("workspace_id", w.id).eq("person_id", bob);
    expect(await undoEmailStop(bobs, late.undo)).toBe(false);
    expect(await emailOptedOut(w.actor(bob, "member"))).toBe(true);
  });
});

describe("who is shown that someone stopped", () => {
  it("is the owner, Editors and the person themselves, and no one who only sees the Metric or has no access", async () => {
    const w = await ws();
    const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    const vic = await w.person("member", { email: address("vic") }); const out = await w.person("member", { email: address("out") });
    const m = await w.metric(sara); await w.token(m.id, ann); await w.share(m.id, vic);
    await optOutOfEmail(w.actor(ann, "member"));
    const hers = await askingStops(w.actor(sara), m.id);
    expect(hers).toMatchObject({ mine: [], nobody: true, people: [{ id: ann, ways: ["email"], askAgain: { askedAt: null } }] });
    expect(await askingStops(w.actor(ann, "member"), m.id)).toEqual({ mine: ["email"], people: [], nobody: false });
    for (const actor of [w.actor(vic, "member"), w.actor(out, "member")]) {
      expect(await askingStops(actor, m.id)).toEqual({ mine: [], people: [], nobody: false });
      expect((await nextPromptWays(actor, m.id))[ann]).toBeUndefined();
    }
    expect((await nextPromptWays(w.actor(sara), m.id))[ann]).toMatchObject({ ok: false, text: "Not asked by email (unsubscribed)" });
    // Someone else who can be asked: nobody is not said.
    await w.token(m.id, vic);
    expect((await askingStops(w.actor(sara), m.id)).nobody).toBe(false);
  });
});

describe("where Ziffr asks now", () => {
  it("says the person stopped these emails, and claims no wait for it", async () => {
    const w = await ws();
    const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    const m = await w.metric(sara); await w.token(m.id, sara);
    await optOutOfEmail(w.actor(sara));
    await db().from("delivery_preferences").insert({ workspace_id: w.id, user_id: sara, kind: "reminder", connector: "email", position: 0 });
    for (let i = 0; i < 2; i++) expect(await askMeNow(w.actor(sara), m.id)).toMatchObject({ state: "failed", stopped: true, note: "You stopped requests for numbers by email." });
    await optOutOfEmail(w.actor(ann, "member"));
    expect(await addSubmitterWithAnswer(w.actor(sara), m.id, ann, true)).toMatch(/was not asked: they unsubscribed from requests by email\.$/);
    // A number nobody was asked for today: the request is counted as stopped, never as made.
    const other = await w.metric(sara, { name: "Leads" }); await w.token(other.id, ann);
    expect(await askForMissingValues(w.actor(sara))).toEqual({ asked: 0, stopped: 1 });
  });
});

describe("asking whether the emails are wanted again", () => {
  it("is the owner's to send, rarely, only to the mailbox that stopped, and changes nothing until confirmed there, once", async () => {
    const w = await ws();
    const sara = await w.person("owner", { email: address("sara") }); const eve = await w.person("member", { email: address("eve") });
    const annMail = address("ann"); const ann = await w.contact({ email: annMail });
    const m = await w.metric(sara); await w.token(m.id, ann); await w.token(m.id, eve);
    const stop = await optOutByToken(await prompted(m.id, w.id, ann, sara));
    expect(stop).toBeTruthy();
    const before = (await mailTo(annMail)).count;
    await expect(askToResumeEmail(w.actor(eve, "member"), m.id, ann)).rejects.toEqual(forbidden);
    await expect(askToResumeEmail(w.actor(sara), m.id, sara)).rejects.toEqual(forbidden);
    // A Contact's address someone changed: nothing is sent to the new one.
    const other = address("mallory");
    await db().from("contacts").update({ email: other }).eq("workspace_id", w.id).eq("person_id", ann);
    await expect(askToResumeEmail(w.actor(sara), m.id, ann)).rejects.toThrow(/unsubscribed from/);
    expect((await mailTo(other)).count).toBe(0);
    await db().from("contacts").update({ email: annMail }).eq("workspace_id", w.id).eq("person_id", ann);
    const both = await Promise.allSettled([askToResumeEmail(w.actor(sara), m.id, ann), askToResumeEmail(w.actor(sara), m.id, ann)]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const mail = await mailTo(annMail);
    expect(mail.count).toBe(before + 1);
    const secret = resumeSecret(mail.text);
    expect(secret).toHaveLength(43);
    // The owner reads the message in the Outbox, never the link.
    const kept = await latest(w.id, ann, "notice");
    expect(kept.body).toContain("[the link only they get]");
    expect(JSON.stringify(kept)).not.toContain(secret);
    expect(kept.reply_token).toBeNull();
    expect(await resumeLinkValid(secret)).toBe(true);
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(true);
    expect(await resumeByLink("B".repeat(43))).toBe(false);
    expect(await resumeByLink(secret)).toBe(true);
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(false);
    expect(await resumeByLink(secret)).toBe(false);
    // Stopping again starts no new right to ask.
    await optOutOfEmail(w.actor(ann, "member"));
    await expect(askToResumeEmail(w.actor(sara), m.id, ann)).rejects.toThrow(`once in ${RESUME_AGAIN_DAYS} days`);
  });
});

describe("sending limits", () => {
  const queued = async (wsId: string, recipient: string, sender: string) =>
    (await db().from("deliveries").insert({ connector: "email", recipient_id: recipient, sender_id: sender, kind: "notice", workspace_id: wsId, subject: "Hi", body: "x", mail_state: "queued" }).select("id").single()).data!.id as number;
  // Emails that went out earlier, as the limits count them.
  const sentEarlier = (wsId: string, o: { address?: string; sender?: string | null }, n: number, at: Date) =>
    db().from("email_sends").insert(Array.from({ length: n }, () => ({ workspace_id: wsId, sender_id: o.sender ?? null, address_key: o.address ?? `x-${randomUUID()}@example.test`, sent_at: at.toISOString() })));
  it(`lets one inbox get at most ${MAIL_PER_RECIPIENT_PER_HOUR} an hour, from all workspaces and Contacts, also when sends race`, async () => {
    const inbox = address("victim");
    const [local, domain] = inbox.split("@");
    const a = await ws(); const b = await ws(); const sara = await a.person("owner", { email: address("sara") }); const zoe = await b.person("owner", { email: address("zoe") });
    // The same inbox as three Contacts in two workspaces, written three ways.
    const c1 = await a.contact({ email: `${local}+1@${domain}` }); const c2 = await a.contact({ email: `${local}+2@${domain}` }); const c3 = await b.contact({ email: inbox });
    await sentEarlier(a.id, { address: inbox }, MAIL_PER_RECIPIENT_PER_HOUR - 1, new Date(Date.now() - 30 * 60_000));
    await sentEarlier(a.id, { address: inbox }, 30, new Date(Date.now() - 2 * 3_600_000));
    const ids = [await queued(a.id, c1, sara), await queued(a.id, c2, sara), await queued(b.id, c3, zoe)];
    const results = await Promise.all(ids.map((id) => sendDelivery(id)));
    expect(results.sort()).toEqual(["sent", "waiting", "waiting"]);
    const { data: waiting } = await db().from("deliveries").select("mail_state, attempts, not_before").in("id", ids).eq("mail_state", "queued");
    expect(waiting).toEqual([expect.objectContaining({ attempts: 0, not_before: expect.any(String) }), expect.objectContaining({ attempts: 0, not_before: expect.any(String) })]);
  });
  it(`lets a workspace send at most ${MAIL_PER_WORKSPACE_PER_DAY} a day, and a person cause at most ${MAIL_PER_SENDER_PER_DAY} from all their workspaces`, async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    await sentEarlier(w.id, {}, MAIL_PER_WORKSPACE_PER_DAY, new Date(Date.now() - 3 * 3_600_000));
    expect(await sendDelivery(await queued(w.id, ann, sara))).toBe("waiting");
    const v = await ws(); const ben = await v.person("owner", { email: address("ben") }); const cleo = await v.contact({ email: address("cleo") });
    const other = await ws();
    await sentEarlier(other.id, { sender: ben }, MAIL_PER_SENDER_PER_DAY, new Date(Date.now() - 3_600_000));
    expect(await sendDelivery(await queued(v.id, cleo, ben))).toBe("waiting");
  });
  it("leaves emails that wait out a limit for later, so the job sends everyone else's", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    // More held back than one run takes, all older than the one that is due.
    const held: number[] = [];
    for (let i = 0; i < 8; i++) held.push(await queued(w.id, ann, sara));
    await db().from("deliveries").update({ not_before: new Date(Date.now() + 600_000).toISOString() }).in("id", held);
    // And one whose failed attempt's wait is not over.
    const retrying = await queued(w.id, ann, sara);
    await db().from("deliveries").update({ attempts: 2, last_attempt_at: new Date().toISOString() }).eq("id", retrying);
    const free = await queued(w.id, ann, sara);
    await sendWaiting(3);
    const { data } = await db().from("deliveries").select("id, mail_state").in("id", [...held, retrying, free]);
    expect(data!.filter((d) => d.mail_state === "sent").map((d) => d.id)).toEqual([free]);
  });
});

describe("form links", () => {
  it("are never stored with a Prompt, added only when it is emailed, and shown in the Outbox to its recipient only", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    const m = await w.metric(sara, { name: "Visits" }); const code = await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const d = await latest(w.id, ann, "prompt");
    expect(d.body).not.toContain(code);
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${await emailOf(ann)}"`)}`)).json() as { messages: { ID: string }[] };
    expect((await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { Text: string }).Text).toContain(`https://ziffr.example.test/submit/${code}`);
    // An older Prompt whose text holds the link: its sender sees it redacted, its recipient does not.
    await db().from("deliveries").update({ body: `Enter it in your form: https://ziffr.example.test/submit/${code}` }).eq("id", d.id);
    const bySender = (await connectorsView(w.actor(sara))).deliveries.find((x) => x.id === d.id)!;
    expect(bySender.body).not.toContain(code);
    const byRecipient = (await connectorsView(w.actor(ann, "member"))).deliveries.find((x) => x.id === d.id)!;
    expect(byRecipient.body).toContain(code);
  });
});
