// /api/confirm-telegram/{token} (spec 0016; GLOSSARY: Contact, Connector): the link in the email Ziffr sends to the address it
// keeps for a Contact who started connecting Telegram on their personal form. A GET only says what confirming would do, so a mail
// scanner opening the link connects nothing; the Confirm button POSTs. A link that is unknown, expired or used answers the same
// 404 page. The page names the Workspace, the Telegram account (as the core cleaned it) and the number its chat shows, all of it
// escaped: what the email that holds the link already says, and nothing else.
import { confirmTelegram, telegramConfirmView } from "@ziffr/core/telegram-confirm";
import { escapeHtml, unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const unknown = () => page("Link not known", "<p>This link does not work. It may have expired or been used already. To connect Telegram, start again on your personal form.</p>", 404);

/** The page that says what will happen and asks before Telegram is connected. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const view = await telegramConfirmView(token);
  if (!view) return unknown();
  return page("Connect Telegram?", [
    `<p>This connects a Telegram account to you in the workspace <strong>${escapeHtml(view.workspace)}</strong> on Ziffr.</p>`,
    `<p>Telegram account: <strong>${escapeHtml(view.account)}</strong><br>Number shown in that Telegram chat: <strong>${escapeHtml(view.check)}</strong></p>`,
    "<p>If you confirm, Ziffr sends that account your messages from this workspace, about every number you are asked for: requests, reminders, questions and replies, which can quote values. Answers from it count as yours. To stop it, send /stop to the Ziffr bot from that account.</p>",
    `<p>Confirm only if you started this yourself and your Telegram shows ${escapeHtml(view.check)}. If not, close this page: nothing is connected.</p>`,
    `<form method="post"><button type="submit">Confirm</button></form>`,
  ].join(""));
}

/** Connects it: from the page's button only. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const done = await confirmTelegram(token);
  if (!done) return unknown();
  return page("Telegram is connected", `<p>Ziffr's messages for you in ${escapeHtml(done.workspace)} can now reach that Telegram account. An email to you says so.</p>`);
}
