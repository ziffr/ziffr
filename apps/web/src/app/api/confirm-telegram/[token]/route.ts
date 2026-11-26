// /api/confirm-telegram/{token} (spec 0016; GLOSSARY: Contact, Connector): the link in the email Ziffr sends to the address it
// keeps for a Contact who started connecting Telegram on their personal form. A GET only says what confirming would do, so a mail
// scanner opening the link connects nothing; the page asks for the four digits the Ziffr bot sent to the Contact's chat, and the
// Confirm button POSTs them. A link that is unknown, expired, used or out of tries answers the same 404 page. The page names the
// Workspace and the Telegram account (as the core cleaned it), all of it escaped: what the email that holds the link already
// says, and never the digits.
import { confirmTelegram, telegramConfirmView } from "@ziffr/core/telegram-confirm";
import { readLimited } from "@/lib/limited-body";
import { escapeHtml, unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

/** Far more than the form's one short field needs. */
const MAX_FORM_BYTES = 1024;

const unknown = () => page("Link not known", "<p>This link does not work. It may have expired or been used already. To connect Telegram, start again on your personal form.</p>", 404);

/** The page that asks for the number, with a line first about the try before when there was one. */
async function ask(token: string, wrong?: string): Promise<Response> {
  const view = await telegramConfirmView(token);
  if (!view) return unknown();
  return page("Connect Telegram?", [
    wrong ? `<p role="alert"><strong>${escapeHtml(wrong)}</strong></p>` : "",
    `<p>This connects a Telegram account to you in the workspace <strong>${escapeHtml(view.workspace)}</strong> on Ziffr.</p>`,
    `<p>Telegram account: <strong>${escapeHtml(view.account)}</strong></p>`,
    "<p>If you confirm, Ziffr sends that account your messages from this workspace, about every number you are asked for: requests, reminders, questions and replies, which can quote values. Answers from it count as yours. To stop it, send /stop to the Ziffr bot from that account.</p>",
    "<p>Confirm only if you started this yourself. If not, close this page: nothing is connected.</p>",
    `<form method="post"><p><label for="number">The four-digit number the Ziffr bot sent to your own Telegram chat</label></p>`,
    `<p><input id="number" name="number" inputmode="numeric" autocomplete="off" maxlength="9" required></p>`,
    "<p>Never type a number someone else gave you.</p>",
    `<button type="submit">Confirm</button></form>`,
  ].join(""));
}

/** The page that says what will happen and asks for the number. */
export async function GET(_req: Request, ctx: Ctx) {
  return ask((await ctx.params).token);
}

/** Connects it, with the right number: from the page's form only. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const number = new URLSearchParams((await readLimited(req, MAX_FORM_BYTES)) ?? "").get("number");
  const done = await confirmTelegram(token, number);
  if (!done) return unknown();
  if (done.connected) return page("Telegram is connected", `<p>Ziffr's messages for you in ${escapeHtml(done.workspace)} can now reach that Telegram account. An email to you says so.</p>`);
  if (!done.triesLeft) return page("Not connected", "<p>That number is not the one, and it was the last try: this link no longer works. Nothing is connected. If you started this yourself, start again on your personal form.</p>");
  return ask(token, `That is not the number. Type the four digits your own Telegram chat shows. Tries left: ${done.triesLeft}.`);
}
