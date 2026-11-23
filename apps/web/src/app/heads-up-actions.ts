"use server";
// Heads-ups (spec 0041, ticket 14; GLOSSARY: Heads-up): thin calls into the core. A Not useful, a mute and a setting are the acting
// person's own: the core takes the Actor and checks the key, the Metric and the person's sight of it.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as headsUps from "@ziffr/core/heads-up-state";

/** Marks a Heads-up Not useful for you: it is not shown or sent to you again. */
export async function markHeadsUpNotUseful(key: string) {
  return attempt(async () => {
    await headsUps.markNotUseful(await currentActor(), key);
    revalidatePath("/analyze");
  });
}

/** Mutes a Metric for you: no Heads-up about it is shown or sent to you. */
export async function muteHeadsUpMetric(metricId: number) {
  return attempt(async () => {
    await headsUps.muteMetric(await currentActor(), metricId);
    revalidatePath("/analyze");
    revalidatePath("/settings/deliveries");
  });
}

/** Lets you hear about a Metric again. */
export async function unmuteHeadsUpMetric(metricId: number) {
  return attempt(async () => {
    await headsUps.unmuteMetric(await currentActor(), metricId);
    revalidatePath("/analyze");
    revalidatePath("/settings/deliveries");
  });
}

/** Sets whether Heads-ups are shown to you and whether you are also told by message. */
export async function setHeadsUpChoices(input: { show?: boolean; byMessage?: boolean }) {
  return attempt(async () => {
    await headsUps.setHeadsUpSettings(await currentActor(), { show: input?.show, byMessage: input?.byMessage });
    revalidatePath("/analyze");
    revalidatePath("/settings/deliveries");
  });
}
