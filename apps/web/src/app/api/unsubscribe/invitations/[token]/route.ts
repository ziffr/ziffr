// /api/unsubscribe/invitations/{token} (spec 0040, ticket 5): the "Do not invite me again" link of an invitation email
// (RFC 8058). A mail client's one-click POST, or the button on the page a GET shows, stops invitation emails to that
// address from every Workspace on this Ziffr. A GET alone changes nothing, so a link scanner opening it stops nothing.
// The page names no address, person or Workspace: whoever holds the link learns nothing from it. Every failure looks the same.
import { invitationStopTokenValid, stopInvitationsByToken } from "@ziffr/core/invitation-stop";
import { unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const unknown = () => page("Link not known", "<p>This link does not work. It may have been sent by an older version of Ziffr.</p>", 404);

/** The page that asks before stopping. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!invitationStopTokenValid(token)) return unknown();
  return page("Stop invitations to this address?", `<p>Nobody will be able to invite this email address to a Ziffr workspace by email from this Ziffr any more.</p><form method="post"><button type="submit">Do not invite me again</button></form>`);
}

/** Stops it: from the page's button, or a mail client's one-click unsubscribe. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await stopInvitationsByToken(token))) return unknown();
  return page("Stopped", "<p>This address gets no more invitation emails from this Ziffr. If you want to join a workspace later, ask the person to send you the link.</p>");
}
