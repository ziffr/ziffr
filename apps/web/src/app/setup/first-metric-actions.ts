"use server";
// The First Metric step's actions (spec 0052, ticket 9; GLOSSARY: Setup Guide, Prompt, Submitter, Source): each calls the
// core with the current person, which checks the role, that the Metric is theirs to ask for and the ten minutes between
// asks. Words for the person come back as values (the house pattern, `attempt`), since production builds hide a thrown
// message. The polling action returns only the viewer's own state.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { refuseInDemo } from "@ziffr/core/demo";
import { askForFirstMetric, askMeForFirstMetric, pickFirstMetric, sendFirstMetricValue, setupFirstValue } from "@ziffr/core/setup-first-metric";

/** Ask me now for the guide's Metric by the person's chosen ways; the form link code comes back with the answer. */
export async function askFirstMetric() {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    const r = await askForFirstMetric(actor);
    revalidatePath("/setup");
    return r;
  });
}

/** Adds the person as a Submitter of the guide's Metric they own, so Ask me now can ask them for it. */
export async function askMeForIt() {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    await askMeForFirstMetric(actor);
    revalidatePath("/setup");
  });
}

/** Picks another of the person's own Metrics to try. Untrusted input: the core checks the id and that it is theirs. */
export async function pickMetric(metricId: number) {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    await pickFirstMetric(actor, metricId);
    revalidatePath("/setup");
  });
}

/** The polling read: whether the person was asked and whether their value came in. Only their own state. */
export async function checkFirstMetric() {
  return attempt(async () => {
    return setupFirstValue(await currentActor());
  });
}

/** Sends a value for the guide's Metric by typing it here: the web form's own intake, as their form link does. The core
 * takes the guide's Metric (never one named by the browser), reads the text and checks that the person submits it. */
export async function sendFirstValue(text: string) {
  return attempt(async () => {
    const actor = await currentActor();
    refuseInDemo(actor);
    const r = await sendFirstMetricValue(actor, String(text ?? ""));
    revalidatePath("/", "layout");
    return r;
  });
}
