"use server";
// The Setup Guide's actions (spec 0052; GLOSSARY: Setup Guide, Business Function): each calls the
// core with the current person, which checks the role and every value against its list. Nothing here decides who may do
// what.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as businessFunction from "@ziffr/core/business-function";
import * as guide from "@ziffr/core/setup-guide";
import { refuseInDemo } from "@ziffr/core/demo";

/** What About you sends: the person's own function, when they answered. */
export type AboutYouInput = { businessFunction?: string | null };

/** Saves the answer of About you: the person's own Business Function. Untrusted input: only that part is taken, and the
 * core checks the value against its list. */
export async function saveAboutYou(input: AboutYouInput) {
  return attempt(async () => {
    const actor = await currentActor();
    // The demo never has a guide: say its one sentence before anything is tried.
    refuseInDemo(actor);
    const i = (input && typeof input === "object" ? input : {}) as Partial<AboutYouInput>;
    if (i.businessFunction !== undefined) await businessFunction.setMyBusinessFunction(actor, i.businessFunction);
    revalidatePath("/setup");
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

/** Hides the Setup line for this person in this Workspace until they reopen it (spec 0052; nothing brings it back on its own). */
export async function hideSetup() {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    await guide.hideSetupGuide(actor);
    revalidatePath("/", "layout");
  });
}

/** Reopens the guide for this person: the Setup line is shown again. */
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
