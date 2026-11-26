"use server";
// Setting up from a Pack (spec 0030, ticket 277; GLOSSARY: Pack): thin calls into the core, which checks who may
// (Owners and Admins), that the install is of this Workspace, and everything asked for before making anything.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { packSetupOptions, setUpStep, type PackSetupInput, type SetupRun } from "@ziffr/core/pack-setup";
import { planPackSetup } from "@ziffr/core/pack-setup-plan";

/** What setting up from an installed Pack offers. */
export async function packSetup(installId: number) {
  return attempt(async () => packSetupOptions(await currentActor(), Number(installId)));
}

/** What setting up what the person has picked so far would do; nothing is written. */
export async function planSetUp(installId: number, input: PackSetupInput) {
  return attempt(async () => planPackSetup(await currentActor(), Number(installId), input));
}

/** Takes one step of setting up what the person picked from an installed Pack: the first without `run`, each further
 * one with the `run` the last answered. Returns how far it is, or what was made. */
export async function setUpPack(installId: number, input: PackSetupInput, run: SetupRun | null = null) {
  return attempt(async () => {
    // A step that stops has made things too: the pages are read again either way.
    try { return await setUpStep(await currentActor(), Number(installId), input, run); } finally { revalidatePath("/", "layout"); }
  });
}
