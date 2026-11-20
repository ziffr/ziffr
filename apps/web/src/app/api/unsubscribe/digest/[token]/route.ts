// /api/unsubscribe/digest/{token} (spec 0031, ticket #368): the one-click link of the monthly usage digest (RFC 8058).
// A mail client's one-click POST, or the button on the page a GET shows, switches the digest off for the person the
// signed token names. A GET alone changes nothing, so a link scanner opening it stops nothing. The page names no
// person, Workspace or Metric: whoever holds the link learns nothing from it. Every failure looks the same.
import { optOutOfUsageDigestByToken, usageDigestTokenValid } from "@ziffr/core/usage-digest";
import { unsubscribePage as page } from "@/lib/unsubscribe-page";

type Ctx = { params: Promise<{ token: string }> };

const unknown = () => page("Link not known", "<p>This link does not work. It may have been sent by an older version of Ziffr.</p>", 404);

/** The page that asks before stopping. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!usageDigestTokenValid(token)) return unknown();
  return page("Stop the monthly usage email?", `<p>You will get no more emails from Ziffr about Metrics, dashboards and decks that nobody uses, from any workspace of yours.</p><form method="post"><button type="submit">Stop them</button></form>`);
}

/** Stops it: from the page's button, or a mail client's one-click unsubscribe. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await optOutOfUsageDigestByToken(token))) return unknown();
  return page("Stopped", "<p>You will get no more emails about what is unused. You can turn them on again under Your Deliveries in Ziffr.</p>");
}
