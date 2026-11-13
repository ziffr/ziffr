// Where a sign-in link or provider sends the browser back to (ADR 0003): turn the code into a session, then go on.
import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/auth";
import { safeNext, SITE_URL } from "@/lib/sign-in";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (code) {
    const { error } = await (await authClient()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${SITE_URL}${next}`);
  }
  return NextResponse.redirect(`${SITE_URL}/login?failed=1`);
}
