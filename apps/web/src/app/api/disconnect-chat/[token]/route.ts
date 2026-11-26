// /api/disconnect-chat/{token} (spec 0016, spec 0007; GLOSSARY: Connector): the link in the email that tells a member a
// Telegram or Slack account was connected to them. A GET only asks, so a mail scanner opening it disconnects nothing; the
// Disconnect button POSTs. No sign-in: the link is signed for that one connection and can only end it. The page names the
// service and the Workspace, escaped, as the email that holds the link does. A link Ziffr did not sign answers 404.
import { chatDisconnectView, disconnectByLink } from "@ziffr/core/connection-notices";
import { escapeHtml, unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const NAME = { telegram: "Telegram", slack: "Slack" } as const;
const unknown = () => page("Link not known", "<p>This link does not work.</p>", 404);

/** The page that says what will happen and asks before it disconnects. */
export async function GET(_req: Request, ctx: Ctx) {
  const view = await chatDisconnectView((await ctx.params).token);
  if (!view) return unknown();
  const service = NAME[view.service];
  const workspace = `<strong>${escapeHtml(view.workspace)}</strong>`;
  if (!view.connected) return page("Already disconnected", `<p>The ${service} connection this link is about, in the workspace ${workspace}, has ended already. If you did not expect another one, tell an Owner or Admin of the workspace.</p>`);
  return page(`Disconnect ${service}?`, [
    `<p>Ziffr then sends your messages from the workspace ${workspace} to that ${service} account no more, and takes no answers from it.</p>`,
    "<p>Disconnect it if you did not connect it yourself, and tell an Owner or Admin of the workspace.</p>",
    view.service === "slack" ? "<p>Ziffr may then find your own Slack account again by your email address.</p>" : "",
    `<form method="post"><button type="submit">Disconnect</button></form>`,
  ].join(""));
}

/** Disconnects it: from the page's button only. */
export async function POST(_req: Request, ctx: Ctx) {
  const done = await disconnectByLink((await ctx.params).token);
  if (!done) return unknown();
  return page("Disconnected", `<p>That ${NAME[done.service]} account is not connected to you in the workspace <strong>${escapeHtml(done.workspace)}</strong> any more. If you did not connect it yourself, tell an Owner or Admin of the workspace.</p>`);
}
