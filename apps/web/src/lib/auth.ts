import "server-only";
// Sign-in (ADR 0003, GLOSSARY: Workspace, Demo Mode): the Supabase session in cookies, and the person it belongs to.
// In Demo Mode a visitor needs no account; the "view as" cookie decides which demo person they are (see viewer.ts).
import { cookies } from "next/headers";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { authSettings } from "./auth-settings";
import { db } from "./db";
import type { SignedIn } from "@ziffr/core/invitations";
import { PERSON_COLORS } from "@ziffr/core/profile";

import { demoEnabled } from "./demo-mode";
export { demoEnabled, demoOnly } from "./demo-mode";

/** Set by "Try the demo" (/demo), removed by "Leave the demo" (/demo/leave). */
export const DEMO_COOKIE = "ziffr-demo";

/** Whether this request is a visit to the demo (ADR 0005): the demo is offered and the visitor chose it. It only ever
 * reaches the demo workspace and its made-up people, never a real workspace or account. */
export async function isDemo(): Promise<boolean> {
  return demoEnabled() && (await cookies()).get(DEMO_COOKIE)?.value === "1";
}

/** A Supabase client acting with the signed-in person's session, read from and written to cookies. */
export async function authClient() {
  const store = await cookies();
  const { url, anonKey } = authSettings();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server components cannot set cookies; the middleware refreshes the session there instead.
        try { for (const c of list) store.set(c.name, c.value, c.options); } catch { /* read-only context */ }
      },
    },
  });
}

/** The signed-in person and the address Supabase verified for them, or null when nobody is signed in. */
export async function signedIn(): Promise<SignedIn | null> {
  const user = await sessionUser();
  if (!user) return null;
  // Only a proven address counts: a provider that lets anyone set any address must not open an email invitation.
  return { personId: await personFor(user), verifiedEmail: provenEmail(user) };
}

/** The signed-in account, checked with Supabase (not just read from the cookie), or null. Asked once per request:
 * the layout, the current person and server actions all need it, and each ask is a round trip to Supabase. */
export const sessionUser = cache(async () => {
  const { data } = await (await authClient()).auth.getUser();
  return data.user ?? null;
});

/** The demo workspace (see the workspaces migration); its people are made up. */
const DEMO_WORKSPACE = "d3e00000-0000-4000-8000-000000000001";
/** The demo's made-up people (seeded with these ids), protected even while a reset is under way. */
const DEMO_PEOPLE = ["sara", "ben", "anna"];

/** Ways of signing in whose email Ziffr trusts to claim an existing person: the email link proves the address,
 * Google only hands out addresses it verified. Others (Microsoft's multi-tenant sign-in above all) may not. */
const PROVES_EMAIL = new Set(["email", "google"]);

/** The account's address if it is proven: confirmed, and from a way of signing in that proves it. The one rule for
 * claiming a person, accepting an email Invitation and Domain Joining; null otherwise. */
function provenEmail(user: { email?: string | null; email_confirmed_at?: string | null; app_metadata?: Record<string, unknown> }): string | null {
  const provider = String(user.app_metadata?.provider ?? "");
  return user.email && user.email_confirmed_at && PROVES_EMAIL.has(provider) ? user.email.toLowerCase() : null;
}

type SessionAccount = { id: string; email?: string | null; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> };

/** The person an account belongs to. The first time, an existing person with the same proven email is linked;
 * otherwise a new person is created. Safe to call twice at once. Returns their id. */
export async function personFor(user: SessionAccount): Promise<string> {
  const { data: linked } = await db.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (linked) return linked.id;
  // Only a verified email is kept, and only a proven one may claim an existing person; otherwise anyone could sign
  // up with someone else's address and take over their place, or keep the real owner out.
  const proven = provenEmail(user);
  if (proven) {
    // Never one of the demo's made-up people: they belong to the demo, which anyone may visit.
    const { data: demoPeople } = await db.from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE);
    const { data: same } = await db.from("profiles").update({ auth_user_id: user.id }).eq("email", proven).is("auth_user_id", null).not("id", "in", `(${[...DEMO_PEOPLE, ...(demoPeople ?? []).map((m) => m.user_id)].map((id) => `"${id}"`).join(",")})`).select("id").maybeSingle();
    if (same) return same.id;
  }
  const name = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? proven?.split("@")[0] ?? "New person").slice(0, 80);
  // The address is kept only when the way of signing in proves it, and nobody else holds it yet; otherwise none, so
  // nobody is reached at, or matched by, an address they may not own.
  const { data: taken } = proven ? await db.from("profiles").select("id").eq("email", proven).maybeSingle() : { data: null };
  const { error } = await db.from("profiles").upsert(
    { id: crypto.randomUUID(), auth_user_id: user.id, name, email: taken ? null : proven, role: "", color: PERSON_COLORS[Math.floor(Math.random() * PERSON_COLORS.length)] },
    { onConflict: "auth_user_id", ignoreDuplicates: true },
  );
  if (error) throw new Error("Your account could not be set up. Try signing in again.");
  // Read back: when two requests raced, both get the one person that was stored.
  const { data: person } = await db.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!person) throw new Error("Your account could not be set up. Try signing in again.");
  return person.id;
}
