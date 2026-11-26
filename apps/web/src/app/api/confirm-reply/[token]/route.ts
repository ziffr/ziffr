// /api/confirm-reply/{token} (ticket #513, GLOSSARY: Held Reply): the link in the email Ziffr sends to the address it keeps for a person
// when a reply by email arrived that no provider vouched for. A GET only shows the reply and what confirming would do, so a mail
// scanner prefetching the link records nothing; the Confirm button POSTs. A link that is unknown, expired or used answers the
// same 404 page. The page holds only the reply's own words (cut short, escaped) and the words of what it would do.
import { confirmHeldReply, heldReplyView } from "@ziffr/core/held-replies";
import { escapeHtml as escape, unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const unknown = () => page("Link not known", "<p>This link does not work. It may have expired or been used already.</p>", 404);

/** The page that shows the reply and asks before it is recorded. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const view = await heldReplyView(token);
  if (!view) return unknown();
  return page("Confirm your reply", `<p>You replied by email:</p><blockquote>${escape(view.text)}</blockquote><p>${escape(view.effect)}</p><p>Only confirm if you sent it. If you did not, close this page: nothing is recorded.</p><form method="post"><button type="submit">Confirm</button></form>`);
}

/** Confirms the reply: from the page's button only. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const done = await confirmHeldReply(token);
  if (!done) return unknown();
  return page(done.ok ? "Confirmed" : "Not recorded", `<p>${escape(done.detail)}</p>`);
}
