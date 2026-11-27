// /api/confirm-reply/{token} (ticket #513, GLOSSARY: Held Reply): the link in the email Ziffr sends to the address it keeps for a person
// when a reply by email arrived that no provider vouched for. A GET only shows the reply and what confirming would do, so a mail
// scanner prefetching the link records nothing; a button POSTs. A link that is unknown, expired or used answers the same 404
// page. The page holds only the reply's own words (escaped) and the words of what it would do, a line for each figure and its
// note; where a note offers a change of the value (spec 0064), a second button takes it.
import { confirmHeldReply, heldReplyView } from "@ziffr/core/held-replies";
import { escapeHtml as escape, unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const unknown = () => page("Link not known", "<p>This link does not work. It may have expired or been used already.</p>", 404);

/** The page that shows the reply and asks before it is recorded. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const view = await heldReplyView(token);
  if (!view) return unknown();
  const effect = view.effect.split("\n").map((line) => `<p>${escape(line)}</p>`).join("");
  // The offered change goes back as the address of a second form; the core takes it only if the reply still offers just that.
  const offer = view.offer ? `<form method="post" action="?take=${escape(encodeURIComponent(view.offer.take))}"><button type="submit">${escape(view.offer.label)}</button></form>` : "";
  return page("Confirm your reply", `<p>You replied by email:</p><blockquote>${escape(view.text)}</blockquote>${effect}<p>Only confirm if you sent it. If you did not, close this page: nothing is recorded.</p><form method="post"><button type="submit">Confirm</button></form>${offer}`);
}

/** Confirms the reply, with the offered change when that button was pressed: from the page's buttons only. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const done = await confirmHeldReply(token, new URL(req.url).searchParams.get("take") ?? undefined);
  if (!done) return unknown();
  return page(done.ok ? "Confirmed" : "Not recorded", done.detail.split("\n").map((line) => `<p>${escape(line)}</p>`).join(""));
}
