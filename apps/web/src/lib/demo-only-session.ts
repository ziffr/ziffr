// A demo-only Ziffr ignores any real session (GLOSSARY: Demo Mode; spec 0051). Nobody signs in there, so a sign-in cookie
// that a browser still holds from before the Installation became demo-only (a trial or an account made when it offered
// them) must neither make the visitor "someone without a Workspace" nor reach a write path. Pure, so the rule is one test.

/** The sign-in cookies of Supabase Auth (the session, its chunks and the code verifier): `sb-<project>-auth-token...`. */
const AUTH_COOKIE = /^sb-.+-auth-token/;

/** The names of the cookies that hold a real session among `names`: what a demo-only Ziffr clears, none elsewhere. */
export function staleSessionCookies(demoOnly: boolean, names: readonly string[]): string[] {
  return demoOnly ? names.filter((n) => AUTH_COOKIE.test(n)) : [];
}

/** Whether a request counts as signed in: never in a demo-only Ziffr, whatever cookie it carries; else when it has a session cookie. */
export function countsAsSignedIn(demoOnly: boolean, hasSessionCookie: boolean): boolean {
  return !demoOnly && hasSessionCookie;
}
