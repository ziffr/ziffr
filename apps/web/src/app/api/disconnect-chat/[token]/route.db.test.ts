// /api/disconnect-chat/{token} over HTTP (spec 0016): a GET only asks (a mail scanner opening the link disconnects
// nothing), the Disconnect button's POST ends that connection with no sign-in, using it again says it has ended, and a
// link Ziffr did not sign is a 404. The rest is in packages/core/src/connection-notices.db.test.ts.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setTelegramEnabled } from "@ziffr/core/telegram-connection";
import { receiveTelegramUpdate } from "@ziffr/core/telegram-inbound";
import { startTelegramLink, telegramChatOf } from "@ziffr/core/telegram-people";
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
const req = (method: string) => new Request("http://ziffr.test/api/disconnect-chat/t", { method });

describe("/api/disconnect-chat/{token}", () => {
  it("asks on GET, disconnects on POST, and answers 404 for a link Ziffr did not sign", async () => {
    const w = await workspace("Field <Team>"); cleanups.push(w.cleanup);
    const owner = await w.person("owner");
    await setTelegramEnabled(w.actor(owner), true);
    const email = `sara-${randomUUID().slice(0, 8)}@example.test`;
    const sara = await w.person("member", { email });
    const user = Date.now() * 100;
    const code = new URL((await startTelegramLink(w.actor(sara, "member"))).url).searchParams.get("start")!;
    await receiveTelegramUpdate({ update_id: user, message: { message_id: 1, from: { id: user, is_bot: false, first_name: "Sara" }, chat: { id: user, type: "private" }, date: 0, text: `/start ${code}` } });
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"Telegram was connected"`)}`)).json() as { messages: { ID: string }[] };
    const text = ((await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string }).Text;
    const token = /\/api\/disconnect-chat\/([A-Za-z0-9_.-]+)/.exec(text)![1];

    const asked = await GET(req("GET"), ctx(token));
    expect(asked.status).toBe(200);
    const html = await asked.text();
    expect(html).toMatch(/<form method="post">/);
    expect(html).toContain("Field &lt;Team&gt;");
    expect(html).not.toMatch(/sara-/);
    expect(await telegramChatOf(w.id, sara)).not.toBeNull();
    expect(await (await POST(req("POST"), ctx(token))).text()).toContain("Disconnected");
    expect(await telegramChatOf(w.id, sara)).toBeNull();
    expect(await (await GET(req("GET"), ctx(token))).text()).toContain("Already disconnected");
    expect((await GET(req("GET"), ctx("nonsense"))).status).toBe(404);
    expect((await POST(req("POST"), ctx(`${token.slice(0, -2)}aa`))).status).toBe(404);
  });
});
