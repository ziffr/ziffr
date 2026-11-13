// View Links (GLOSSARY: View Link) are seen by people outside the team: tell the root layout to leave out
// everything of the app around them (navigation, people, the tour).
import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-ziffr-view-link", "1");
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/v/:path*" };
