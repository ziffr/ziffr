// The address of an opened View Link (GLOSSARY: View Link). The link itself is what lets someone in, so it does not
// stay in the address bar. Opening /v/<token> puts the token into a cookie that only this link's own page receives,
// and goes on to /v/open/<key>.
import { createHash } from "node:crypto";

/** How long an opened View Link can be reloaded before the link has to be opened again. */
export const OPEN_SECONDS = 12 * 60 * 60;

/** The key of an address that is no View Link at all: its page only says that the link does not work. */
export const NO_LINK = "gone";

/** Whether a piece of an address could be a View Link's token: short enough for a cookie, and nothing a cookie would change. */
export const couldBeToken = (token: string) => /^[A-Za-z0-9_-]{1,200}$/.test(token);

/** What stands in the address of an opened View Link: tells links apart and opens nothing, as the token cannot be worked out from it. */
export const viewKey = (token: string) => createHash("sha256").update(`ziffr-view-address:${token}`).digest("base64url").slice(0, 22);

/** The name of the cookie that holds one opened link's token. */
export const viewCookie = (key: string) => `ziffr_view_${key}`;

/** The one path that cookie is sent to: the opened link's own page. */
export const viewPath = (key: string) => `/v/open/${key}`;

/** The token for a page's key, from that key's cookie: null when there is none or it belongs to another link. */
export function tokenFor(key: string, cookie: string | undefined): string | null {
  return cookie && couldBeToken(cookie) && viewKey(cookie) === key ? cookie : null;
}
