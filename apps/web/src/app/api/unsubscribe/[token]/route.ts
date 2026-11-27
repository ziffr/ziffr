// /api/unsubscribe/{token} (spec 0004, ticket #74): the one-click link in every Prompt and reminder email (RFC 8058).
// A mail client's one-click POST, or the button on the page a GET shows, stops Prompts and reminders by email for
// that person in that workspace. A GET alone changes nothing, so a link scanner opening it stops nothing. The page
// names no person or workspace: whoever holds the link learns nothing from it.
// The page that has just stopped them also takes it back (Undo): its form carries a secret made for that stop alone,
// so the link by itself, old or forwarded, never switches anything on.
import { optOutByToken, UNDO_MINUTES, undoEmailStop, unsubscribeIsAlert, unsubscribeIsHeadsUp, unsubscribeIsTell, unsubscribeTokenValid } from "@ziffr/core/email-opt-out";
import { escapeHtml, unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const unknown = () => page("Link not known", "<p>This link does not work. It may have been sent by an older version of Ziffr.</p>", 404);

/** How someone gets the requests again once the Undo is over. */
const BACK_LATER = "To get these emails again, sign in to Ziffr and switch them on under Your Deliveries. If you do not sign in to Ziffr, ask the person who asks you for the numbers to have Ziffr send you an email with which you can switch them on.";
const KEEPS_COMING = "Questions and tasks for you, and replies in your threads, keep coming.";

/** The longest body read: the Undo's secret or a mail client's one line. */
const MOST_BODY = 1000;

/** The Undo secret in a form's body, or null for a stop (the page's button, a mail client's one-click). */
async function undoIn(req: Request): Promise<string | null> {
  const body = await req.text().catch(() => "");
  return body.length <= MOST_BODY ? new URLSearchParams(body).get("undo") : null;
}

/** The page after Undo: on again, or why not. It never stops anything instead. */
async function undone(token: string, secret: string) {
  if (await undoEmailStop(token, secret)) return page("You are asked by email again", "<p>Ziffr asks you for numbers by email again, as before.</p>");
  return page("Undo does not work any more", `<p>Undo works once, for ${UNDO_MINUTES} minutes. Nothing changed now.</p><p>${BACK_LATER}</p>`, 410);
}

/** The page that asks before stopping. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await unsubscribeTokenValid(token))) return unknown();
  if (await unsubscribeIsTell(token)) return page("Stop being told by this Workflow?", `<p>You will get no more messages from this Workflow. You can switch them on again in Your settings in Ziffr.</p><form method="post"><button type="submit">Stop them</button></form>`);
  if (await unsubscribeIsHeadsUp(token)) return page("Stop Heads-ups by message?", `<p>You will get no more Heads-ups by message. They stay in the list under Analyze, and you can switch the messages on again under Your Deliveries in Ziffr.</p><form method="post"><button type="submit">Stop them</button></form>`);
  if (await unsubscribeIsAlert(token)) return page("Pause this Alert?", `<p>You will get no more messages from this Alert. You can switch it on again in Ziffr.</p><form method="post"><button type="submit">Pause it</button></form>`);
  return page("Stop being asked for numbers by email?", `<p>You will get no more requests for numbers or reminders by email from this workspace, and the people whose numbers you send are told. ${KEEPS_COMING}</p><form method="post"><button type="submit">Stop asking me by email</button></form>`);
}

/** Stops them: from the page's button, or a mail client's one-click unsubscribe. With the Undo's secret, takes the stop back. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const secret = await undoIn(req);
  if (secret !== null) return undone(token, secret);
  const alert = await unsubscribeIsAlert(token);
  const tell = await unsubscribeIsTell(token);
  const heads = await unsubscribeIsHeadsUp(token);
  const stopped = await optOutByToken(token);
  if (!stopped) return unknown();
  if (tell) return page("Stopped", "<p>This Workflow will tell you no more. You can switch it on again in Your settings in Ziffr.</p>");
  if (heads) return page("Stopped", "<p>You will get no more Heads-ups by message. You can switch them on again under Your Deliveries in Ziffr.</p>");
  if (alert) return page("Paused", "<p>This Alert will send you no more messages. You can switch it on again in Ziffr.</p>");
  // Stopped before: no Undo, which would let whoever holds an old email switch them on.
  if (!stopped.undo) return page("You are not asked by email", `<p>These emails were stopped before, so nothing changed now.</p><p>${BACK_LATER}</p>`);
  return page("You are no longer asked by email", `<p>You will get no more requests for numbers or reminders by email from this workspace. ${KEEPS_COMING}</p><p>Pressed this by mistake?</p><form method="post"><input type="hidden" name="undo" value="${escapeHtml(stopped.undo)}"><button type="submit">Undo</button></form><p>Undo works on this page for ${UNDO_MINUTES} minutes.</p><p>${BACK_LATER}</p>`);
}
