"use server";
// Signing in and out (ADR 0003): an email link, or one of the providers that are set up.
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { claimSignInLink, networkAddress } from "@ziffr/core/sign-in-limits";
import { forBrowser } from "@/lib/auth-settings";
import { authClient, DEMO_COOKIE, demoOnly, sessionUser, personFor, signedIn } from "@/lib/auth";
import { acceptInvitation, requestToJoin } from "@ziffr/core/invitations";
import { createWorkspace as coreCreateWorkspace, isMemberOf } from "@ziffr/core/page-data";
import { WORKSPACE_COOKIE } from "@/lib/viewer";
import { safeNext, SITE_URL, enabledProviders, type Provider } from "@/lib/sign-in";

const TOO_MANY = "Too many links asked for. Wait a minute and try again.";
const DEMO_ONLY = "Signing in is off here: this Ziffr is a public demo.";

/** Sends a sign-in link to the address; the same message whether or not an account exists. */
export async function sendSignInLink(email: string, next?: string) {
  // The login page shows no form in a demo-only Ziffr; this holds for a call made without it. Auth refuses new
  // accounts there too (GOTRUE_DISABLE_SIGNUP, docker/init.mjs).
  if (demoOnly()) throw new Error(DEMO_ONLY);
  const address = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Enter a valid email address.");
  // Ziffr's own limit first (spec 0009), with the message a Supabase limit gives: the same whether or not the
  // address has an account.
  if (!(await claimSignInLink(address, networkAddress(await headers())))) throw new Error(TOO_MANY);
  const { error } = await (await authClient()).auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error) throw new Error(error.status === 429 ? TOO_MANY : "The link could not be sent. Try again.");
}

/** Starts signing in with a provider; only providers that are set up are accepted. */
export async function signInWith(provider: Provider, next?: string) {
  if (demoOnly()) throw new Error(DEMO_ONLY);
  if (!enabledProviders().includes(provider)) throw new Error("This way of signing in is not set up.");
  const { data, error } = await (await authClient()).auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error || !data.url) throw new Error("Could not start signing in. Try again.");
  redirect(forBrowser(data.url));
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
  const ws = { id: await coreCreateWorkspace(person, String(name ?? "")) };
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
  if (!(await isMemberOf(person, String(id)))) throw new Error("You are not in that workspace.");
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
