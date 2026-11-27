"use server";
// The guided Pack set-up's server actions (spec 0068; GLOSSARY: Pack). They hand what the browser sent to the core
// unread: it checks that the person is an Owner or Admin of this Workspace and never in the demo, every id, key, name,
// address and number, and every limit, before anything is written. While the flow is switched off they answer "not
// found": an action can be posted to any address.
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import type { Actor } from "@ziffr/core/actor";
import { changePackHolder, packHolderPlan, type PackHolderPick } from "@ziffr/core/pack-after-holder";
import { confirmPackNumber, invitePackPeople, packInvite, sendFirstPackNumber } from "@ziffr/core/pack-after-invite";
import { setPackNumbers } from "@ziffr/core/pack-after-numbers";
import { setPackProviders } from "@ziffr/core/pack-after-providers";
import { checkStart, startPackStep, type PackStartRef } from "@ziffr/core/pack-start";
import type { SetupRun } from "@ziffr/core/pack-setup";
import type { StartChoices, StartPerson } from "@ziffr/core/pack-start-steps";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";
import { PACK_SET_UP_ON } from "./switch";

// A read after the set-up, and a change after it, whose pages are read again once it ends: one stopped half way has
// changed things too.
async function asked<T>(read: (actor: Actor) => Promise<T>) {
  if (!PACK_SET_UP_ON) notFound();
  return attempt(async () => read(await currentActor()));
}
async function changed<T>(work: (actor: Actor) => Promise<T>) {
  return asked(async (actor) => {
    try {
      return await work(actor);
    } finally {
      revalidatePath("/", "layout");
    }
  });
}

/** What the answers would make; nothing is written. */
export async function checkPackStart(ref: PackStartRef, choices: StartChoices) {
  return asked((actor) => checkStart(actor, ref, choices));
}

/** Takes one step of setting a Pack up: the first without `run`, each further one with the `run` the last answered, and
 * "Try again" without. */
export async function takePackStartStep(ref: PackStartRef, choices: StartChoices, run: SetupRun | null = null) {
  if (!PACK_SET_UP_ON) notFound();
  return attempt(async () => {
    let more = false;
    try {
      const step = await startPackStep(await currentActor(), ref, choices, run);
      more = !step.done;
      return step;
    } finally {
      // The pages are read again once it ends, done or stopped: a stop has made things too.
      if (!more) revalidatePath("/", "layout");
    }
  });
}

/** Where the invitations of a set-up stand, and the numbers an Owner may send first. */
export async function readPackInvite(installId: number) {
  return asked((actor) => packInvite(actor, installId));
}

/** Records the Owner's first number of a set-up, without any message. */
export async function sendPackNumber(installId: number, metricId: number, text: string, whose: string | null) {
  return changed((actor) => sendFirstPackNumber(actor, installId, metricId, text, whose));
}

/** Confirms the person's own check of a value of a set-up. */
export async function confirmPackCheck(installId: number, actionId: number) {
  return changed((actor) => confirmPackNumber(actor, installId, actionId));
}

/** Invites the ticked people of a set-up, one invitation each. */
export async function invitePeople(installId: number, personIds: string[]) {
  return changed((actor) => invitePackPeople(actor, installId, personIds));
}

/** Chooses who provides the numbers nobody provides. */
export async function choosePackProviders(installId: number, providers: StartPerson[]) {
  return changed((actor) => setPackProviders(actor, installId, providers));
}

/** Writes the asked numbers as the targets of a period. */
export async function savePackNumbers(installId: number, input: unknown) {
  return changed((actor) => setPackNumbers(actor, installId, input));
}

/** What putting a Member into a Position would change; nothing is written. */
export async function readHolderPlan(installId: number, pick: PackHolderPick) {
  return asked((actor) => packHolderPlan(actor, installId, pick));
}

/** Makes the change of who approves that was shown, with the Shares ticked. */
export async function changeHolder(installId: number, input: PackHolderPick & { shares: string[]; mark: string }) {
  return changed((actor) => changePackHolder(actor, installId, input));
}
