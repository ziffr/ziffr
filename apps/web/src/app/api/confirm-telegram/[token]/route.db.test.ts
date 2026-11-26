// /api/confirm-telegram/{token} over HTTP (spec 0016): a GET only says what confirming would do (a mail scanner opening
// the link connects nothing), the Confirm button's POST connects once, and an unknown, used or malformed link is the same
// 404 page. The rest is in packages/core/src/telegram-confirm.db.test.ts.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setTelegramEnabled } from "@ziffr/core/telegram-connection";
import { receiveTelegramUpdate } from "@ziffr/core/telegram-inbound";
import { startTelegramLinkByForm, telegramChatOf } from "@ziffr/core/telegram-people";
import { fakeTelegram } from "@ziffr/core/test/fake-telegram";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET, POST } from "./route";

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
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const req = (method: string) => new Request("http://ziffr.test/api/confirm-telegram/t", { method });

describe("/api/confirm-telegram/{token}", () => {
  it("shows on GET, connects on POST once, and answers 404 for any link that does not work", async () => {
    const w = await workspace("Field <Team>"); cleanups.push(w.cleanup);
    const owner = await w.person("owner");
    await setTelegramEnabled(w.actor(owner), true);
    const email = `cleo-${randomUUID().slice(0, 8)}@example.test`;
    const cleo = await w.contact({ email });
    const form = await w.token((await w.metric(owner, { name: "Secret sales" })).id, cleo);
    const user = Date.now() * 100;
    const code = new URL((await startTelegramLinkByForm(form)).url).searchParams.get("start")!;
    await receiveTelegramUpdate({ update_id: user, message: { message_id: 1, from: { id: user, is_bot: false, first_name: "Cleo" }, chat: { id: user, type: "private" }, date: 0, text: `/start ${code}` } });
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"Confirm Telegram"`)}`)).json() as { messages: { ID: string }[] };
    const text = ((await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string }).Text;
    const token = /\/api\/confirm-telegram\/([A-Za-z0-9_.-]+)/.exec(text)![1];

    const asked = await GET(req("GET"), ctx(token));
    expect(asked.status).toBe(200);
    const html = await asked.text();
    expect(html).toMatch(/<form method="post">/);
    expect(html).toContain("Field &lt;Team&gt;");
    expect(html).toContain("“Cleo”");
    expect(html).not.toMatch(/Secret sales|cleo-/);
    expect(await telegramChatOf(w.id, cleo)).toBeNull();
    expect((await POST(req("POST"), ctx(token))).status).toBe(200);
    expect(await telegramChatOf(w.id, cleo)).toEqual({ chatId: user, userId: user });
    expect((await POST(req("POST"), ctx(token))).status).toBe(404);
    expect((await GET(req("GET"), ctx(token))).status).toBe(404);
    expect((await POST(req("POST"), ctx("nonsense"))).status).toBe(404);
  });
});
