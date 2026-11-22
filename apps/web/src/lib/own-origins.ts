// This app's own origins (GLOSSARY: none): which sites a form post may come from. Shared by the middleware and by routes
// that must not be started from another site.

/** The origin the request reached, and the public one (ZIFFR_SITE_URL) when a proxy is in front. */
export function ownOrigins(requestOrigin: string): Set<string> {
  const own = new Set([requestOrigin]);
  try {
    if (process.env.ZIFFR_SITE_URL) own.add(new URL(process.env.ZIFFR_SITE_URL).origin);
  } catch {
    // A malformed setting adds nothing.
  }
  return own;
}
