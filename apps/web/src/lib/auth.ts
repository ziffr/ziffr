import "server-only";
// Sign-in (ADR 0003, GLOSSARY: Workspace, Demo Mode): the Supabase session in cookies, and the person it belongs to.
// In Demo Mode there is no sign-in; the "view as" cookie decides who is looking (see viewer.ts).
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { db } from "./db";

/** Whether Ziffr runs in Demo Mode (GLOSSARY: Demo Mode): made-up data, "view as", no sign-in. */
export const isDemo = () => process.env.ZIFFR_DEMO === "1";

/** A Supabase client acting with the signed-in person's session, read from and written to cookies. */
export async function authClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server components cannot set cookies; the middleware refreshes the session there instead.
        try { for (const c of list) store.set(c.name, c.value, c.options); } catch { /* read-only context */ }
      },
    },
  });
}

/** The signed-in account, checked with Supabase (not just read from the cookie), or null. */
export async function sessionUser() {
  const { data } = await (await authClient()).auth.getUser();
  return data.user ?? null;
}

const COLORS = ["#7C5A3A", "#3A6B7C", "#6B3A7C", "#3A7C52", "#7C3A45", "#5A5A7C"];

/** Ways of signing in whose email Ziffr trusts to claim an existing person: the email link proves the address,
 * Google only hands out addresses it verified. Others (Microsoft's multi-tenant sign-in above all) may not. */
const PROVES_EMAIL = new Set(["email", "google"]);

type SessionAccount = { id: string; email?: string | null; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> };

/** The person an account belongs to. The first time, an existing person with the same proven email is linked;
 * otherwise a new person is created. Safe to call twice at once. Returns their id. */
export async function personFor(user: SessionAccount): Promise<string> {
  const { data: linked } = await db.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (linked) return linked.id;
  // Only a verified email is kept, and only a proven one may claim an existing person; otherwise anyone could sign
  // up with someone else's address and take over their place, or keep the real owner out.
  const verified = user.email && user.email_confirmed_at ? user.email.toLowerCase() : null;
  const provider = String(user.app_metadata?.provider ?? "");
  if (verified && PROVES_EMAIL.has(provider)) {
    const { data: same } = await db.from("profiles").update({ auth_user_id: user.id }).eq("email", verified).is("auth_user_id", null).select("id").maybeSingle();
    if (same) return same.id;
  }
  const name = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? verified?.split("@")[0] ?? "New person").slice(0, 80);
  // Another person may already hold that address (not linked because the provider does not prove it): keep none.
  const { data: taken } = verified ? await db.from("profiles").select("id").eq("email", verified).maybeSingle() : { data: null };
  const { error } = await db.from("profiles").upsert(
    { id: crypto.randomUUID(), auth_user_id: user.id, name, email: taken ? null : verified, role: "", color: COLORS[Math.floor(Math.random() * COLORS.length)] },
    { onConflict: "auth_user_id", ignoreDuplicates: true },
  );
  if (error) throw new Error("Your account could not be set up. Try signing in again.");
  // Read back: when two requests raced, both get the one person that was stored.
  const { data: person } = await db.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!person) throw new Error("Your account could not be set up. Try signing in again.");
  return person.id;
}
