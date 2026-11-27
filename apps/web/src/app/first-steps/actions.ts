"use server";
// First Steps' server actions (spec 0067; GLOSSARY: First Steps, Workspace). They hand what the browser sent to the core
// unread: it checks every answer, who may give it, and whether another Workspace may be made.
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createFirstStepsWorkspace, saveFirstStepsAnswers } from "@ziffr/core/first-steps";
import { makeFirstMetric } from "@ziffr/core/first-steps-metric";
import { FIRST_STEPS_ON } from "@ziffr/core/first-steps-screens";
import type { ActionError } from "@/lib/action-error";
import { attempt } from "@/lib/action-result";
import { DEMO_COOKIE, personFor, sessionUser } from "@/lib/auth";
import { currentActor, WORKSPACE_COOKIE } from "@/lib/viewer";

/** Makes the Workspace from the answers, for whoever is signed in, and makes it the one they look at. `saved` is false
 * when the Workspace stands but not every answer was kept. */
export async function makeWorkspace(input: unknown): Promise<{ saved: boolean } | ActionError> {
  if (!FIRST_STEPS_ON) notFound();
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
  if (!FIRST_STEPS_ON) notFound();
  return attempt(async () => {
    await saveFirstStepsAnswers(await drawnFor(workspaceId), input);
    return { saved: true as const };
  });
}

/** Adds the first Metric, from a suggestion or from a name, a unit and how often, in the Workspace the screen was drawn
 * for; a pick of null goes on with the one there is. The core checks the pick and who makes it; the browser is told no
 * more than that it is there. */
export async function addFirstMetric(workspaceId: string, pick: unknown): Promise<{ added: true } | ActionError> {
  if (!FIRST_STEPS_ON) notFound();
  return attempt(async () => {
    await makeFirstMetric(await drawnFor(workspaceId), pick);
    return { added: true as const };
  });
}
