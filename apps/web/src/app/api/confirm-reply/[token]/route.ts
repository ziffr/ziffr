// /api/confirm-reply/{token} (ticket #513, GLOSSARY: Held Reply): the link in the email Ziffr sends to the address it keeps for a person
// when a reply by email arrived that no provider vouched for. A GET only shows the reply and what confirming would do, so a mail
// scanner prefetching the link records nothing; a button POSTs. A link that is unknown, expired or used answers the same 404
// page. The page holds only the reply's own words (escaped) and the words of what it would do, a line for each figure and its
// note; where a note offers a change of the value (spec 0064), a second button takes it. A value without a note has an
// optional field above Confirm, with the question where its Metric asks; what is typed there comes back with the POST.
import { confirmHeldReply, heldReplyView, type HeldReplyView } from "@ziffr/core/held-replies";
import { readLimited } from "@/lib/limited-body";
import { escapeHtml as escape, unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const unknown = () => page("Link not known", "<p>This link does not work. It may have expired or been used already.</p>", 404);

/** The longest body read: the page's note fields, each at most 1,000 characters, as a browser encodes them. */
const MOST_BODY = 700_000;
// The most figures a message numbers (spec 0064), and so the most note fields a page has.
const MOST_FIGURES = 50;

// The note fields above Confirm, with the question before them where one is asked.
function noteFields({ notes = [], question }: HeldReplyView): string {
  if (!notes.length) return "";
  const readers = "Everyone who sees a Metric can read the words on it.";
  const asked = question ? `<p><strong>${escape(question)}</strong> ${readers}</p>` : `<p>${readers}</p>`;
  return asked + notes.map((n) => `<p><label for="note-${n.position}">Note for ${escape(n.label)} (optional)</label><textarea id="note-${n.position}" name="note-${n.position}" rows="3" maxlength="1000"></textarea></p>`).join("");
}

// The notes typed into the page's fields, by figure number; null for a body longer than the page's could be.
async function typedNotes(req: Request): Promise<Record<number, string> | null> {
  const body = await readLimited(req, MOST_BODY).catch(() => null);
  if (body === null) return null;
  const form = new URLSearchParams(body);
  return Object.fromEntries(Array.from({ length: MOST_FIGURES }, (_, i) => i + 1).flatMap((n) => { const words = form.get(`note-${n}`); return words?.trim() ? [[n, words]] : []; }));
}

/** The page that shows the reply and asks before it is recorded. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const view = await heldReplyView(token);
  if (!view) return unknown();
  const effect = view.effect.split("\n").map((line) => `<p>${escape(line)}</p>`).join("");
  // The offered change goes back as the address of a second form; the core takes it only if the reply still offers just that.
  const offer = view.offer ? `<p><button type="submit" formaction="?take=${escape(encodeURIComponent(view.offer.take))}">${escape(view.offer.label)}</button></p>` : "";
  return page("Confirm your reply", `<p>You replied by email:</p><blockquote>${escape(view.text)}</blockquote>${effect}<p>Only confirm if you sent it. If you did not, close this page: nothing is recorded.</p><form method="post">${noteFields(view)}<p><button type="submit">Confirm</button></p>${offer}</form>`);
}

/** Confirms the reply, with the offered change when that button was pressed: from the page's buttons only. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const notes = await typedNotes(req);
  // Nothing is taken then: the reply still waits.
  if (notes === null) return page("Not recorded", "<p>The notes are too long. Go back, shorten them and press Confirm again.</p>", 413);
  const done = await confirmHeldReply(token, new URL(req.url).searchParams.get("take") ?? undefined, notes);
  if (!done) return unknown();
  return page(done.ok ? "Confirmed" : "Not recorded", done.detail.split("\n").map((line) => `<p>${escape(line)}</p>`).join(""));
}
