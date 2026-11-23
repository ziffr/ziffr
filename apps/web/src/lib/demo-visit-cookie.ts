// The demo's cookie (GLOSSARY: Demo Mode; spec 0051, ticket 2): a visit to the demo holds 128 random bits that stand for
// it, so the limits of a later ticket can count one visit apart from another. Pure and edge-safe (the middleware
// imports it): no server-only code, only Web Crypto. The id is made from nothing about the person (no address, no
// user agent), never shown, and only its hash (core `visitKey`) is ever stored or logged.

/** The cookie's name, the same as DEMO_COOKIE in lib/auth.ts (which is server-only and cannot be imported here). */
export const DEMO_VISIT_COOKIE = "ziffr-demo";

/** The id's shape: 32 lowercase hex characters, 128 bits. Anything else in the cookie is not an id. */
const VISIT_ID = /^[0-9a-f]{32}$/;

/** A fresh visit id: 128 bits from the platform's secure random source. */
export function newVisitId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The id a cookie value holds, or null when it is not one (absent, an old "1", forged, the wrong length). */
export function visitIdOf(value: string | undefined): string | null {
  return value !== undefined && VISIT_ID.test(value) ? value : null;
}

/** The visit a request's cookie says: null when it has no cookie (no visit); otherwise its id, and `fresh` when the
 * cookie held something that is not an id (the "1" of before ids, or a forged value), which is replaced by a new one
 * instead of being trusted or used. */
export function visitFromCookie(value: string | undefined): { id: string; fresh: boolean } | null {
  if (value === undefined) return null;
  const id = visitIdOf(value);
  return id ? { id, fresh: false } : { id: newVisitId(), fresh: true };
}

/** The cookie's flags: never readable from JavaScript, not sent with another site's requests, only over HTTPS where the
 * site is served over it (a plain-http laptop or self-hosted Installation could not keep it otherwise), for the
 * visit's browser session. */
export function visitCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure };
}

/** A Cookie request header with one cookie set to a value, so the page drawn for the request that minted an id sees it. */
export function withCookie(header: string | null, name: string, value: string): string {
  const others = (header ?? "").split(";").map((p) => p.trim()).filter((p) => p && !p.startsWith(`${name}=`));
  return [...others, `${name}=${value}`].join("; ");
}
