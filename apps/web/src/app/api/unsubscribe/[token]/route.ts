// /api/unsubscribe/{token} (spec 0004, ticket #74): the one-click link in every Prompt and reminder email (RFC 8058).
// A mail client's one-click POST, or the button on the page a GET shows, stops Prompts and reminders by email for
// that person in that workspace. A GET alone changes nothing, so a link scanner opening it stops nothing. The page
// names no person or workspace: whoever holds the link learns nothing from it.
import { optOutByToken, unsubscribeTokenValid } from "@ziffr/core/email-opt-out";

type Ctx = { params: Promise<{ token: string }> };

const page = (title: string, body: string, status = 200) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>`
  + `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}button{font:inherit;padding:.5rem 1rem}</style></head>`
  + `<body><h1>${title}</h1>${body}</body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } },
);

const unknown = () => page("Link not known", "<p>This link does not work. It may have been sent by an older version of Ziffr.</p>", 404);

/** The page that asks before stopping. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await unsubscribeTokenValid(token))) return unknown();
  return page("Stop reminders by email?", `<p>You will get no more requests for numbers or reminders by email from this workspace. Questions and tasks for you, and replies in your threads, keep coming.</p><form method="post"><button type="submit">Stop them</button></form>`);
}

/** Stops them: from the page's button, or a mail client's one-click unsubscribe. */
export async function POST(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await optOutByToken(token))) return unknown();
  return page("Stopped", "<p>You will get no more requests for numbers or reminders by email from this workspace. You can turn them on again on the Connectors page in Ziffr.</p>");
}
