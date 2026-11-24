"use server";
// The Setup Guide's actions (spec 0052; GLOSSARY: Setup Guide, Workspace Profile, Business Function): each calls the
// core with the current person, which checks the role and every value against its list. Nothing here decides who may do
// what: a Member who sends a Workspace answer is refused by the core, in words.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as businessFunction from "@ziffr/core/business-function";
import * as workspace from "@ziffr/core/workspace-settings";
import * as clock from "@ziffr/core/workspace-clock";
import * as fiscalYear from "@ziffr/core/fiscal-year";
import * as guide from "@ziffr/core/setup-guide";
import { refuseInDemo } from "@ziffr/core/demo";
import { setUpGuideFromPack } from "@ziffr/core/setup-from-pack";
import type { PackSetupInput } from "@ziffr/core/pack-setup";

/** What About you sends: each part only when the person answered it. */
export type AboutYouInput = {
  profile?: Record<string, string | null>;
  clock?: { timeZone: string; runHour: number; weekStart?: number };
  yearStart?: number;
  businessFunction?: string | null;
};

/** Saves the answers of About you: the person's own function, and for Owners and Admins the Workspace Profile, the
 * clock (which also notes that it was saved on purpose) and the year start. Untrusted input: only the known parts are
 * taken, and the core checks each value against its list. */
export async function saveAboutYou(input: AboutYouInput) {
  return attempt(async () => {
    const actor = await currentActor();
    // The demo never has a guide: say its one sentence before any part is tried.
    refuseInDemo(actor);
    const i = (input && typeof input === "object" ? input : {}) as Partial<AboutYouInput>;
    if (i.businessFunction !== undefined) await businessFunction.setMyBusinessFunction(actor, i.businessFunction);
    if (i.profile !== undefined) await workspace.setWorkspaceProfile(actor, i.profile);
    if (i.clock !== undefined) await clock.setWorkspaceClock(actor, { timeZone: String(i.clock?.timeZone ?? ""), runHour: Number(i.clock?.runHour), weekStart: i.clock?.weekStart === undefined ? undefined : Number(i.clock.weekStart) });
    if (i.yearStart !== undefined) await fiscalYear.setYearStart(actor, Number(i.yearStart));
    revalidatePath("/setup");
    revalidatePath("/settings/workspace");
  });
}

/** Skips one step of the guide (the core checks the step's name and who may skip it). */
export async function skipStep(step: string) {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    await guide.skipSetupStep(actor, step);
    revalidatePath("/setup");
  });
}

/** Chooses "Explore on my own" as the starting point: the Workspace starts from scratch (Owners and Admins; the core checks). */
export async function chooseExplore() {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    await guide.chooseExploreOnMyOwn(actor);
    revalidatePath("/setup");
  });
}

/** Makes the first Metrics from an installed Pack for the Starting point. Untrusted input: the core checks the install,
 * every key and every person, and leaves out what an earlier click already made. */
export async function setUpFromPackInGuide(installId: number, input: PackSetupInput) {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    const made = await setUpGuideFromPack(actor, Number(installId), input);
    revalidatePath("/", "layout");
    return made;
  });
}

/** Hides the Setup line for this person in this Workspace until they reopen it (spec 0052; nothing brings it back on its own). */
export async function hideSetup() {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    await guide.hideSetupGuide(actor);
    revalidatePath("/", "layout");
  });
}

/** Reopens the guide for this person: the Setup line is shown again, and a Workspace made before the guide gets its row. */
export async function reopenSetup() {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    await guide.reopenSetupGuide(actor);
    revalidatePath("/", "layout");
  });
}

/** What the Slide-over lists: only the viewer's own steps with their state (ids and ticks, no values or people). */
export type SetupPanelData = { steps: { id: string; ticked: boolean; skipped: boolean; next: boolean }[]; ticked: number; total: number };

/** Reads the viewer's steps for the Slide-over, or nothing when they have no guide (a Guest). Changes nothing. */
export async function readSetupSteps() {
  return attempt(async (): Promise<SetupPanelData | null> => {
    const g = await guide.setupGuide(await currentActor());
    return g ? { steps: g.steps.map((s) => ({ id: s.id, ticked: s.ticked, skipped: s.skipped, next: s.next })), ticked: g.ticked, total: g.total } : null;
  });
}
