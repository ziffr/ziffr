"use server";
// Adding and removing a person under Who submits on a Metric's page (GLOSSARY: Submitter): thin calls into the core,
// which checks that the actor is the Metric's owner or its Editor and that the person belongs to the Workspace. Ids
// from the browser are never used in a filter as text. Feeds have their own actions (feed-actions.ts). Not in the demo.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { refuseInDemo } from "@ziffr/core/demo";
import { removeSubmitters } from "@ziffr/core/metrics";
import { addSubmitterWithAnswer } from "@ziffr/core/who-submits";

/** Makes a person a Submitter of a Metric, asking them for the current value only when `askNow` is true. Answers what
 * was sent to them, in words. */
export async function addSubmitter(metricId: number, personId: string, askNow: boolean) {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    const answer = await addSubmitterWithAnswer(actor, Number(metricId), String(personId ?? ""), askNow === true);
    revalidatePath("/metrics/[slug]", "page");
    return answer;
  });
}

/** Stops a person submitting to a Metric: their own form link for it stops, and their earlier values stay. */
export async function removeSubmitter(metricId: number, personId: string) {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    await removeSubmitters(actor, Number(metricId), [String(personId ?? "")]);
    revalidatePath("/metrics/[slug]", "page");
  });
}
