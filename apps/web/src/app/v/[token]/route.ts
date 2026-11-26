// Where a View Link leads (GLOSSARY: View Link): nothing is shown or counted here. The token goes into a cookie for
// this link alone, and the browser goes on to an address without it (lib/view-address.ts). Whether the link still
// works is asked there, on every load.
import { NextResponse, type NextRequest } from "next/server";
import { couldBeToken, NO_LINK, OPEN_SECONDS, viewCookie, viewKey, viewPath } from "@/lib/view-address";

export const dynamic = "force-dynamic";

/** Sends the browser from a View Link to its token-less page. Anything after "?" is dropped. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const key = couldBeToken(token) ? viewKey(token) : NO_LINK;
  // A relative address stays on whatever host the link was opened on, also behind a proxy.
  const res = new NextResponse(null, { status: 303, headers: { location: viewPath(key), "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
  if (key !== NO_LINK) {
    const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? req.nextUrl.protocol.replace(":", "");
    // Lax, not Strict: a link followed from an email or a chat must arrive with its cookie.
    res.cookies.set(viewCookie(key), token, { httpOnly: true, sameSite: "lax", secure: protocol === "https", path: viewPath(key), maxAge: OPEN_SECONDS });
  }
  return res;
}
