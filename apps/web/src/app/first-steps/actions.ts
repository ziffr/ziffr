"use server";
// First Steps' server actions (spec 0067; GLOSSARY: First Steps, Workspace). They hand what the browser sent to the core
// unread: it checks every answer, who may give it, and whether another Workspace may be made.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createFirstStepsWorkspace, hideFirstStepsLine, noteFirstStepsLeft, saveFirstStepsAnswers } from "@ziffr/core/first-steps";
import { makeFirstMetric } from "@ziffr/core/first-steps-metric";
import { firstStepsSet, firstStepsSets } from "@ziffr/core/first-steps-sets";
import { numberStyleOf } from "@ziffr/core/workspace-settings";
import type { ActionError } from "@/lib/action-error";
import { attempt } from "@/lib/action-result";
import { DEMO_COOKIE, personFor, sessionUser } from "@/lib/auth";
import { currentActor, WORKSPACE_COOKIE } from "@/lib/viewer";

/** Makes the Workspace from the answers, for whoever is signed in, and makes it the one they look at. `saved` is false
 * when the Workspace stands but not every answer was kept. */
export async function makeWorkspace(input: unknown): Promise<{ saved: boolean } | ActionError> {
  const user = await sessionUser();
  if (!user) redirect("/login");
  return attempt(async () => {
    const { workspaceId, saved } = await createFirstStepsWorkspace(await personFor(user), input);
    const jar = await cookies();
    jar.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/" });
    jar.delete(DEMO_COOKIE);
    return { saved };
  });
}

// The actor, only while they still look at the Workspace the screen was drawn for: a tab left open while another
// switched Workspaces must not write into the other one.
async function drawnFor(workspaceId: string) {
  const actor = await currentActor();
  if (actor.workspaceId !== workspaceId) throw new Error("You switched Workspaces in another tab. Reload this page.");
  return actor;
}

/** Saves the answers again, after Start over, in the Workspace the screen was drawn for. */
export async function saveAnswers(workspaceId: string, input: unknown): Promise<{ saved: true } | ActionError> {
  return attempt(async () => {
    await saveFirstStepsAnswers(await drawnFor(workspaceId), input);
    return { saved: true as const };
  });
}

/** Notes that the Owner left First Steps on purpose, so that Home does not lead them back to it. */
export async function leaveFirstSteps(workspaceId: string) {
  return attempt(async () => {
    await noteFirstStepsLeft(await drawnFor(workspaceId));
    return { noted: true as const };
  });
}

/** Hides the line about the next open step, for the Owner who pressed Hide. */
export async function hideNextStepLine() {
  return attempt(async () => {
    await hideFirstStepsLine(await currentActor());
    revalidatePath("/", "layout");
  });
}

/** Adds the first Metric, from a suggestion or from a name, a unit and how often, in the Workspace the screen was drawn
 * for; a pick of null goes on with the one there is. The core checks the pick and who makes it; the browser is told no
 * more than that it is there. */
export async function addFirstMetric(workspaceId: string, pick: unknown): Promise<{ added: true } | ActionError> {
  return attempt(async () => {
    await makeFirstMetric(await drawnFor(workspaceId), pick);
    return { added: true as const };
  });
}

/** The ready-made sets offered, best fit first; the topic is the browser's, checked by the core. It only reads. */
export async function readSets(workspaceId: string, topic: string | null) {
  return attempt(async () => firstStepsSets(await drawnFor(workspaceId), topic));
}

/** One set's Preview and how the Workspace writes numbers; the browser names the set by its Pack id alone. It only reads. */
export async function readSet(workspaceId: string, packId: string, topic: string | null) {
  return attempt(async () => {
    const actor = await drawnFor(workspaceId);
    return { preview: await firstStepsSet(actor, packId, topic), numberStyle: await numberStyleOf(actor.workspaceId) };
  });
}
