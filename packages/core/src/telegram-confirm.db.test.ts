// Confirming a Contact's Telegram connection (spec 0016), against the database, a fake Bot API and Mailpit: a Start from
// a personal form's code connects nothing; the address on file gets a link for that Contact and that chat; its button
// connects once, within its minutes; the emails are limited; without an address the form says who can help.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { connectorsView } from "./page-data";
import { askContactToConfirm, confirmTelegram, TELEGRAM_CONFIRM_MINUTES, telegramConfirmView } from "./telegram-confirm";
import { setTelegramEnabled } from "./telegram-connection";
import { receiveTelegramUpdate } from "./telegram-inbound";
import { formTelegramLink, personOfTelegramUser, startTelegramLinkByForm, telegramChatOf } from "./telegram-people";
import { fakeTelegram } from "./test/fake-telegram";
import { rowsOf, workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const MAIL = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>" };
const saved: Record<string, string | undefined> = {};
let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => {
  tg = await fakeTelegram();
  for (const [k, v] of Object.entries(MAIL)) { saved[k] = process.env[k]; process.env[k] = v; }
});
afterAll(async () => {
  await tg.stop();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

let next = Date.now() * 100;
const id = () => ++next;
const codeOf = (url: string) => new URL(url).searchParams.get("start")!;
const message = (userId: number, text: string, from: Record<string, unknown> = { first_name: "Cleo", username: "cleo_tg" }) => ({ update_id: id(), message: { message_id: id() % 1_000_000, from: { id: userId, is_bot: false, ...from }, chat: { id: userId, type: "private" }, date: Math.floor(Date.now() / 1000), text } });
const said = (chat: number) => tg.of("sendMessage").filter((c) => c.params.chat_id === chat).map((c) => String(c.params.text));

/** The texts of the mail to an address with a subject, oldest first, read from Mailpit as the person would see them. */
async function mails(to: string, subject: string): Promise<string[]> {
  const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}" subject:"${subject}"`)}`)).json() as { messages: { ID: string }[] };
  const texts = await Promise.all(messages.map(async (m) => ((await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string }).Text));
  return texts.reverse();
}
const tokensTo = async (to: string) => (await mails(to, "Confirm Telegram for Ziffr")).map((t) => /\/api\/confirm-telegram\/([A-Za-z0-9_.-]+)/.exec(t)![1]);

async function setup(email: string | null = `cleo-${randomUUID().slice(0, 8)}@example.test`) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const owner = await w.person("owner");
  await setTelegramEnabled(w.actor(owner), true);
  const cleo = await w.contact(email ? { email } : { phone: "+49 30 1234567" });
  const metric = await w.metric(owner);
  const form = await w.token(metric.id, cleo);
  /** The form's Connect Telegram, then Start from an account. */
  const start = async (user: number, from?: Record<string, unknown>) => receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLinkByForm(form)).url)}`, from));
  return { w, owner, cleo, metric, form, email: email ?? "", start };
}

describe("connecting Telegram from a Contact's form", () => {
  it("connects only once the Contact confirms from their email, once, and tells them", async () => {
    const { w, owner, cleo, metric, form, email, start } = await setup();
    expect(await formTelegramLink(form)).toEqual({ linked: false, telegramOn: true, help: null });
    const user = id();
    expect(await start(user)).toBe("confirm_sent");
    // Nothing is connected: nothing goes to the chat as the Contact, and nothing from it counts as theirs.
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
    expect(await personOfTelegramUser(w.id, user)).toBeNull();
    await deliverPrompt({ metricId: metric.id, submitterId: cleo, senderId: owner });
    expect((await rowsOf("deliveries", { workspace_id: w.id, recipient_id: cleo, kind: "prompt" })).map((d) => d.connector)).not.toContain("telegram");

    const [token] = await tokensTo(email);
    const [mail] = await mails(email, "Confirm Telegram for Ziffr");
    const view = (await telegramConfirmView(token))!;
    expect(view).toEqual({ workspace: "Test", account: "“Cleo” (@cleo_tg)", check: expect.stringMatching(/^\d{4}$/) });
    expect(said(user).at(-1)).toContain(`the number ${view.check}`);
    expect(mail).toContain(`Number shown in that Telegram chat: ${view.check}`);
    // Only the token's hash is kept, and the email with the link is the Contact's alone: no Owner reads it in the Outbox.
    const kept = await db().from("telegram_link_codes").select("*").eq("workspace_id", w.id);
    expect(JSON.stringify(kept.data)).not.toContain(token.split(".").at(-1));
    expect(JSON.stringify((await connectorsView(w.actor(owner))).deliveries)).not.toContain("confirm-telegram");
    // Looking changes nothing.
    expect(await telegramChatOf(w.id, cleo)).toBeNull();

    expect(await confirmTelegram(token)).toEqual({ workspace: "Test" });
    expect(await telegramChatOf(w.id, cleo)).toEqual({ chatId: user, userId: user });
    expect(said(user).at(-1)).toMatch(/^Connected as Contact \S+ in Test/);
    expect((await mails(email, "Telegram is connected to Ziffr"))[0]).toContain("@cleo_tg");
    expect(await formTelegramLink(form)).toEqual({ linked: true, telegramOn: true, help: null });
    await expect(startTelegramLinkByForm(form)).rejects.toThrow(/disconnect first/);
    // Used: also after /stop the link does not connect again.
    expect(await confirmTelegram(token)).toBeNull();
    expect(await receiveTelegramUpdate(message(user, "/stop"))).toBe("unlinked");
    expect(await confirmTelegram(token)).toBeNull();
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
  });

  it("refuses a changed, old or replaced link, and one whose chat said /stop", async () => {
    const { w, cleo, email, start } = await setup();
    const first = id();
    await start(first);
    const [old] = await tokensTo(email);
    const [user, chat, ...rest] = old.split(".");
    expect(await confirmTelegram([String(id()), chat, ...rest].join("."))).toBeNull();
    expect(await confirmTelegram([user, String(id()), ...rest].join("."))).toBeNull();
    expect(await confirmTelegram("nonsense")).toBeNull();
    // A newer request ends the one before.
    const second = id();
    await start(second);
    const newer = (await tokensTo(email)).at(-1)!;
    expect(await telegramConfirmView(old)).toBeNull();
    expect(await telegramConfirmView(newer)).not.toBeNull();
    await db().from("telegram_link_codes").update({ created_at: new Date(Date.now() - (TELEGRAM_CONFIRM_MINUTES + 1) * 60_000).toISOString() }).eq("workspace_id", w.id).eq("person_id", cleo);
    expect(await confirmTelegram(newer)).toBeNull();
    const third = id();
    await start(third);
    const stopped = (await tokensTo(email)).at(-1)!;
    await receiveTelegramUpdate(message(third, "/stop"));
    expect(await confirmTelegram(stopped)).toBeNull();
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
  });

  it("refuses the link when the address on file changed, Telegram went off or the Contact was removed", async () => {
    const { w, owner, cleo, email, start } = await setup();
    await start(id());
    const [token] = await tokensTo(email);
    await db().from("contacts").update({ email: `other-${randomUUID().slice(0, 8)}@example.test` }).eq("workspace_id", w.id).eq("person_id", cleo);
    expect(await confirmTelegram(token)).toBeNull();
    await db().from("contacts").update({ email }).eq("workspace_id", w.id).eq("person_id", cleo);
    await setTelegramEnabled(w.actor(owner), false);
    expect(await confirmTelegram(token)).toBeNull();
    await setTelegramEnabled(w.actor(owner), true);
    expect(await telegramConfirmView(token)).not.toBeNull();
    await db().from("contacts").delete().eq("workspace_id", w.id).eq("person_id", cleo);
    expect(await confirmTelegram(token)).toBeNull();
    expect(await rowsOf("telegram_links", { workspace_id: w.id })).toEqual([]);
  });

  it("emails a Contact only a few times an hour, however often the form asks", async () => {
    const { w, cleo, email, start } = await setup();
    for (let i = 0; i < 3; i++) expect(await start(id())).toBe("confirm_sent");
    expect(await start(id())).toBe("refused");
    expect(await askContactToConfirm(w.id, cleo, { userId: id(), chatId: id(), from: {} })).toEqual({ linked: false, why: "limited" });
    expect(await tokensTo(email)).toHaveLength(3);
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
  });

  it("cannot start without an address on file, without email or in a trial, and says who can help", async () => {
    const without = await setup(null);
    expect((await formTelegramLink(without.form))!.help).toMatch(/no email address for you.*Owner or Admin/);
    await expect(startTelegramLinkByForm(without.form)).rejects.toThrow(/no email address for you/);
    // Also for a code that is already waiting when the address is gone.
    expect(await askContactToConfirm(without.w.id, without.cleo, { userId: id(), chatId: id(), from: {} })).toEqual({ linked: false, why: "no_email" });

    const { w, form } = await setup();
    const smtp = process.env.ZIFFR_SMTP_URL;
    delete process.env.ZIFFR_SMTP_URL;
    try {
      await expect(startTelegramLinkByForm(form)).rejects.toThrow(/cannot send the email/);
    } finally {
      process.env.ZIFFR_SMTP_URL = smtp;
    }
    await w.trial(new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
    await expect(startTelegramLinkByForm(form)).rejects.toThrow(/trial workspace sends nothing to Contacts/);
  });

  it("keeps no address or link from the account's own name", async () => {
    const { email, start } = await setup();
    await start(id(), { first_name: "Cancel at https://evil.example/x", last_name: "<b>now</b>" });
    const [token] = await tokensTo(email);
    const { account } = (await telegramConfirmView(token))!;
    expect(account).toBe("“Cancel at https evil example x b now b”");
    expect((await mails(email, "Confirm Telegram for Ziffr"))[0]).not.toMatch(/evil\.example|<b>/);
  });
});
