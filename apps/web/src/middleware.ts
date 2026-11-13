// Runs before every page and server action (ADR 0003, GLOSSARY: View Link, Demo Mode).
// - View Links are seen by people outside the team: tell the root layout to leave out everything of the app around
//   them. The marker is removed from every other request, so a browser cannot set it itself.
// - Outside Demo Mode, keep the sign-in session fresh and send anyone without one to sign in. The sign-in pages,
//   View Links and the personal submission form (used by Contacts, who have no login) stay open.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const OPEN = [/^\/login(\/|$)/, /^\/auth\//, /^\/v\//, /^\/submit\//];

export async function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete("x-ziffr-view-link");
  const path = req.nextUrl.pathname;
  if (path.startsWith("/v/")) {
    headers.set("x-ziffr-view-link", "1");
    return NextResponse.next({ request: { headers } });
  }
  let res = NextResponse.next({ request: { headers } });
  if (process.env.ZIFFR_DEMO === "1") return res;

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
