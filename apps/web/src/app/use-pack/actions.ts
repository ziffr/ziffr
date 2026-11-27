"use server";
// The guided Pack set-up's server actions (spec 0068; GLOSSARY: Pack). They hand what the browser sent to the core
// unread: it checks that the person is an Owner or Admin of this Workspace and never in the demo, every id, key, name,
// address and number, and every limit, before anything is written. While the flow is switched off they answer "not
// found": an action can be posted to any address.
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { checkStart, startPackStep, type PackStartRef } from "@ziffr/core/pack-start";
import type { SetupRun } from "@ziffr/core/pack-setup";
import type { StartChoices } from "@ziffr/core/pack-start-steps";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";
import { PACK_SET_UP_ON } from "./switch";

/** What the answers would make; nothing is written. */
export async function checkPackStart(ref: PackStartRef, choices: StartChoices) {
  if (!PACK_SET_UP_ON) notFound();
  return attempt(async () => checkStart(await currentActor(), ref, choices));
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
