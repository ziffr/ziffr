"use server";
// First Steps' server actions (spec 0067; GLOSSARY: First Steps, Workspace). They hand what the browser sent to the core
// unread: it checks every answer, who may give it, and whether another Workspace may be made.
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createFirstStepsWorkspace, saveFirstStepsAnswers } from "@ziffr/core/first-steps";
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

/** Saves the answers again, after Start over. `workspaceId` is the one the screen was drawn for: a tab left open while
 * another switched Workspaces must not write into the other one. */
export async function saveAnswers(workspaceId: string, input: unknown): Promise<{ saved: true } | ActionError> {
  if (!FIRST_STEPS_ON) notFound();
  return attempt(async () => {
    const actor = await currentActor();
    if (actor.workspaceId !== workspaceId) throw new Error("You switched Workspaces in another tab. Reload this page.");
    await saveFirstStepsAnswers(actor, input);
    return { saved: true as const };
  });
}
