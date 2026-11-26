// Runs before every page and server action (ADR 0003, GLOSSARY: View Link, Demo Mode).
// - View Links are seen by people outside the team: tell the root layout to leave out everything of the app around
//   them. The marker is removed from every other request, so a browser cannot set it itself.
// - The demo (ADR 0005): /demo starts a visit, /demo/leave ends it. During a visit no sign-in is needed; the pages
//   then only reach the demo workspace and its made-up people (viewer.ts), so the cookie grants nothing else.
// - The API (/api/v1/, spec 0002): programs sign in with an Access Key in each request, never with a session or the
//   demo cookie, so nothing here applies to it; the route handlers check the key. The same for the jobs a scheduler
//   calls (/api/jobs/, spec 0004), which check ZIFFR_JOB_SECRET themselves, and the inbound mail webhook
//   (/api/inbound/), which checks its signature, a Webhook's status back (/api/webhooks/{id}/in), signed with that Webhook's own secret, the Ziffr Cloud API (/api/cloud/, spec 0029), which checks its own, the one-click unsubscribe link (/api/unsubscribe/), the link that confirms a held reply by email (/api/confirm-reply/), the one with which a Contact confirms a Telegram connection (/api/confirm-telegram/) and the one that disconnects a chat account (/api/disconnect-chat/), which are
//   each their own token, and the health check (/api/health), which says only "ok", and Slack's events and button
//   presses (/api/slack/events, /api/slack/interactions), which Slack signs, and Telegram's webhook
//   (/api/telegram/updates), which carries the secret this Ziffr registered, and Supabase Auth's Send Email Hook
//   (/api/auth/send-email), which Auth signs. The remote MCP Server (/mcp, spec 0023) takes
//   only a bearer credential in each request, like the API; the OAuth endpoints assistants call from their servers
//   (/oauth/register, /oauth/token, /oauth/revoke) and the metadata under /.well-known/ take no session either. The
//   consent screen (/oauth/authorize) needs the session like any page. A Calendar Link (/cal/<secret>.ics, spec 0027) is its own
//   secret, fetched by calendar apps without cookies; its route handler checks it on every fetch. Slack's OAuth callback (/api/slack/oauth) needs the session like any page.
// - Everyone else: keep the sign-in session fresh and send anyone without one to sign in. The sign-in pages,
//   View Links, the personal submission form (used by Contacts, who have no login) and the user guide stay open.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authSettings } from "@/lib/auth-settings";
import { ownOrigins } from "@/lib/own-origins";
import { countsAsSignedIn, staleSessionCookies } from "@/lib/demo-only-session";
import { DEMO_VISIT_COOKIE, newVisitId, visitCookieOptions, visitFromCookie, withCookie } from "@/lib/demo-visit-cookie";

// The same name as DEMO_COOKIE in lib/auth.ts, which is server-only and cannot be imported here. It holds the
// visit's id (spec 0051): 128 random bits, never derived from anything about the person.
const DEMO_COOKIE = DEMO_VISIT_COOKIE;

/** Whether the request came over HTTPS (behind a proxy, the forwarded protocol says): the cookie is Secure only then. */
const overHttps = (req: NextRequest) => (req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? req.nextUrl.protocol.replace(":", "")) === "https";

// The user guide holds only its own text, so it can be read before signing in.
const OPEN = [/^\/login(\/|$)/, /^\/auth\//, /^\/v\//, /^\/submit\//, /^\/guide(\/|$)/];

// What assistants call without a session (spec 0023): exactly these paths, nothing under them.
const OAUTH_OPEN = new Set(["/oauth/register", "/oauth/token", "/oauth/revoke", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server"]);

/** The signed-in person's token claims, checked locally against Supabase's published keys; null when there is none
 * or it cannot be read. Only reads: a refreshed session is written by the full check further down. */
async function sessionClaims(req: NextRequest) {
  const { url, anonKey } = authSettings();
  const supabase = createServerClient(url, anonKey, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } });
  return supabase.auth.getClaims().then(({ data }) => data?.claims ?? null, () => null);
}

/** In a demo-only Ziffr, expires the browser's leftover sign-in cookies on this response, best effort, so the stale token is not sent for ever. */
function dropStaleSession<T extends NextResponse>(req: NextRequest, res: T): T {
  for (const name of staleSessionCookies(process.env.ZIFFR_DEMO_ONLY === "1", req.cookies.getAll().map((c) => c.name))) res.cookies.delete(name);
  return res;
}

export async function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete("x-ziffr-view-link");
  // A HEAD request opens nothing, but a page renders for it as for a GET: mark it so no View Count is made (spec 0031).
  // Removed from every other request, so a browser cannot set it.
  headers.delete("x-ziffr-no-count");
  if (req.method === "HEAD") headers.set("x-ziffr-no-count", "1");
  const path = req.nextUrl.pathname;
  if (path.startsWith("/v/")) {
    headers.set("x-ziffr-view-link", "1");
    return NextResponse.next({ request: { headers } });
  }
  // Only the API itself: a page added elsewhere under /api would still need sign-in.
  if (path.startsWith("/api/v1/") || path.startsWith("/api/cloud/") || path.startsWith("/api/jobs/") || path.startsWith("/api/inbound/") || /^\/api\/webhooks\/[0-9a-fA-F-]{36}\/in$/.test(path) || path.startsWith("/api/unsubscribe/") || /^\/api\/brand\/logo\/[0-9a-fA-F-]{36}\/[0-9a-f]{16}$/.test(path) || path.startsWith("/api/confirm-reply/") || path.startsWith("/api/confirm-telegram/") || path.startsWith("/api/disconnect-chat/") || path === "/api/health" || path === "/api/slack/events" || path === "/api/slack/interactions" || path === "/api/telegram/updates" || path === "/api/auth/send-email" || path === "/mcp" || /^\/cal\/[A-Za-z0-9_-]{43}\.ics$/.test(path) || OAUTH_OPEN.has(path)) return NextResponse.next({ request: { headers } });
  let res = NextResponse.next({ request: { headers } });
  // Whether the demo is offered is an Installation Setting (spec 0025). The middleware reads only the environment,
  // which wins over the page: there ZIFFR_DEMO=0 closes the demo outright. Otherwise the page may decide, so the
  // middleware sets and passes the demo's cookie and every page and action asks isDemo(), which reads the setting in
  // effect: a visit to a demo that is not offered counts as no visit and is sent to sign in.
  const demoOffered = process.env.ZIFFR_DEMO_ONLY === "1" || process.env.ZIFFR_DEMO !== "0";
  if (path === "/demo" || path === "/demo/leave") {
    // A signed-in person enters the shared demo, where they might type real numbers, only by its confirm page's
    // button (spec 0009): a link opens that page, and the button's POST counts only from this app's own pages. Every
    // browser sends Origin with a form post, so another site's link or form switches no one.
    // A session cookie alone is not enough: an expired or ended session would send the person to the confirm page,
    // which asks for a valid one and sends them to sign in, whose "Try the demo" leads here again (a loop). So the
    // token is checked as for every other page; a stale cookie counts as signed out.
    // A demo-only Ziffr counts nobody as signed in: a leftover session goes to the demo like a visitor.
    const hasCookie = countsAsSignedIn(process.env.ZIFFR_DEMO_ONLY === "1", req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token")));
    const signedIn = hasCookie && (await sessionClaims(req)) !== null;
    // Every POST is checked, signed in or not: a browser leaves the session cookie (SameSite=Lax) off a post from
    // another site, so such a post would look like a visitor's, and the GET after it would carry the session.
    if (path === "/demo" && req.method === "POST" && !ownOrigins(req.nextUrl.origin).has(req.headers.get("origin") ?? "")) return new NextResponse("Not from this site.", { status: 403 });
    if (path === "/demo" && signedIn && req.method !== "POST") return NextResponse.redirect(new URL("/demo/confirm", req.url));
    const starts = path === "/demo" && demoOffered;
    // 303 so a POST is followed by a GET of the page.
    const out = NextResponse.redirect(new URL(starts ? "/" : "/login", req.url), 303);
    if (starts) out.cookies.set(DEMO_COOKIE, newVisitId(), visitCookieOptions(overHttps(req)));
    else out.cookies.delete(DEMO_COOKIE);
    return dropStaleSession(req, out);
  }
  const visit = demoOffered ? visitFromCookie(req.cookies.get(DEMO_COOKIE)?.value) : null;
  if (visit) {
    // A cookie that is not an id (the "1" of before ids, or a forged value) is replaced by a fresh one, for this
    // request's page too; a valid id passes unchanged.
    if (visit.fresh) {
      headers.set("cookie", withCookie(req.headers.get("cookie"), DEMO_COOKIE, visit.id));
      res = NextResponse.next({ request: { headers } });
      res.cookies.set(DEMO_COOKIE, visit.id, visitCookieOptions(overHttps(req)));
    }
    return dropStaleSession(req, res);
  }

  // A demo-only Ziffr ignores any real session: no check of it, so the visitor is sent to the demo entry (/login) as if signed out.
  if (process.env.ZIFFR_DEMO_ONLY === "1") {
    if (OPEN.some((r) => r.test(path))) return dropStaleSession(req, res);
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return dropStaleSession(req, NextResponse.redirect(to));
  }

  const { url, anonKey } = authSettings();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) req.cookies.set(c.name, c.value);
        res = NextResponse.next({ request: { headers } });
        for (const c of list) res.cookies.set(c.name, c.value, c.options);
      },
    },
  });
  // Only "is someone signed in?" here, so the token's signature and expiry are checked locally against Supabase's
  // published keys (cached), and an expired session is refreshed. Pages ask Supabase itself once per request
  // (sessionUser), which also catches a session ended elsewhere; asking here too cost a round trip on every click.
  // A token Supabase's library cannot even read (an unsupported algorithm) counts as no session, not as an error.
  const claims = await supabase.auth.getClaims().then(({ data }) => data?.claims ?? null, () => null);
  if (!claims && !OPEN.some((r) => r.test(path))) {
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.search = path === "/" ? "" : `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return NextResponse.redirect(to);
  }
  return res;
}

// Everything except Next's own files and static assets. The installable app's files (#143) are the same for everyone
// and must load signed out too: a browser fetches the manifest without cookies, and the offline page is shown when
// nothing else can be reached.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|flags/|manifest.webmanifest$|sw.js$|offline.html$|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"] };
