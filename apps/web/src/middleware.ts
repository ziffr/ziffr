// Runs before every page and server action (ADR 0003, GLOSSARY: View Link, Demo Mode).
// - View Links are seen by people outside the team: tell the root layout to leave out everything of the app around
//   them. The marker is removed from every other request, so a browser cannot set it itself.
// - The demo (ADR 0005): /demo starts a visit, /demo/leave ends it. During a visit no sign-in is needed; the pages
//   then only reach the demo workspace and its made-up people (viewer.ts), so the cookie grants nothing else.
// - The API (/api/v1/, spec 0002): programs sign in with an Access Key in each request, never with a session or the
//   demo cookie, so nothing here applies to it; the route handlers check the key. The same for the jobs a scheduler
//   calls (/api/jobs/, spec 0004), which check ZIFFR_JOB_SECRET themselves.
// - Everyone else: keep the sign-in session fresh and send anyone without one to sign in. The sign-in pages,
//   View Links and the personal submission form (used by Contacts, who have no login) stay open.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// The same name as DEMO_COOKIE in lib/auth.ts, which is server-only and cannot be imported here.
const DEMO_COOKIE = "ziffr-demo";

const OPEN = [/^\/login(\/|$)/, /^\/auth\//, /^\/v\//, /^\/submit\//];

export async function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete("x-ziffr-view-link");
  const path = req.nextUrl.pathname;
  if (path.startsWith("/v/")) {
    headers.set("x-ziffr-view-link", "1");
    return NextResponse.next({ request: { headers } });
  }
  // Only the API itself: a page added elsewhere under /api would still need sign-in.
  if (path.startsWith("/api/v1/") || path.startsWith("/api/jobs/")) return NextResponse.next({ request: { headers } });
  let res = NextResponse.next({ request: { headers } });
  const demoOffered = process.env.ZIFFR_DEMO !== "0";
  if (path === "/demo" || path === "/demo/leave") {
    // Another site may not drop a signed-in person into the shared demo, where they might type real numbers.
    const signedIn = req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    const fromElsewhere = req.headers.get("sec-fetch-site") === "cross-site";
    if (path === "/demo" && signedIn && fromElsewhere) return NextResponse.redirect(new URL("/", req.url)); // ignored, nothing changes
    const visit = path === "/demo" && demoOffered;
    const out = NextResponse.redirect(new URL(visit ? "/" : "/login", req.url));
    if (visit) out.cookies.set(DEMO_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/" });
    else out.cookies.delete(DEMO_COOKIE);
    return out;
  }
  if (demoOffered && req.cookies.get(DEMO_COOKIE)?.value === "1") return res;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) req.cookies.set(c.name, c.value);
        res = NextResponse.next({ request: { headers } });
        for (const c of list) res.cookies.set(c.name, c.value, c.options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && !OPEN.some((r) => r.test(path))) {
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    to.search = path === "/" ? "" : `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return NextResponse.redirect(to);
  }
  return res;
}

// Everything except Next's own files and static assets.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|flags/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"] };
