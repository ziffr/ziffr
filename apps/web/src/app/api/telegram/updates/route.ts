// POST /api/telegram/updates (spec 0016, tickets #25 and #27): Telegram's webhook. Taken only with the secret this
// Ziffr registered (X-Telegram-Bot-Api-Secret-Token, checked in constant time in the core) and at most 64 KB; anything
// else gets a bare 404 or 413. Each update is claimed by its update_id in the core, so Telegram's retries change
// nothing. Telegram learns only that it arrived.
import { MAX_TELEGRAM_BYTES, receiveTelegramUpdate, telegramSecretOk } from "@ziffr/core/telegram-inbound";
import { telegramOn } from "@ziffr/core/telegram-api";

const answer = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

/** Takes one update. */
export async function POST(req: Request) {
  if (!(await telegramOn()) || !(await telegramSecretOk(req.headers.get("x-telegram-bot-api-secret-token")))) return answer(404);
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d{1,10}$/.test(declared) || Number(declared) > MAX_TELEGRAM_BYTES)) return answer(413);
  const parts: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      // Read only up to the limit: a large or endless body is never held whole.
      if (size > MAX_TELEGRAM_BYTES) { await reader.cancel(); return answer(413); }
      parts.push(value);
    }
  }
  let update: unknown;
  try {
    update = JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    return answer(400);
  }
  await receiveTelegramUpdate(update);
  return answer(200);
}
