// A fake Telegram Bot API for tests (spec 0016, testing decisions): a real HTTP server on this machine that answers
// the methods Ziffr calls the way Telegram documents them (POST /bot<token>/<method>, JSON in, { ok, result } out),
// and records every call. The core reaches it through ZIFFR_TELEGRAM_API_URL, as it would reach api.telegram.org;
// nothing inside the core is replaced.
import { createServer, type Server } from "node:http";
import { forgetTelegramBot } from "../telegram-connection";

/** One call the fake received: the method, its JSON body, and whether it came with the right token. */
export type FakeTelegramCall = { method: string; params: Record<string, unknown>; tokenOk: boolean };

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
  const bot = { id: 7000000001, is_bot: true, first_name: "Ziffr", username: "ziffr_test_bot" };
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const m = /^\/bot([^/]+)\/([A-Za-z]+)$/.exec(String(req.url));
      const method = m?.[2] ?? "";
      let params: Record<string, unknown> = {};
      try { params = body ? JSON.parse(body) : {}; } catch { params = {}; }
      const tokenOk = m?.[1] === settings.ZIFFR_TELEGRAM_BOT_TOKEN;
      calls.push({ method, params, tokenOk });
      const send = (status: number, json: Record<string, unknown>) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
      if (!tokenOk) return send(401, { ok: false, error_code: 401, description: "Unauthorized" });
      const f = fails[method];
      if (f && f.times > 0) {
        f.times--;
        return send(f.code, { ok: false, error_code: f.code, description: "Fake failure", ...(f.retryAfter ? { parameters: { retry_after: f.retryAfter } } : {}) });
      }
      switch (method) {
        case "getMe": return send(200, { ok: true, result: bot });
        case "setWebhook": case "deleteWebhook": return send(200, { ok: true, result: true });
        case "sendMessage": return send(200, { ok: true, result: { message_id: messageId++, chat: { id: params.chat_id, type: "private" }, date: Math.floor(Date.now() / 1000), text: params.text } });
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
