"use server";
// The server actions of First Steps' last three screens (spec 0067; GLOSSARY: First Steps, Value, Submitter). Each hands
// what the browser sent to the core unread: it checks that the person is the Owner of a Workspace First Steps made, reads
// every input, and keeps the limits on asking and inviting. None redraws the page: a finished First Steps would then
// lead Home before the person has read that their number arrived.
import { chooseProviders, firstStepsDone, firstStepsSender } from "@ziffr/core/first-steps-providers";
import { allowFirstStepsEmail, askFirstStepsByEmail, firstStepsProgress, firstStepsValue, pickFirstStepsMetric, sendFirstStepsValue } from "@ziffr/core/first-steps-value";
import { inWorkspace } from "./in-workspace";

/** What the first value screen shows. */
export async function readFirstValue(workspaceId: string) {
  return inWorkspace(workspaceId, async (actor) => ({ view: await firstStepsValue(actor) }));
}

/** Looks whether the value has come in, and what became of a reply. */
export async function lookForValue(workspaceId: string) {
  return inWorkspace(workspaceId, firstStepsProgress);
}

/** "Ask me by email": one request, to the person themself. */
export async function askByEmail(workspaceId: string) {
  return inWorkspace(workspaceId, async (actor) => { await askFirstStepsByEmail(actor); return { asked: true as const }; });
}

/** Switches the person's own request emails on again. */
export async function emailAgain(workspaceId: string) {
  return inWorkspace(workspaceId, async (actor) => { await allowFirstStepsEmail(actor); return { on: true as const }; });
}

/** Chooses another of the made Metrics. */
export async function pickValueMetric(workspaceId: string, metricId: number) {
  return inWorkspace(workspaceId, async (actor) => { await pickFirstStepsMetric(actor, metricId); return { picked: true as const }; });
}

/** Records a value typed on the screen. */
export async function typeValue(workspaceId: string, text: string) {
  return inWorkspace(workspaceId, (actor) => sendFirstStepsValue(actor, text));
}

/** What the "who provides" screen shows. */
export async function readSender(workspaceId: string) {
  return inWorkspace(workspaceId, firstStepsSender);
}

/** Saves who provides the values from now on. */
export async function chooseProvider(workspaceId: string, input: unknown) {
  return inWorkspace(workspaceId, (actor) => chooseProviders(actor, input));
}

/** What the closing screen shows. */
export async function readDone(workspaceId: string) {
  return inWorkspace(workspaceId, firstStepsDone);
}
