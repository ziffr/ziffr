// /api/unsubscribe/again/{token} (issue #1333; GLOSSARY: Prompt): the link of the email that asks "Would you like
// these again?", sent when the Metric's owner asked Ziffr to. A GET only asks, so a link scanner opening it changes
// nothing; the button's POST switches requests by email on again for that person in that workspace. The link works
// once and for a few days. The page names no person or workspace.
import { resumeByLink, resumeLinkValid } from "@ziffr/core/email-resume";
import { unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const gone = () => page("Link does not work", "<p>This link was used already, is too old, or is not known. Nothing changed.</p><p>If you sign in to Ziffr, you can switch the emails on under Your Deliveries.</p>", 404);

/** The page that asks before switching them on. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await resumeLinkValid(token))) return gone();
  return page("Be asked for numbers by email again?", `<p>You unsubscribed from requests for numbers by email from this workspace. If you press the button, you get requests and reminders by email again. If you close this page, nothing changes.</p><form method="post"><button type="submit">Yes, ask me by email again</button></form>`);
}

/** Switches them on, from the page's button. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await resumeByLink(token))) return gone();
  return page("You are asked by email again", "<p>You get requests and reminders for numbers by email again. Every one of them has the link to stop them.</p>");
}
