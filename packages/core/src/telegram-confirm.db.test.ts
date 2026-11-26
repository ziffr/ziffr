// Confirming a Contact's Telegram connection (spec 0016), against the database, a fake Bot API and Mailpit: a Start from
// a personal form's code connects nothing; the address on file gets a link for that Contact and that chat; typing the
// number only that chat was told, and the button, connect once, within its minutes; wrong numbers end the request; the
// emails are limited; without an address the form says who can help.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { connectorsView } from "./page-data";
import { askContactToConfirm, confirmTelegram, TELEGRAM_CONFIRM_MINUTES, TELEGRAM_CONFIRM_TRIES, telegramConfirmView } from "./telegram-confirm";
import { setTelegramEnabled } from "./telegram-connection";
import { receiveTelegramUpdate } from "./telegram-inbound";
import { formTelegramLink, personOfTelegramUser, startTelegramLink, startTelegramLinkByForm, telegramChatOf } from "./telegram-people";
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
/** The number the bot last told a chat. */
const numberIn = (chat: number) => said(chat).map((t) => /Your number is (\d{4})\./.exec(t)?.[1]).filter(Boolean).at(-1)!;
/** Four digits that are not these. */
const other = (digits: string, by = 1) => String((Number(digits) + by) % 10_000).padStart(4, "0");

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
  it("connects only once the Contact types the chat's number on the page their email links to, once, and tells them", async () => {
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
    const number = numberIn(user);
    expect(said(user).at(-1)).toMatch(/Ziffr emailed the address/);
    const view = (await telegramConfirmView(token))!;
    expect(view).toEqual({ workspace: "Test", account: "“Cleo” (@cleo_tg)", triesLeft: TELEGRAM_CONFIRM_TRIES });
    // The number is told to the chat alone: not in the email, not in its link.
    expect(mail.replace(token, "")).not.toContain(number);
    expect(token.split(".")).not.toContain(number);
    // Only a hash of the token is kept, and the email with the link is the Contact's alone: no Owner reads it in the Outbox.
    const kept = await db().from("telegram_link_codes").select("*").eq("workspace_id", w.id);
    expect(JSON.stringify(kept.data)).not.toContain(token.split(".").at(-1));
    expect(JSON.stringify((await connectorsView(w.actor(owner))).deliveries)).not.toContain("confirm-telegram");
    // Looking changes nothing, and what is not four digits costs no try.
    for (const nothing of [null, "", "12", "abcd", "12345"]) expect(await confirmTelegram(token, nothing)).toEqual({ connected: false, triesLeft: TELEGRAM_CONFIRM_TRIES });
    expect(await telegramChatOf(w.id, cleo)).toBeNull();

    expect(await confirmTelegram(token, ` ${number.slice(0, 2)} ${number.slice(2)} `)).toEqual({ connected: true, workspace: "Test" });
    expect(await telegramChatOf(w.id, cleo)).toEqual({ chatId: user, userId: user });
    expect(said(user).at(-1)).toMatch(/^Connected as Contact \S+ in Test/);
    expect((await mails(email, "Telegram is connected to Ziffr"))[0]).toContain("@cleo_tg");
    expect(await formTelegramLink(form)).toEqual({ linked: true, telegramOn: true, help: null });
    await expect(startTelegramLinkByForm(form)).rejects.toThrow(/disconnect first/);
    // Used: also after /stop the link does not connect again.
    expect(await confirmTelegram(token, number)).toBeNull();
    expect(await receiveTelegramUpdate(message(user, "/stop"))).toBe("unlinked");
    expect(await confirmTelegram(token, number)).toBeNull();
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
  });

  it("connects neither chat when a second request was started meanwhile and the Contact types their own number", async () => {
    const { w, cleo, email, start } = await setup();
    const mine = id();
    await start(mine);
    const [first] = await tokensTo(email);
    const second = id();
    await start(second);
    const latest = (await tokensTo(email)).at(-1)!;
    const own = numberIn(mine) === numberIn(second) ? other(numberIn(second)) : numberIn(mine);
    // The earlier link has ended; the latest belongs to the other chat, and the Contact's number does not confirm it.
    expect(await confirmTelegram(first, own)).toBeNull();
    expect(await confirmTelegram(latest, own)).toEqual({ connected: false, triesLeft: TELEGRAM_CONFIRM_TRIES - 1 });
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
    expect(await personOfTelegramUser(w.id, second)).toBeNull();
    expect(await personOfTelegramUser(w.id, mine)).toBeNull();
    // Starting again works with the Contact's own chat.
    await start(mine);
    expect(await confirmTelegram((await tokensTo(email)).at(-1)!, numberIn(mine))).toMatchObject({ connected: true });
    expect(await telegramChatOf(w.id, cleo)).toEqual({ chatId: mine, userId: mine });
  });

  it("ends a request after three wrong numbers, also when they are sent at once", async () => {
    const { w, cleo, email, start } = await setup();
    const user = id();
    await start(user);
    const [token] = await tokensTo(email);
    const number = numberIn(user);
    expect(await confirmTelegram(token, other(number, 1))).toEqual({ connected: false, triesLeft: 2 });
    expect((await telegramConfirmView(token))!.triesLeft).toBe(2);
    expect(await confirmTelegram(token, other(number, 2))).toEqual({ connected: false, triesLeft: 1 });
    expect(await confirmTelegram(token, other(number, 3))).toEqual({ connected: false, triesLeft: 0 });
    expect(await telegramConfirmView(token)).toBeNull();
    expect(await confirmTelegram(token, number)).toBeNull();

    await start(user);
    const again = (await tokensTo(email)).at(-1)!;
    const wrong = await Promise.all(Array.from({ length: 12 }, (_, i) => confirmTelegram(again, other(numberIn(user), i + 1))));
    // However many arrive together, no more than the tries there are get compared.
    expect(wrong.filter((r) => r !== null).length).toBeLessThanOrEqual(TELEGRAM_CONFIRM_TRIES);
    expect(wrong.some((r) => r?.connected)).toBe(false);
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
  });

  it("refuses a changed, old or replaced link, and one whose chat said /stop", async () => {
    const { w, cleo, email, start } = await setup();
    const first = id();
    await start(first);
    const [old] = await tokensTo(email);
    const [user, chat, ...rest] = old.split(".");
    expect(await confirmTelegram([String(id()), chat, ...rest].join("."), numberIn(first))).toBeNull();
    expect(await confirmTelegram([user, String(id()), ...rest].join("."), numberIn(first))).toBeNull();
    expect(await confirmTelegram("nonsense", numberIn(first))).toBeNull();
    // A newer request ends the one before.
    const second = id();
    await start(second);
    const newer = (await tokensTo(email)).at(-1)!;
    expect(await telegramConfirmView(old)).toBeNull();
    expect(await telegramConfirmView(newer)).not.toBeNull();
    await db().from("telegram_link_codes").update({ created_at: new Date(Date.now() - (TELEGRAM_CONFIRM_MINUTES + 1) * 60_000).toISOString() }).eq("workspace_id", w.id).eq("person_id", cleo);
    expect(await confirmTelegram(newer, numberIn(second))).toBeNull();
    const third = id();
    await start(third);
    const stopped = (await tokensTo(email)).at(-1)!;
    await receiveTelegramUpdate(message(third, "/stop"));
    expect(await confirmTelegram(stopped, numberIn(third))).toBeNull();
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
  });

  it("refuses the link when the address on file changed, Telegram went off or the Contact was removed", async () => {
    const { w, owner, cleo, email, start } = await setup();
    const user = id();
    await start(user);
    const [token] = await tokensTo(email);
    await db().from("contacts").update({ email: `other-${randomUUID().slice(0, 8)}@example.test` }).eq("workspace_id", w.id).eq("person_id", cleo);
    expect(await confirmTelegram(token, numberIn(user))).toBeNull();
    await db().from("contacts").update({ email }).eq("workspace_id", w.id).eq("person_id", cleo);
    await setTelegramEnabled(w.actor(owner), false);
    expect(await confirmTelegram(token, numberIn(user))).toBeNull();
    await setTelegramEnabled(w.actor(owner), true);
    expect(await telegramConfirmView(token)).not.toBeNull();
    await db().from("contacts").delete().eq("workspace_id", w.id).eq("person_id", cleo);
    expect(await confirmTelegram(token, numberIn(user))).toBeNull();
    expect(await rowsOf("telegram_links", { workspace_id: w.id })).toEqual([]);
  });

  it("moves an account that is someone else's here only when the Contact's connection is made", async () => {
    const { w, cleo, email, start } = await setup();
    const sara = await w.person("member");
    const user = id();
    await receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLink(w.actor(sara, "member"))).url)}`));
    await start(user);
    const [token] = await tokensTo(email);
    expect(await confirmTelegram(token, other(numberIn(user)))).toMatchObject({ connected: false });
    expect(await personOfTelegramUser(w.id, user)).toBe(sara);
    expect(await confirmTelegram(token, numberIn(user))).toMatchObject({ connected: true });
    expect(await personOfTelegramUser(w.id, user)).toBe(cleo);
    expect(await telegramChatOf(w.id, sara)).toBeNull();
  });

  it("emails a Contact only a few times an hour, however often the form asks", async () => {
    const { w, cleo, email, start } = await setup();
    for (let i = 0; i < 3; i++) expect(await start(id())).toBe("confirm_sent");
    expect(await start(id())).toBe("refused");
    expect(await askContactToConfirm(w.id, cleo, { userId: id(), chatId: id(), from: {} })).toEqual({ linked: false, why: "limited" });
    expect(await tokensTo(email)).toHaveLength(3);
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
  });

  it("emails the confirmation also to a Contact who stopped requests by email, since they asked for it", async () => {
    const { w, cleo, email, start } = await setup();
    await db().from("email_opt_outs").insert({ workspace_id: w.id, person_id: cleo });
    const user = id();
    await start(user);
    expect(said(user).at(-1)).toMatch(/Ziffr emailed the address/);
    expect(await tokensTo(email)).toHaveLength(1);
  });

  it("never says an email left when it did not: it is tried again, or nothing waits", async () => {
    const { w, cleo, form } = await setup();
    const smtp = process.env.ZIFFR_SMTP_URL;
    const attempts = process.env.ZIFFR_LIMIT_SEND_ATTEMPTS;
    // A mail server that is not there.
    process.env.ZIFFR_SMTP_URL = "smtp://127.0.0.1:1";
    const start = async (user: number) => receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLinkByForm(form)).url)}`));
    try {
      const first = id();
      expect(await start(first)).toBe("confirm_sent");
      expect(said(first).at(-1)).toMatch(/could not send the email .* yet, and tries again/);
      expect(said(first).at(-1)).not.toMatch(/Ziffr emailed/);
      process.env.ZIFFR_LIMIT_SEND_ATTEMPTS = "1";
      expect(await start(id())).toBe("refused");
      expect(await askContactToConfirm(w.id, cleo, { userId: id(), chatId: id(), from: {} })).toEqual({ linked: false, why: "no_email" });
      expect(await rowsOf("telegram_link_codes", { workspace_id: w.id })).toEqual([]);
    } finally {
      process.env.ZIFFR_SMTP_URL = smtp;
      if (attempts === undefined) delete process.env.ZIFFR_LIMIT_SEND_ATTEMPTS; else process.env.ZIFFR_LIMIT_SEND_ATTEMPTS = attempts;
    }
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
