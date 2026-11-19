"use server";
// Installation Settings and Installation Admins (spec 0025; GLOSSARY: Installation Admin, Installation Settings):
// thin calls into the core, which checks who may do each. Each answers an error text instead of throwing, so the
// page can show the core's words in a production build too; anyone who may not answers "not found".
import { revalidatePath } from "next/cache";
import { Forbidden } from "@ziffr/core/actor";
import * as admins from "@ziffr/core/installation-admins";
import * as settings from "@ziffr/core/installation-settings";
import { installationActor } from "@/lib/installation";

/** What an action answers: nothing on success, else what went wrong in the page's words. */
type Result = { error: string } | { ok: true; message?: string };

async function run(f: (actor: admins.InstallationActor) => Promise<string | void>): Promise<Result> {
  const actor = await installationActor();
  if (!actor) return { error: "Sign in first." };
  try {
    const message = await f(actor);
    revalidatePath("/installation");
    return message ? { ok: true, message } : { ok: true };
  } catch (e) {
    // Not an Installation Admin: the same answer as for a page that is not there.
    if (e instanceof Forbidden) return { error: "Not found." };
    return { error: e instanceof Error ? e.message : "That did not work. Try again." };
  }
}

/** Claims the Installation with the setup code from the server log. */
export async function claimInstallation(code: string): Promise<Result> {
  const result = await run((a) => admins.claimInstallation(a, String(code ?? "")));
  // The top bar shows the Installation's menu item from now on.
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

/** Sends a test email to your own address with the mail settings in effect. */
export async function sendTestEmail(): Promise<Result> {
  return run(async (a) => `Sent to ${(await settings.sendTestEmail(a)).to}. Look in that inbox.`);
}
