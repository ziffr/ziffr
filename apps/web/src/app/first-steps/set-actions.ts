"use server";
// The server actions of First Steps' two ready-made set screens (spec 0067; GLOSSARY: First Steps, Pack, Preview). They
// only read. The browser names a set by its Pack id alone; the core checks who asks and that the set is offered.
import { firstStepsSet, firstStepsSets } from "@ziffr/core/first-steps-sets";
import { numberStyleOf } from "@ziffr/core/workspace-settings";
import { inWorkspace } from "./in-workspace";

/** The ready-made sets offered, best fit first. */
export async function readSets(workspaceId: string) {
  return inWorkspace(workspaceId, firstStepsSets);
}

/** One set's Preview, and how this Workspace writes numbers. */
export async function readSet(workspaceId: string, packId: string) {
  return inWorkspace(workspaceId, async (actor) => ({ preview: await firstStepsSet(actor, packId), numberStyle: await numberStyleOf(actor.workspaceId) }));
}
