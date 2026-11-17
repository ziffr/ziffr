// POST /api/jobs/telegram-poll (spec 0016, ticket #25): one round of fetching updates from Telegram, for a laptop
// without a public address (ZIFFR_TELEGRAM_POLLING=1; `pnpm telegram:poll` calls it in a loop). Only with the job
// secret (lib/jobs.ts), like every job; with a webhook (polling off) it does nothing. Answers only how many it handled.
import { pollTelegramOnce } from "@ziffr/core/telegram-inbound";
import { jobAuthorized, jobNotFound } from "@/lib/jobs";

/** Fetches what Telegram has waiting, waiting up to 20 seconds for something to arrive. */
export async function POST(req: Request) {
  if (!jobAuthorized(req)) return jobNotFound();
  return Response.json(await pollTelegramOnce(20), { headers: { "cache-control": "no-store" } });
}
