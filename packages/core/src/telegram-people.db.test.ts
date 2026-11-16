// People linking themselves to Telegram (spec 0016, ticket #25), against the database and a fake Bot API: a one-time
// code made in Ziffr, sent back by Telegram as /start in a private chat, links once and only then; /stop and blocking
// the bot unlink; each update counts once.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { setTelegramEnabled } from "./telegram-connection";
import { receiveTelegramUpdate } from "./telegram-inbound";
import { formTelegramLink, myTelegramLink, personOfTelegramUser, startTelegramLink, startTelegramLinkByForm, telegramChatOf, unlinkTelegram } from "./telegram-people";
import { fakeTelegram } from "./test/fake-telegram";
import { workspace } from "./test/db-fixtures";

let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => { tg = await fakeTelegram(); });
afterAll(async () => { await tg.stop(); });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

// Update and Telegram ids unique per run, so leftovers of an earlier run never count as duplicates.
let next = Date.now() * 100;
const id = () => ++next;
const codeOf = (url: string) => new URL(url).searchParams.get("start")!;
const message = (userId: number, text: string, chatType = "private", chatId = userId) => ({ update_id: id(), message: { message_id: id() % 1_000_000, from: { id: userId, is_bot: false, first_name: "Cleo" }, chat: { id: chatId, type: chatType }, date: Math.floor(Date.now() / 1000), text } });

async function telegramOn() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const owner = await w.person("owner");
  await setTelegramEnabled(w.actor(owner), true);
  return { w, owner };
}

describe("linking Telegram", () => {
  it("links a member once, with a link that opens the bot, and says so in the chat", async () => {
    const { w } = await telegramOn();
    const sara = await w.person("member");
    const { url, minutes } = await startTelegramLink(w.actor(sara, "member"));
    expect(minutes).toBe(10);
    expect(url).toMatch(/^https:\/\/t\.me\/ziffr_test_bot\?start=[A-Za-z0-9_-]{43}$/);
    // Only the code's hash is kept.
    const { data: codes } = await db().from("telegram_link_codes").select("code_hash").eq("workspace_id", w.id);
    expect(codes!.map((c) => c.code_hash)).not.toContain(codeOf(url));

    const user = id();
    expect(await receiveTelegramUpdate(message(user, `/start ${codeOf(url)}`))).toBe("linked");
    expect(await myTelegramLink(w.actor(sara, "member"))).not.toBeNull();
    expect(await telegramChatOf(w.id, sara)).toEqual({ chatId: user, userId: user });
    expect(await personOfTelegramUser(w.id, user)).toBe(sara);
    expect(String(tg.of("sendMessage").at(-1)!.params.text)).toMatch(/^Connected: you get Ziffr messages for Test here/);

    // The same code again links nobody, also not someone else.
    expect(await receiveTelegramUpdate(message(id(), `/start ${codeOf(url)}`))).toBe("refused");
  });

  it("refuses an old code, a group chat, and a code when Telegram is off or the person left", async () => {
    const { w, owner } = await telegramOn();
    const sara = await w.person("member");
    const old = await startTelegramLink(w.actor(sara, "member"));
    await db().from("telegram_link_codes").update({ created_at: new Date(Date.now() - 11 * 60_000).toISOString() }).eq("workspace_id", w.id).eq("person_id", sara);
    expect(await receiveTelegramUpdate(message(id(), `/start ${codeOf(old.url)}`))).toBe("refused");

    const group = await startTelegramLink(w.actor(sara, "member"));
    expect(await receiveTelegramUpdate(message(id(), `/start ${codeOf(group.url)}`, "group", -id()))).toBe("ignored");

    const off = await startTelegramLink(w.actor(sara, "member"));
    await setTelegramEnabled(w.actor(owner), false);
    expect(await receiveTelegramUpdate(message(id(), `/start ${codeOf(off.url)}`))).toBe("refused");
    await expect(startTelegramLink(w.actor(sara, "member"))).rejects.toThrow(/not on/);
    expect(await myTelegramLink(w.actor(sara, "member"))).toBeNull();
  });

  it("makes one Telegram account one person per workspace: the account that proved a code wins", async () => {
    const { w } = await telegramOn();
    const sara = await w.person("member");
    const ben = await w.person("member");
    const user = id();
    await receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLink(w.actor(sara, "member"))).url)}`));
    await receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLink(w.actor(ben, "member"))).url)}`));
    expect(await personOfTelegramUser(w.id, user)).toBe(ben);
    expect(await myTelegramLink(w.actor(sara, "member"))).toBeNull();
  });

  it("links a Contact from their form page, and their form shows it", async () => {
    const { w, owner } = await telegramOn();
    const cleo = await w.contact({ email: "cleo@example.test" });
    const metric = await w.metric(owner);
    const form = await w.token(metric.id, cleo);
    expect(await formTelegramLink(form)).toEqual({ linked: false, telegramOn: true });
    const { url } = await startTelegramLinkByForm(form);
    const user = id();
    expect(await receiveTelegramUpdate(message(user, `/start ${codeOf(url)}`))).toBe("linked");
    expect(await formTelegramLink(form)).toEqual({ linked: true, telegramOn: true });
    expect(await personOfTelegramUser(w.id, user)).toBe(cleo);
    await expect(startTelegramLinkByForm("tk-test-unknown-code")).rejects.toThrow(/does not work/);
  });

  it("unlinks with /stop everywhere, by blocking the bot, and in Ziffr", async () => {
    const { w } = await telegramOn();
    const sara = await w.person("member");
    const user = id();
    await receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLink(w.actor(sara, "member"))).url)}`));
    expect(await receiveTelegramUpdate(message(user, "/stop"))).toBe("unlinked");
    expect(await myTelegramLink(w.actor(sara, "member"))).toBeNull();

    await receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLink(w.actor(sara, "member"))).url)}`));
    const blocked = { update_id: id(), my_chat_member: { chat: { id: user, type: "private" }, from: { id: user, is_bot: false }, date: 0, old_chat_member: { status: "member" }, new_chat_member: { status: "kicked" } } };
    expect(await receiveTelegramUpdate(blocked)).toBe("blocked");
    expect(await telegramChatOf(w.id, sara)).toBeNull();

    await receiveTelegramUpdate(message(user, `/start ${codeOf((await startTelegramLink(w.actor(sara, "member"))).url)}`));
    await unlinkTelegram(w.actor(sara, "member"));
    expect(await telegramChatOf(w.id, sara)).toBeNull();
  });

  it("counts each update once, and never links in the demo", async () => {
    const { w } = await telegramOn();
    const sara = await w.person("member");
    const update = message(id(), `/start ${codeOf((await startTelegramLink(w.actor(sara, "member"))).url)}`);
    expect(await receiveTelegramUpdate(update)).toBe("linked");
    expect(await receiveTelegramUpdate(update)).toBe("duplicate");
    await expect(startTelegramLink({ personId: "demo-sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" })).rejects.toThrow(/demo/);
  });
});
