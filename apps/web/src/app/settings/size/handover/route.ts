// POST /settings/size/handover (spec 0029, ticket #267): hands an Owner over to Ziffr Cloud to change the Size or see
// billing and invoices. The core checks that they are an Owner of the Workspace, signed in as themselves, and signs a
// token that works for five minutes. The page posts it to Ziffr Cloud in a form, so it never sits in a browser
// history, a server log or a Referer. Only from this app's own pages (the Origin), never cached.
import { createHash } from "node:crypto";
import { Forbidden } from "@ziffr/core/actor";
import { handover } from "@ziffr/core/cloud-api";
import { currentActor } from "@/lib/viewer";

const HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };

// The page's one script, allowed by its hash and nothing else; the form may post only to Ziffr Cloud.
const SCRIPT = `document.getElementById("go").submit();`;
const SCRIPT_HASH = createHash("sha256").update(SCRIPT).digest("base64");
const csp = (target: string) => `default-src 'none'; script-src 'sha256-${SCRIPT_HASH}'; form-action ${new URL(target).origin}; base-uri 'none'; frame-ancestors 'none'`;

/** Text for an HTML attribute. */
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** This app's own origins, as the middleware reads them. */
function ownOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const own = new Set([new URL(req.url).origin]);
  try { if (process.env.ZIFFR_SITE_URL) own.add(new URL(process.env.ZIFFR_SITE_URL).origin); } catch { /* a malformed setting adds nothing */ }
  return origin !== null && own.has(origin);
}

/** Builds the token and the page that posts it on. */
export async function POST(req: Request) {
  if (!ownOrigin(req)) return new Response("Not from this site.", { status: 403, headers: { "cache-control": "no-store" } });
  const form = await req.formData().catch(() => null);
  const purpose = form?.get("to") === "billing" ? "billing" : "size";
  try {
    const { url, token } = await handover(await currentActor(), purpose);
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Ziffr Cloud</title></head>
<body><form id="go" method="post" action="${attr(url)}"><input type="hidden" name="token" value="${attr(token)}"><p>Taking you to Ziffr Cloud…</p><button type="submit">Continue</button></form>
<script>${SCRIPT}</script></body></html>`;
    return new Response(page, { status: 200, headers: { ...HEADERS, "content-security-policy": csp(url) } });
  } catch (e) {
    if (e instanceof Forbidden) return new Response("Only Owners change the Size.", { status: 403, headers: { "cache-control": "no-store" } });
    throw e;
  }
}
