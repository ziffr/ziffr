"use server";
// Installation Settings and Installation Admins (spec 0025; GLOSSARY: Installation Admin, Installation Settings):
// thin calls into the core, which checks who may do each. Each answers an error text instead of throwing, so the
// page can show the core's words in a production build too; anyone who may not answers "not found".
import { forPeople } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { Forbidden } from "@ziffr/core/actor";
import * as admins from "@ziffr/core/installation-admins";
import * as settings from "@ziffr/core/installation-settings";
import * as replies from "@ziffr/core/installation-replies";
import * as telegramTest from "@ziffr/core/installation-telegram-test";
import * as limits from "@ziffr/core/workspace-limits-admin";
import * as keyChange from "@ziffr/core/workspace-key-change";
import * as usage from "@ziffr/core/installation-usage";
import * as announcements from "@ziffr/core/installation-announcements";
import { installationActor } from "@/lib/installation";
import * as practice from "@ziffr/core/practice-workspace";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE } from "@/lib/auth";
import { optionalActor, WORKSPACE_COOKIE } from "@/lib/viewer";

/** What an action answers: what went wrong in the page's words, or that it worked, with a line to show and a
 * problem that did not stop it. */
// Only Ziffr's own words go back (forPeople); anything else is logged here and answered with one line, so no
// internal or provider detail reaches the page.
function unforeseen(e: unknown): string {
  console.error("An Installation settings action failed:", e);
  return "That did not work. Try again.";
}

type Result = { error: string } | { ok: true; message?: string; warning?: string };

async function run(f: (actor: admins.InstallationActor) => Promise<string | void | { notice: string | null; warning: string | null }>): Promise<Result> {
  const actor = await installationActor();
  if (!actor) return { error: "Sign in first." };
  try {
    const said = await f(actor);
    revalidatePath("/installation");
    if (said && typeof said === "object") return { ok: true, ...(said.notice ? { message: said.notice } : {}), ...(said.warning ? { warning: said.warning } : {}) };
    return said ? { ok: true, message: said } : { ok: true };
  } catch (e) {
    // Not an Installation Admin: the same answer as for a page that is not there.
    if (e instanceof Forbidden) return { error: "Not found." };
    return { error: forPeople(e) ?? unforeseen(e) };
  }
}

/** Claims the Installation with the setup code from the server log. */
export async function claimInstallation(code: string): Promise<Result> {
  const result = await run((a) => admins.claimInstallation(a, String(code ?? "")));
  // The sidebar's menu shows the Installation's menu item from now on.
  if ("ok" in result) revalidatePath("/", "layout");
  return result;
}

/** Adds an Installation Admin by the address of someone who signed in here before. */
export async function addInstallationAdmin(email: string): Promise<Result> {
  return run((a) => admins.addInstallationAdmin(a, String(email ?? "")));
}

/** Removes an Installation Admin added on the page; never the last one. */
export async function removeInstallationAdmin(personId: string): Promise<Result> {
  const result = await run((a) => admins.removeInstallationAdmin(a, String(personId ?? "")));
  if ("ok" in result) revalidatePath("/", "layout");
  return result;
}

/** Saves the settings of one section: text sets one, null removes it. */
export async function saveInstallationSettings(section: string, values: Record<string, string | null>): Promise<Result> {
  return run((a) => settings.saveInstallationSettings(a, String(section ?? ""), values));
}

/** Asks Telegram about the bot in effect and registers its webhook again. */
export async function checkTelegram(): Promise<Result> {
  return run(async (a) => {
    const r = await settings.checkTelegram(a);
    return r.ok ? r.message : { notice: null, warning: r.message };
  });
}

/** Sends a test email to your own address with the mail settings in effect. */
export async function sendTestEmail(): Promise<Result> {
  return run(async (a) => `Sent to ${(await settings.sendTestEmail(a)).to}. Look in that inbox.`);
}

/** Starts the Telegram round trip test: answers the link that opens the bot with a one-time code. */
export async function startTelegramTest(): Promise<{ error: string } | { url: string }> {
  const actor = await installationActor();
  if (!actor) return { error: "Sign in first." };
  try {
    return await telegramTest.startTelegramTest(actor);
  } catch (e) {
    if (e instanceof Forbidden) return { error: "Not found." };
    return { error: forPeople(e) ?? unforeseen(e) };
  }
}

/** Where the actor's latest Telegram test stands, while the page waits for it. */
export async function telegramTestStatus(): Promise<telegramTest.TelegramTestStatus | { error: string }> {
  const actor = await installationActor();
  if (!actor) return { error: "Sign in first." };
  try {
    return await telegramTest.telegramTestStatus(actor);
  } catch {
    return { error: "Not found." };
  }
}

/** Runs an action that answers a secret this once: the secret, or what went wrong in the page's words. */
async function secretOnce(make: (a: admins.InstallationActor) => Promise<{ secret: string }>): Promise<{ error: string } | { secret: string }> {
  const actor = await installationActor();
  if (!actor) return { error: "Sign in first." };
  try {
    const r = await make(actor);
    revalidatePath("/installation");
    return r;
  } catch (e) {
    if (e instanceof Forbidden) return { error: "Not found." };
    return { error: forPeople(e) ?? unforeseen(e) };
  }
}

/** Makes a new signing secret for replies by email and answers it this once, for the inbound provider's forwarder. */
export async function makeInboundSecret(): Promise<{ error: string } | { secret: string }> {
  return secretOnce((a) => replies.makeInboundSecret(a));
}

/** Starts the replies-by-email test: an email to your own address whose reply comes back through the provider. */
export async function startReplyTest(): Promise<Result> {
  return run(async (a) => `Sent to ${(await replies.startReplyTest(a)).to}. Reply to it; this page says when the reply arrives.`);
}

/** Where the actor's latest replies-by-email test stands, while the page waits for it. */
export async function replyTestStatus(): Promise<replies.ReplyTestStatus | { error: string }> {
  const actor = await installationActor();
  if (!actor) return { error: "Sign in first." };
  try {
    return await replies.replyTestStatus(actor);
  } catch {
    return { error: "Not found." };
  }
}

/** Sets one Workspace's own limit (`metrics` empty for none), or with null gives it back to the default. */
export async function setWorkspaceLimit(workspaceId: string, value: { metrics: string; label: string } | null): Promise<Result> {
  return run((a) => limits.setWorkspaceLimit(a, String(workspaceId ?? ""), value === null ? null : { metrics: String(value?.metrics ?? ""), label: String(value?.label ?? "") }));
}

/** Makes a new key version current for one Workspace; the re-encryption job moves its data over (spec 0028). */
export async function changeWorkspaceKey(workspaceId: string): Promise<Result> {
  return run(async (a) => { await keyChange.changeWorkspaceKey(a, String(workspaceId ?? "")); return "The Workspace Key was changed. The encryption job moves the data over, a little at a time."; });
}

/** Makes a Usage Key and answers its secret this once; a live one stops working. */
export async function makeUsageKey(): Promise<{ error: string } | { secret: string }> {
  return secretOnce((a) => usage.makeUsageKey(a));
}

/** Revokes the live Usage Key. */
export async function revokeUsageKey(): Promise<Result> {
  return run((a) => usage.revokeUsageKey(a));
}

// Announcements (spec 0054; GLOSSARY: Announcement): the core checks every field again and the Installation Admin.

/** Makes an Announcement from what the form sent. */
export async function createInstallationAnnouncement(input: unknown): Promise<Result> {
  return run(async (a) => { await announcements.createInstallationAnnouncement(a, input); return "Announcement added."; });
}

/** Changes every field of an Announcement. */
export async function updateInstallationAnnouncement(id: string, input: unknown): Promise<Result> {
  return run(async (a) => { await announcements.updateInstallationAnnouncement(a, String(id ?? ""), input); return "Announcement saved."; });
}

/** Switches an Announcement on or off. */
export async function setInstallationAnnouncementActive(id: string, active: boolean): Promise<Result> {
  return run(async (a) => { await announcements.setInstallationAnnouncementActive(a, String(id ?? ""), active === true); return active === true ? "Announcement switched on." : "Announcement switched off."; });
}

/** Deletes an Announcement for good. */
export async function deleteInstallationAnnouncement(id: string): Promise<Result> {
  return run(async (a) => { await announcements.deleteInstallationAnnouncement(a, String(id ?? "")); return "Announcement deleted."; });
}

// The Practice Workspace (spec 0063; GLOSSARY: Practice Workspace): the core decides who may make one and start it over.

/** Makes or remakes the person's Practice Workspace and opens it; what went wrong comes back as words. */
async function openedPracticeWorkspace(work: (actor: admins.InstallationActor, from: string | null) => Promise<string>): Promise<{ error: string }> {
  const actor = await installationActor();
  if (!actor) return { error: "Sign in first." };
  let id: string;
  try {
    id = await work(actor, (await optionalActor())?.workspaceId ?? null);
  } catch (e) {
    return { error: forPeople(e) ?? unforeseen(e) };
  }
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  jar.delete(DEMO_COOKIE);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Makes the Practice Workspace of an Installation Admin and opens it. */
export async function makePracticeWorkspace(): Promise<{ error: string }> {
  return openedPracticeWorkspace((actor, from) => practice.makePracticeWorkspace(actor, from));
}

/** Deletes the named Practice Workspace, the person's own, makes a fresh one and opens it. */
export async function startOverPracticeWorkspace(workspaceId: string): Promise<{ error: string }> {
  return openedPracticeWorkspace((actor, from) => practice.startOverPracticeWorkspace(actor, String(workspaceId ?? ""), from));
}
