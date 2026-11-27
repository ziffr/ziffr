"use server";
// The Team step's own action (spec 0052, ticket 10; GLOSSARY: Setup Guide, Submitter): asking one person for a Metric.
// Inviting, links, Domain Joining and Groups are the Team page's own actions, used as they are. The core checks that the
// actor may change who submits to the Metric, that the person belongs to the Workspace, and sends the person their first
// request, which is why a press is a click and never done for the person.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { refuseInDemo } from "@ziffr/core/demo";
import { addSubmitterWithAnswer } from "@ziffr/core/who-submits";

/** Makes one person a Submitter of one Metric and asks them, once a day at most; answers what was sent, in words.
 * Untrusted input: both ids are checked by the core, never used in a filter as text. */
export async function askForMetric(metricId: number, personId: string) {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    const answer = await addSubmitterWithAnswer(actor, Number(metricId), String(personId ?? ""), true);
    revalidatePath("/setup");
    return answer;
  });
}
