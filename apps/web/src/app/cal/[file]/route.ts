// A Calendar Link's address, /cal/<secret>.ics (spec 0027, ticket #243; GLOSSARY: Calendar Link): calendar apps fetch
// it without signing in, so the secret in the path is the only credential. The core checks it on every fetch, builds
// the person's Schedule as them, and counts the fetch towards its hourly limit. Unknown, revoked and ended links all
// answer the same 404, so the address tells nothing about a link that is gone.
import { fetchCalendar } from "@ziffr/core/calendar-links";

/** The Installation's own address for the events' links: the public one when a proxy is in front. */
function originOf(req: Request): string {
  try {
    if (process.env.ZIFFR_SITE_URL) return new URL(process.env.ZIFFR_SITE_URL).origin;
  } catch {
    // A malformed setting: the address the request reached.
  }
  return new URL(req.url).origin;
}

const PLAIN = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

/** The person's Schedule as an iCalendar file. */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const secret = /^([A-Za-z0-9_-]{43})\.ics$/.exec(file)?.[1];
  const res = secret ? await fetchCalendar(secret, originOf(req)) : ({ status: "not_found" } as const);
  if (res.status === "not_found") return new Response("Not found.", { status: 404, headers: PLAIN });
  if (res.status === "rate_limited") return new Response("Too many fetches of this calendar; try again in an hour.", { status: 429, headers: { ...PLAIN, "retry-after": "3600" } });
  // Only for whoever holds the address: no shared cache keeps it, and the same Schedule answers 304.
  const headers = { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=900", etag: res.etag, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
  if (req.headers.get("if-none-match") === res.etag) return new Response(null, { status: 304, headers });
  return new Response(res.ics, { status: 200, headers });
}
