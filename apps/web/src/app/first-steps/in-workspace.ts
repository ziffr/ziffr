// The frame of a First Steps server action about the Workspace on screen (spec 0067; GLOSSARY: First Steps, Workspace):
// switched off with First Steps, answered in the words of a refusal, and only for the Workspace the screen was drawn for,
// so that a tab left open while another switched Workspaces neither reads nor writes the other one. Used by server
// actions only; it is none itself.
import { notFound } from "next/navigation";
import type { Actor } from "@ziffr/core/actor";
import { FIRST_STEPS_ON } from "@ziffr/core/first-steps-screens";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";

/** Runs `work` as the signed-in person, in `workspaceId` or not at all. */
export async function inWorkspace<T>(workspaceId: string, work: (actor: Actor) => Promise<T>) {
  if (!FIRST_STEPS_ON) notFound();
  return attempt(async () => {
    const actor = await currentActor();
    if (actor.workspaceId !== workspaceId) throw new Error("You switched Workspaces in another tab. Reload this page.");
    return work(actor);
  });
}
