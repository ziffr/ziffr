// Where a sign-in link or provider sends the browser back to (ADR 0003): turn the code into a session, then go on.
import { NextResponse, type NextRequest } from "next/server";
import { authClient, DEMO_COOKIE, demoOnly, personFor } from "@/lib/auth";
import { recordSignIn } from "@ziffr/core/audit-log";
import { safeNext, SITE_URL } from "@/lib/sign-in";
import { signInBase } from "@/lib/sign-in-base";

export async function GET(req: NextRequest) {
  // A demo-only Ziffr takes no sign-in: a link asked of Supabase Auth directly must not make or link a person or write the Audit Log. No query string is carried.
  if (demoOnly()) return NextResponse.redirect(`${SITE_URL}/login`);
  // Back to the address that was signed in at: the session's cookies belong to it.
  const base = signInBase(req.headers);
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (code) {
    const { data, error } = await (await authClient()).auth.exchangeCodeForSession(code);
    if (!error) {
      // The sign-in goes into the Audit Log of each workspace the person is in. Best effort: it never stops a sign-in.
      if (data.user) await personFor(data.user).then(recordSignIn).catch(() => {});
      // Signing in ends a demo visit: from here on the person works in their own workspaces.
      const res = NextResponse.redirect(`${base}${next}`);
      res.cookies.delete(DEMO_COOKIE);
      return res;
    }
  }
  return NextResponse.redirect(`${base}/login?failed=1`);
}
