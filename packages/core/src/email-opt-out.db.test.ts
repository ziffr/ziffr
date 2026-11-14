// Opting out of email and the sending limits, against the real database and the local Mailpit (spec 0004, ticket
// #74): one click stops Prompts and reminders by email for that person and workspace and tells the Metric owners;
// a workspace sends at most 500 a day and a person gets at most 20 an hour, also under parallel sends.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { emailOptedOut, optBackIn, optOutByToken, unsubscribeTokenValid } from "./email-opt-out";
import { MAIL_PER_RECIPIENT_PER_HOUR, MAIL_PER_SENDER_PER_DAY, MAIL_PER_WORKSPACE_PER_DAY, sendDelivery, sendWaiting } from "./mail";
import { connectorsView } from "./page-data";
import { ask } from "./questions";
import { workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
const latest = async (wsId: string, recipient: string, kind?: string) => {
  let q = db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient);
  if (kind) q = q.eq("kind", kind);
  return (await q.order("id", { ascending: false }).limit(1).single()).data!;
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
    expect(await optOutByToken(first.unsubscribe_token)).toBe(true);
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(true);
    const notice = await latest(w.id, sara, "notice");
    expect(notice.subject).toMatch(/stopped reminders by email/);
    // Again: nothing more, and nobody is told twice.
    expect(await optOutByToken(first.unsubscribe_token)).toBe(true);
    const { count } = await db().from("deliveries").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("recipient_id", sara).eq("kind", "notice");
    expect(count).toBe(1);

    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    expect(await latest(w.id, ann, "prompt")).toMatchObject({ mail_state: "failed", last_error: "They stopped reminders by email." });
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
    const held = await queued(w.id, ann, sara);
    await db().from("deliveries").update({ not_before: new Date(Date.now() + 600_000).toISOString() }).eq("id", held);
    const free = await queued(w.id, ann, sara);
    await sendWaiting(1);
    const { data } = await db().from("deliveries").select("id, mail_state").in("id", [held, free]).order("id");
    expect(data).toEqual([{ id: held, mail_state: "queued" }, { id: free, mail_state: "sent" }]);
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
