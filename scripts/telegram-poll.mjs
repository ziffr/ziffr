#!/usr/bin/env node
// `pnpm telegram:poll` (spec 0016): fetches Telegram updates for a Ziffr running on this laptop, where Telegram cannot
// reach a webhook. Calls the app's job POST /api/jobs/telegram-poll in a loop with the job secret; the app needs
// ZIFFR_TELEGRAM_POLLING=1 and ZIFFR_JOB_SECRET (both in .env.local, read by `node --env-file-if-exists`).
const app = (process.env.ZIFFR_APP_URL || process.env.ZIFFR_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
const secret = process.env.ZIFFR_JOB_SECRET ?? "";
if (secret.length < 32) {
  console.error("Telegram polling: ZIFFR_JOB_SECRET (at least 32 characters) must be set, as for the app.");
  process.exit(1);
}
console.log(`Telegram polling: fetching updates through ${app}. Stop with Ctrl+C.`);
for (;;) {
  try {
    const res = await fetch(`${app}/api/jobs/telegram-poll`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60_000) });
    if (res.status === 404) {
      console.error("Telegram polling: the app refused the job secret. Is ZIFFR_JOB_SECRET the same as the app's?");
      await new Promise((r) => setTimeout(r, 10_000));
    } else {
      const { handled } = await res.json();
      if (handled) console.log(`${new Date().toISOString()} handled ${handled}`);
    }
  } catch {
    // The app is starting or restarting: wait and go on.
    await new Promise((r) => setTimeout(r, 3000));
  }
}
