// A fake Telegram Bot API for tests (spec 0016, testing decisions): a real HTTP server on this machine that answers
// the methods Ziffr calls the way Telegram documents them (POST /bot<token>/<method>, JSON in, { ok, result } out),
// and records every call. The core reaches it through ZIFFR_TELEGRAM_API_URL, as it would reach api.telegram.org;
// nothing inside the core is replaced.
import { createServer, type Server } from "node:http";
import { forgetTelegramBot } from "../telegram-connection";

/** One call the fake received: the method, its JSON body, whether it came with a token the fake knows, and the bot's
 * numeric id from that token (never the token itself). */
export type FakeTelegramCall = { method: string; params: Record<string, unknown>; tokenOk: boolean; botId: string };

/** A second made-up bot the fake also knows, for a token replaced on the Installation Settings page. */
export const OTHER_BOT_TOKEN = "7000000002:AAF-other-test-token-for-ziffr-telegram";

/** The settings that turn Telegram on for a test, pointing at the fake. */
export const TELEGRAM_SETTINGS = {
  ZIFFR_TELEGRAM_BOT_TOKEN: "7000000001:AAF-test-token-for-ziffr-telegram-tests",
  ZIFFR_SECRETS_KEY: Buffer.alloc(32, 7).toString("base64"),
  ZIFFR_SITE_URL: "https://ziffr.example.test",
};

/** Starts the fake and sets the Telegram settings; `stop` ends it and puts the settings back. */
export async function fakeTelegram(over: Partial<Record<keyof typeof TELEGRAM_SETTINGS | "ZIFFR_TELEGRAM_POLLING", string>> = {}) {
  const settings: Record<string, string> = { ...TELEGRAM_SETTINGS, ...over };
  const calls: FakeTelegramCall[] = [];
  const fails: Record<string, { code: number; retryAfter?: number; times: number }> = {};
  let messageId = 1000;
  // Where each bot's webhook points, by the bot's id, and an error Telegram reports about reaching it.
  const webhook: Record<string, string> = {};
  let lastError: string | null = null;
  const bot = { id: 7000000001, is_bot: true, first_name: "Ziffr", username: "ziffr_test_bot" };
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const m = /^\/bot([^/]+)\/([A-Za-z]+)$/.exec(String(req.url));
      const method = m?.[2] ?? "";
      let params: Record<string, unknown> = {};
      try { params = body ? JSON.parse(body) : {}; } catch { params = {}; }
      const botId = String(m?.[1] ?? "").split(":")[0];
      const tokenOk = m?.[1] === settings.ZIFFR_TELEGRAM_BOT_TOKEN || m?.[1] === OTHER_BOT_TOKEN;
      calls.push({ method, params, tokenOk, botId });
      const send = (status: number, json: Record<string, unknown>) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
      if (!tokenOk) return send(401, { ok: false, error_code: 401, description: "Unauthorized" });
      const f = fails[method];
      if (f && f.times > 0) {
        f.times--;
        return send(f.code, { ok: false, error_code: f.code, description: "Fake failure", ...(f.retryAfter ? { parameters: { retry_after: f.retryAfter } } : {}) });
      }
      switch (method) {
        case "getMe": return send(200, { ok: true, result: botId === "7000000002" ? { ...bot, id: 7000000002, username: "ziffr_other_bot" } : bot });
        case "getWebhookInfo": return send(200, { ok: true, result: { url: webhook[botId] ?? "", pending_update_count: 0, ...(lastError ? { last_error_date: Math.floor(Date.now() / 1000), last_error_message: lastError } : {}) } });
        case "setWebhook": webhook[botId] = String(params.url ?? ""); return send(200, { ok: true, result: true });
        case "deleteWebhook": delete webhook[botId]; return send(200, { ok: true, result: true });
        case "sendMessage": return send(200, { ok: true, result: { message_id: messageId++, chat: { id: params.chat_id, type: "private" }, date: Math.floor(Date.now() / 1000), text: params.text } });
        case "editMessageText": return send(200, { ok: true, result: { message_id: params.message_id, chat: { id: params.chat_id, type: "private" }, date: Math.floor(Date.now() / 1000), text: params.text } });
        case "answerCallbackQuery": return send(200, { ok: true, result: true });
        case "getUpdates": return send(200, { ok: true, result: [] });
        default: return send(404, { ok: false, error_code: 404, description: "Not Found" });
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries({ ...settings, ZIFFR_TELEGRAM_API_URL: `http://127.0.0.1:${port}` })) { saved[k] = process.env[k]; process.env[k] = v; }
  forgetTelegramBot();
  return {
    calls,
    bot,
    /** Calls of one method. */
    of: (method: string) => calls.filter((c) => c.method === method),
    /** Where each bot's webhook points now, by the bot's numeric id. */
    webhook,
    /** Makes getWebhookInfo report this error about reaching the webhook. */
    reportError: (message: string | null) => { lastError = message; },
    /** The next `times` calls of a method fail with this HTTP code (and for 429, `retry_after`). */
    fail: (method: string, how: { code: number; retryAfter?: number }, times = 1) => { fails[method] = { ...how, times }; },
    stop: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
      forgetTelegramBot();
    },
  };
}
