"use server";
// Setting up from a Pack (spec 0030, ticket 277; GLOSSARY: Pack): thin calls into the core, which checks who may
// (Owners and Admins), that the install is of this Workspace, and everything asked for before making anything.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { packSetupOptions, setUpFromPack, type PackSetupInput } from "@ziffr/core/pack-setup";
import { planPackSetup } from "@ziffr/core/pack-setup-plan";

/** What setting up from an installed Pack offers. */
export async function packSetup(installId: number) {
  return attempt(async () => packSetupOptions(await currentActor(), Number(installId)));
}

/** What setting up what the person has picked so far would do; nothing is written. */
export async function planSetUp(installId: number, input: PackSetupInput) {
  return attempt(async () => planPackSetup(await currentActor(), Number(installId), input));
}

/** Sets up what the person picked from an installed Pack; returns what was made. */
export async function setUpPack(installId: number, input: PackSetupInput) {
  return attempt(async () => {
    const made = await setUpFromPack(await currentActor(), Number(installId), input);
    revalidatePath("/", "layout");
    return made;
  });
}
