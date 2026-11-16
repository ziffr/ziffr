// Where sign-in reaches Supabase Auth (ADR 0003, spec 0015). Read when a request needs them, not when the app is built:
// one published image serves every Installation, and Next.js would fix NEXT_PUBLIC_* settings into the build. Not
// server-only, because the middleware uses it too; it holds only the address and the public anon key.

/** The Supabase address and anon key the server signs people in with. SUPABASE_URL and SUPABASE_ANON_KEY first;
 * NEXT_PUBLIC_SUPABASE_* are read when those are not set, so installations made before spec 0015 keep working. */
export function authSettings(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set for sign-in.");
  return { url, anonKey };
}

/** A sign-in address made with the server's own route to Supabase, rewritten to the one browsers reach
 * (SUPABASE_PUBLIC_URL), when the two differ: inside Docker the server talks to Auth on an internal network. */
export function forBrowser(address: string): string {
  const pub = process.env.SUPABASE_PUBLIC_URL?.replace(/\/$/, "");
  const own = authSettings().url.replace(/\/$/, "");
  return pub && address.startsWith(own + "/") ? pub + address.slice(own.length) : address;
}
