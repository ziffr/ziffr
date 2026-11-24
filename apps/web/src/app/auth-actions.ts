"use server";
// Signing in and out (ADR 0003): an email link, or one of the providers that are set up.
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { claimSignInLink, networkAddress } from "@ziffr/core/sign-in-limits";
import { forBrowser } from "@/lib/auth-settings";
import { authClient, DEMO_COOKIE, demoOnly, sessionUser, personFor, signedIn } from "@/lib/auth";
import { acceptInvitation, requestToJoin } from "@ziffr/core/invitations";
import { createWorkspace as coreCreateWorkspace, isMemberOf } from "@ziffr/core/page-data";
import { currentActor, WORKSPACE_COOKIE } from "@/lib/viewer";
import { endTrialNow as coreEndTrialNow } from "@ziffr/core/trial-end";
import { safeNext, SITE_URL, enabledProviders, type Provider } from "@/lib/sign-in";
import { turnstilePassed } from "@/lib/turnstile";
import { attempt, forPeople } from "@/lib/action-result";
import { UNEXPECTED } from "@/lib/action-error";

const TOO_MANY = "Too many links asked for. Wait a minute and try again.";
const DEMO_ONLY = "Signing in is off here: this Ziffr is a public demo.";
const BOT_CHECK = "The check against bots did not pass. Try it again.";

// Both return what went wrong instead of throwing it: a production build replaces a thrown message with a generic
// one ("An error occurred in the Server Components render"), and the person would never learn why.

/** Sends a sign-in link to the address; the same message whether or not an account exists. */
export async function sendSignInLink(email: string, next?: string, check?: string): Promise<{ error: string } | void> {
  // The login page shows no form in a demo-only Ziffr; this holds for a call made without it. Auth refuses new
  // accounts there too (GOTRUE_DISABLE_SIGNUP, docker/init.mjs).
  if (demoOnly()) return { error: DEMO_ONLY };
  const address = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { error: "Enter a valid email address." };
  // The check against bots, where it is set up (spec 0021): verified with Cloudflare before anything is counted or sent.
  const place = networkAddress(await headers());
  if (!(await turnstilePassed(check, place))) return { error: BOT_CHECK };
  // Ziffr's own limit first (spec 0009), with the message a Supabase limit gives: the same whether or not the
  // address has an account.
  if (!(await claimSignInLink(address, place))) return { error: TOO_MANY };
  const { error } = await (await authClient()).auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error) return { error: error.status === 429 ? TOO_MANY : "The link could not be sent. Try again." };
}

/** Starts signing in with a provider; only providers that are set up are accepted. */
export async function signInWith(provider: Provider, next?: string, check?: string): Promise<{ error: string } | void> {
  if (demoOnly()) return { error: DEMO_ONLY };
  // The same check against bots as for a link (spec 0021): a provider account makes a trial too.
  if (!(await turnstilePassed(check, networkAddress(await headers())))) return { error: BOT_CHECK };
  if (!enabledProviders().includes(provider)) return { error: "This way of signing in is not set up." };
  const { data, error } = await (await authClient()).auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error || !data.url) return { error: "Could not start signing in. Try again." };
  redirect(forBrowser(data.url));
}

export async function signOut() {
  await (await authClient()).auth.signOut();
  (await cookies()).delete(WORKSPACE_COOKIE);
  redirect("/login");
}

/** Signs the Owner out and back to the sign-in page, which returns them to the Workspace Export page: a Workspace
 * Export asks for a sign-in from the last 10 minutes (spec 0040), and signing in is what makes one. */
export async function signInAgainForExport() {
  await (await authClient()).auth.signOut();
  redirect(`/login?next=${encodeURIComponent("/settings/export")}`);
}

/** A signed-in person without a workspace creates one and becomes its Owner (GLOSSARY: Workspace, Workspace Role).
 * Why a trial could not be made comes back as words, not as a thrown error, whose message production builds hide. */
export async function createWorkspace(name: string): Promise<{ error: string } | void> {
  const user = await sessionUser();
  if (!user) redirect("/login");
  const person = await personFor(user);
  let ws: { id: string };
  try {
    ws = { id: await coreCreateWorkspace(person, String(name ?? "")) };
  } catch (e) {
    // A trial that may not be made, or a name the core refuses, says why; anything else is logged and stays here.
    const words = forPeople(e);
    if (words !== null) return { error: words };
    throw e;
  }
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, ws.id, { httpOnly: true, sameSite: "lax", path: "/" });
  jar.delete(DEMO_COOKIE); // working in one's own workspace ends a demo visit
  // Every new Workspace, a trial included, opens on the Setup Guide (spec 0052): a fixed path.
  redirect("/setup");
}

/** Switches to another of the person's workspaces. */
export async function switchWorkspace(id: string) {
  return attempt(async () => {
    const user = await sessionUser();
    if (!user) redirect("/login");
    const person = await personFor(user);
    if (!(await isMemberOf(person, String(id)))) throw new Error("You are not in that workspace.");
    const jar = await cookies();
    jar.set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
    jar.delete(DEMO_COOKIE);
    redirect("/");
  });
}

/** The signed-in person accepts an invitation and opens the workspace. */
export async function acceptInvite(token: string) {
  return attempt(async () => {
    const who = await signedIn();
    if (!who) redirect("/login");
    const ws = await acceptInvitation(who, String(token ?? ""));
    const jar = await cookies();
    jar.set(WORKSPACE_COOKIE, ws, { httpOnly: true, sameSite: "lax", path: "/" });
    jar.delete(DEMO_COOKIE);
    redirect("/");
  });
}

/** Asks to join a workspace of the person's company domain; an Owner or Admin decides. */
export async function askToJoin(workspaceId: string) {
  return attempt(async () => {
    const who = await signedIn();
    if (!who) redirect("/login");
    await requestToJoin(who, String(workspaceId ?? ""));
  });
}

/** The Owner ends their trial now (spec 0021): it is deleted with everything in it, and they are signed out. */
export async function endMyTrial(): Promise<{ error: string } | void> {
  try {
    await coreEndTrialNow(await currentActor());
  } catch (e) {
    // Only the core's refusals say why; a database or programming error is logged and answered with one line.
    const words = forPeople(e);
    if (words === null) console.error("Ending a trial failed:", e);
    return { error: words ?? UNEXPECTED };
  }
  await (await authClient()).auth.signOut();
  (await cookies()).delete(WORKSPACE_COOKIE);
  redirect("/login");
}
