"use server";
// Settings (spec 0006; GLOSSARY: Delivery Preference, Away, Workspace Profile): thin calls into the core, which
// changes only the acting person's own profile and email choice, and lets only Owners and Admins change the workspace.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import * as profile from "@ziffr/core/profile";
import * as optOut from "@ziffr/core/email-opt-out";
import * as workspace from "@ziffr/core/workspace-settings";
import * as fiscalYear from "@ziffr/core/fiscal-year";

/** Changes your own name and colour. */
export async function updateMyProfile(input: { name?: string; color?: string }) {
  await profile.updateMyProfile(await currentActor(), { name: input?.name, color: input?.color });
  revalidatePath("/", "layout");
}

/** Renames the workspace (Owners and Admins). */
export async function renameWorkspace(name: string) {
  await workspace.renameWorkspace(await currentActor(), name);
  revalidatePath("/", "layout");
}

/** Sets the month the workspace's year starts in (Owners and Admins); the core checks the month and what is stored. */
export async function setYearStart(month: number) {
  await fiscalYear.setYearStart(await currentActor(), month);
  // Every page names quarters and years from it.
  revalidatePath("/", "layout");
}

/** Sets the workspace's Number Style (Owners and Admins); the core checks it is one of the four. */
export async function setNumberStyle(style: string) {
  await workspace.setNumberStyle(await currentActor(), style);
  // Every page will write its values in it.
  revalidatePath("/", "layout");
}

/** Sets the languages answers are read in (Owners and Admins); the core keeps only languages it has words for. */
export async function setAnswerLanguages(languages: string[]) {
  await workspace.setAnswerLanguages(await currentActor(), languages);
  revalidatePath("/settings/workspace");
}

/** Sets the workspace's Attainment method (Owners and Admins); the core checks it is ratio or distance. */
export async function setAttainmentMethod(method: string) {
  await workspace.setAttainmentMethod(await currentActor(), method);
  // Every Attainment of a Metric without a method of its own changes.
  revalidatePath("/", "layout");
}

/** Sets the Workspace Profile (Owners and Admins); the core checks every field against its list. */
export async function setWorkspaceProfile(input: Record<string, string | null>) {
  await workspace.setWorkspaceProfile(await currentActor(), input);
  revalidatePath("/settings/workspace");
}

/** Turns Prompts and reminders by email on or off for you in this workspace. */
export async function setEmailReminders(on: boolean) {
  const actor = await currentActor();
  if (on === true) await optOut.optBackIn(actor);
  else await optOut.optOutOfEmail(actor);
  revalidatePath("/settings/deliveries");
  revalidatePath("/connectors");
}
