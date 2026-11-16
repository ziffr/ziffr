// POST /api/telegram/updates over HTTP (spec 0016, ticket #25): only with the secret this Ziffr registered, at most
// 64 KB, JSON; each update counts once. The updates themselves are tested in the core (telegram-people.db.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@ziffr/core/db";
import { telegramWebhookSecret } from "@ziffr/core/telegram-api";
import { fakeTelegram } from "@ziffr/core/test/fake-telegram";
import { POST } from "./route";

let tg: Awaited<ReturnType<typeof fakeTelegram>>;
beforeAll(async () => { tg = await fakeTelegram(); });
afterAll(async () => { await tg.stop(); });

const post = (body: string, secret?: string | null, headers: Record<string, string> = {}) =>
  POST(new Request("http://ziffr.test/api/telegram/updates", { method: "POST", body, headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}), ...headers } }));
let next = Date.now() * 100 + 50;

describe("POST /api/telegram/updates", () => {
  it("answers a bare 404 without the secret or with a wrong one", async () => {
    const body = JSON.stringify({ update_id: ++next, message: { text: "/start" } });
    for (const secret of [null, "wrong", `${telegramWebhookSecret()}x`]) {
      const res = await post(body, secret);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    }
  });

  it("refuses more than 64 KB, and what is not JSON", async () => {
    expect((await post("x".repeat(65 * 1024), telegramWebhookSecret())).status).toBe(413);
    expect((await post("{}", telegramWebhookSecret(), { "content-length": String(70 * 1024) })).status).toBe(413);
    expect((await post("not json", telegramWebhookSecret())).status).toBe(400);
  });

  it("takes an update with the secret, once", async () => {
    const update = { update_id: ++next, message: { message_id: 1, from: { id: next, is_bot: false }, chat: { id: next, type: "private" }, date: 0, text: "/start" } };
    expect((await post(JSON.stringify(update), telegramWebhookSecret())).status).toBe(200);
    expect((await post(JSON.stringify(update), telegramWebhookSecret())).status).toBe(200);
    const { data } = await db().from("telegram_updates").select("outcome").eq("update_id", update.update_id);
    expect(data).toEqual([{ outcome: "hint" }]);
  });
});
