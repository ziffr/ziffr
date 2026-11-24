"use server";
// Settings (spec 0006; GLOSSARY: Delivery Preference, Away, Workspace Profile): thin calls into the core, which
// changes only the acting person's own profile and email choice, and lets only Owners and Admins change the workspace.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isDemo } from "@/lib/auth";
import { APPEARANCE_COOKIE, parseAppearance } from "@ziffr/core/appearance";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as profile from "@ziffr/core/profile";
import * as businessFunction from "@ziffr/core/business-function";
import * as optOut from "@ziffr/core/email-opt-out";
import * as usageDigest from "@ziffr/core/usage-digest";
import * as workspace from "@ziffr/core/workspace-settings";
import * as fiscalYear from "@ziffr/core/fiscal-year";
import * as quiet from "@ziffr/core/quiet-hours";
import * as limits from "@ziffr/core/limits";
import * as announcements from "@ziffr/core/workspace-announcements";

/** Changes your own name and colour. */
export async function updateMyProfile(input: { name?: string; color?: string }) {
  return attempt(async () => {
    await profile.updateMyProfile(await currentActor(), { name: input?.name, color: input?.color });
    revalidatePath("/", "layout");
  });
}

/** Sets or clears your own Business Function in this Workspace (the core checks the value against the list). */
export async function setMyBusinessFunction(value: string | null) {
  return attempt(async () => {
    await businessFunction.setMyBusinessFunction(await currentActor(), value);
    revalidatePath("/settings/profile");
  });
}

/** Sets how Ziffr's own screens are drawn for you (GLOSSARY: Appearance). A person's choice is stored by the core and
 * follows them to every device; the browser keeps a copy for the sign-in page. In the demo, where nothing is stored,
 * only the browser's copy is set. */
export async function setAppearance(choice: string) {
  return attempt(async () => {
    const appearance = parseAppearance(choice);
    // Strict: a value that is not one of the four is refused, not turned into System.
    if (appearance !== choice) throw new Error("Pick one of the choices.");
    if (!(await isDemo())) await profile.setMyAppearance(await currentActor(), choice);
    (await cookies()).set(APPEARANCE_COOKIE, appearance, { path: "/", maxAge: 31536000, sameSite: "lax", httpOnly: false });
    revalidatePath("/", "layout");
  });
}

/** Renames the workspace (Owners and Admins). */
export async function renameWorkspace(name: string) {
  return attempt(async () => {
    await workspace.renameWorkspace(await currentActor(), name);
    revalidatePath("/", "layout");
  });
}

/** Sets the month the workspace's year starts in (Owners and Admins); the core checks the month and what is stored. */
export async function setYearStart(month: number) {
  return attempt(async () => {
    await fiscalYear.setYearStart(await currentActor(), month);
    // Every page names quarters and years from it.
    revalidatePath("/", "layout");
  });
}

/** Sets the workspace's Number Style (Owners and Admins); the core checks it is one of the four. */
export async function setNumberStyle(style: string) {
  return attempt(async () => {
    await workspace.setNumberStyle(await currentActor(), style);
    // Every page will write its values in it.
    revalidatePath("/", "layout");
  });
}

/** Sets the languages answers are read in (Owners and Admins); the core keeps only languages it has words for. */
export async function setAnswerLanguages(languages: string[]) {
  return attempt(async () => {
    await workspace.setAnswerLanguages(await currentActor(), languages);
    revalidatePath("/settings/workspace");
  });
}

/** Sets the workspace's Attainment method (Owners and Admins); the core checks it is ratio or distance. */
export async function setAttainmentMethod(method: string) {
  return attempt(async () => {
    await workspace.setAttainmentMethod(await currentActor(), method);
    // Every Attainment of a Metric without a method of its own changes.
    revalidatePath("/", "layout");
  });
}

/** Sets the Workspace Profile (Owners and Admins); the core checks every field against its list. */
export async function setWorkspaceProfile(input: Record<string, string | null>) {
  return attempt(async () => {
    await workspace.setWorkspaceProfile(await currentActor(), input);
    revalidatePath("/settings/workspace");
  });
}

/** Turns Prompts and reminders by email on or off for you in this workspace. */
export async function setEmailReminders(on: boolean) {
  return attempt(async () => {
    const actor = await currentActor();
    if (on === true) await optOut.optBackIn(actor);
    else await optOut.optOutOfEmail(actor);
    revalidatePath("/settings/deliveries");
    revalidatePath("/connectors", "layout");
  });
}

/** Turns the monthly usage email on or off for you, in every workspace of yours (Owners get it). */
export async function setUsageDigestOn(on: boolean) {
  return attempt(async () => {
    await usageDigest.setUsageDigest(await currentActor(), on === true);
    revalidatePath("/settings/deliveries");
  });
}

/** Sets your own quiet hours, or with null follows the Workspace's default again; the core checks the shape. */
export async function setMyQuietHours(rule: { fromHour: number; toHour: number; days: number[]; timeZone: string | null } | null) {
  return attempt(async () => {
    await quiet.setMyQuietHours(await currentActor(), rule === null ? null : { fromHour: Number(rule?.fromHour), toHour: Number(rule?.toHour), days: Array.isArray(rule?.days) ? rule.days.map(Number) : [], timeZone: rule?.timeZone == null ? null : String(rule.timeZone) });
    revalidatePath("/settings/deliveries");
  });
}

/** Sets the Workspace's default quiet hours, or with null removes them (Owners and Admins). */
export async function setWorkspaceQuietHours(rule: { fromHour: number; toHour: number; days: number[] } | null) {
  return attempt(async () => {
    await quiet.setWorkspaceQuietHours(await currentActor(), rule === null ? null : { fromHour: Number(rule?.fromHour), toHour: Number(rule?.toHour), days: Array.isArray(rule?.days) ? rule.days.map(Number) : [], timeZone: null });
    revalidatePath("/settings/workspace");
    revalidatePath("/settings/deliveries");
  });
}

/** Sets or clears one limit of the workspace (Owners and Admins); the core checks the key and the range again. */
export async function setWorkspaceSettableLimit(key: string, value: number | null) {
  return attempt(async () => {
    await limits.setWorkspaceSettableLimit(await currentActor(), key, value);
    revalidatePath("/", "layout");
  });
}

/** Sets or clears one limit of your own; the core checks the key and the range again. */
export async function setMySettableLimit(key: string, value: number | null) {
  return attempt(async () => {
    await limits.setMySettableLimit(await currentActor(), key, value);
    revalidatePath("/", "layout");
  });
}

// Workspace Announcements (spec 0054; GLOSSARY: Announcement): the core checks Owner or Admin, the Workspace and every field again.

/** Makes an Announcement for the Workspace from what the form sent (Owners and Admins). */
export async function createWorkspaceAnnouncement(input: unknown) {
  return attempt(async () => {
    await announcements.createWorkspaceAnnouncement(await currentActor(), input);
    revalidatePath("/settings/workspace");
    return { ok: true as const, message: "Announcement added." };
  });
}

/** Changes every field of one of the Workspace's Announcements (Owners and Admins). */
export async function updateWorkspaceAnnouncement(id: string, input: unknown) {
  return attempt(async () => {
    await announcements.updateWorkspaceAnnouncement(await currentActor(), String(id ?? ""), input);
    revalidatePath("/settings/workspace");
    return { ok: true as const, message: "Announcement saved." };
  });
}

/** Switches one of the Workspace's Announcements on or off (Owners and Admins). */
export async function setWorkspaceAnnouncementActive(id: string, active: boolean) {
  return attempt(async () => {
    await announcements.setWorkspaceAnnouncementActive(await currentActor(), String(id ?? ""), active === true);
    revalidatePath("/settings/workspace");
    return { ok: true as const, message: active === true ? "Announcement switched on." : "Announcement switched off." };
  });
}

/** Deletes one of the Workspace's Announcements for good (Owners and Admins). */
export async function deleteWorkspaceAnnouncement(id: string) {
  return attempt(async () => {
    await announcements.deleteWorkspaceAnnouncement(await currentActor(), String(id ?? ""));
    revalidatePath("/settings/workspace");
    return { ok: true as const, message: "Announcement deleted." };
  });
}
