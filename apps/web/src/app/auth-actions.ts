"use server";
// Signing in and out (ADR 0003): an email link, or one of the providers that are set up.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authClient, DEMO_COOKIE, sessionUser, personFor, signedIn } from "@/lib/auth";
import { acceptInvitation, requestToJoin } from "@ziffr/core/invitations";
import { db } from "@/lib/db";
import { WORKSPACE_COOKIE } from "@/lib/viewer";
import { STARTER_THEME } from "@ziffr/core/themes";
import { safeNext, SITE_URL, enabledProviders, type Provider } from "@/lib/sign-in";

/** Sends a sign-in link to the address; the same message whether or not an account exists. */
export async function sendSignInLink(email: string, next?: string) {
  const address = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Enter a valid email address.");
  const { error } = await (await authClient()).auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error) throw new Error(error.status === 429 ? "Too many links asked for. Wait a minute and try again." : "The link could not be sent. Try again.");
}

/** Starts signing in with a provider; only providers that are set up are accepted. */
export async function signInWith(provider: Provider, next?: string) {
  if (!enabledProviders().includes(provider)) throw new Error("This way of signing in is not set up.");
  const { data, error } = await (await authClient()).auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error || !data.url) throw new Error("Could not start signing in. Try again.");
  redirect(data.url);
}

export async function signOut() {
  await (await authClient()).auth.signOut();
  (await cookies()).delete(WORKSPACE_COOKIE);
  redirect("/login");
}

/** A signed-in person without a workspace creates one and becomes its Owner (GLOSSARY: Workspace, Workspace Role). */
export async function createWorkspace(name: string) {
  const user = await sessionUser();
  if (!user) redirect("/login");
  const person = await personFor(user);
  const title = String(name ?? "").trim().slice(0, 80);
  if (!title) throw new Error("Give the workspace a name.");
  const { data: ws, error } = await db.from("workspaces").insert({ name: title }).select("id").single();
  if (error || !ws) throw new Error("The workspace could not be created.");
  await db.from("memberships").insert({ workspace_id: ws.id, user_id: person, role: "owner" });
  // Every workspace starts with the Theme Ziffr ships with, never a copy of another workspace's (logo, footer).
  await db.from("themes").insert({ ...STARTER_THEME, owner_id: person, is_default: true, workspace_id: ws.id });
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, ws.id, { httpOnly: true, sameSite: "lax", path: "/" });
  jar.delete(DEMO_COOKIE); // working in one's own workspace ends a demo visit
  redirect("/");
}

/** Switches to another of the person's workspaces. */
export async function switchWorkspace(id: string) {
  const user = await sessionUser();
  if (!user) redirect("/login");
  const person = await personFor(user);
  const { data } = await db.from("memberships").select("workspace_id").eq("user_id", person).eq("workspace_id", id).maybeSingle();
  if (!data) throw new Error("You are not in that workspace.");
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  jar.delete(DEMO_COOKIE);
  redirect("/");
}

/** The signed-in person accepts an invitation and opens the workspace. */
export async function acceptInvite(token: string) {
  const who = await signedIn();
  if (!who) redirect("/login");
  const ws = await acceptInvitation(who, String(token ?? ""));
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, ws, { httpOnly: true, sameSite: "lax", path: "/" });
  jar.delete(DEMO_COOKIE);
  redirect("/");
}

/** Asks to join a workspace of the person's company domain; an Owner or Admin decides. */
export async function askToJoin(workspaceId: string) {
  const who = await signedIn();
  if (!who) redirect("/login");
  await requestToJoin(who, String(workspaceId ?? ""));
}
