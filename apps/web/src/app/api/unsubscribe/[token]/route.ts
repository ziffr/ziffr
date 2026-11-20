// /api/unsubscribe/{token} (spec 0004, ticket #74): the one-click link in every Prompt and reminder email (RFC 8058).
// A mail client's one-click POST, or the button on the page a GET shows, stops Prompts and reminders by email for
// that person in that workspace. A GET alone changes nothing, so a link scanner opening it stops nothing. The page
// names no person or workspace: whoever holds the link learns nothing from it.
import { optOutByToken, unsubscribeIsAlert, unsubscribeTokenValid } from "@ziffr/core/email-opt-out";
import { unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const unknown = () => page("Link not known", "<p>This link does not work. It may have been sent by an older version of Ziffr.</p>", 404);

/** The page that asks before stopping. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await unsubscribeTokenValid(token))) return unknown();
  if (await unsubscribeIsAlert(token)) return page("Pause this Alert?", `<p>You will get no more messages from this Alert. You can switch it on again in Ziffr.</p><form method="post"><button type="submit">Pause it</button></form>`);
  return page("Stop reminders by email?", `<p>You will get no more requests for numbers or reminders by email from this workspace. Questions and tasks for you, and replies in your threads, keep coming.</p><form method="post"><button type="submit">Stop them</button></form>`);
}

/** Stops them: from the page's button, or a mail client's one-click unsubscribe. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const alert = await unsubscribeIsAlert(token);
  if (!(await optOutByToken(token))) return unknown();
  if (alert) return page("Paused", "<p>This Alert will send you no more messages. You can switch it on again in Ziffr.</p>");
  return page("Stopped", "<p>You will get no more requests for numbers or reminders by email from this workspace. You can turn them on again on the Connectors page in Ziffr.</p>");
}
