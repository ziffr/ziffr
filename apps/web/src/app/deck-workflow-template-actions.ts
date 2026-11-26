"use server";
// Deck Templates and Workflow Templates (spec 0030, GLOSSARY: Deck Template, Workflow Template): thin calls into the
// core. Everyone who may create uses them; only a template's creator replaces it; the core checks every Metric and
// every person again.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { attemptAsVisitor } from "@/lib/demo-write";
import { saveDeckTemplate, saveWorkflowTemplate } from "@ziffr/core/templates";
import { createDeckFromTemplate as createDeck, writeFills } from "@ziffr/core/deck-templates";
import { createWorkflowFromTemplate as createWorkflow } from "@ziffr/core/workflow-templates";
import type { Choices } from "@ziffr/core/team-templates";

const done = () => revalidatePath("/", "layout");

/** Saves the viewer's own deck, as stored, as a team Deck Template; returns its id. */
export async function saveAsDeckTemplate(input: { deckId: number; name: string; description: string; labels: string[]; choices: Choices; keepTyped?: boolean; replaceId?: number | null }) {
  return attemptAsVisitor("deck-workflow-template-actions:saveAsDeckTemplate", async () => {
    const id = await saveDeckTemplate(await currentActor(), input);
    done();
    return id;
  });
}

/** Makes a deck of the viewer's from a Deck Template, its Slots filled; answers where it opens to lay out its slides. */
export async function createDeckFromTemplate(template: number, name: string, fills: number[][]) {
  return attemptAsVisitor("deck-workflow-template-actions:createDeckFromTemplate", async () => {
    const id = await createDeck(await currentActor(), { template: Number(template), name: String(name ?? ""), fills });
    done();
    return `/decks/${id}?template=${Number(template)}&fills=${encodeURIComponent(writeFills(fills))}`;
  });
}

/** Saves a Workflow as a team Workflow Template, without its people; returns its id. */
export async function saveAsWorkflowTemplate(input: { workflowId: number; name: string; description: string; replaceId?: number | null }) {
  return attempt(async () => {
    const id = await saveWorkflowTemplate(await currentActor(), input);
    done();
    return id;
  });
}

/** Makes a Workflow of the viewer's from a Workflow Template, with its Approvers picked; returns its id. */
export async function createWorkflowFromTemplate(template: number, name: string, approvers: string[]) {
  return attempt(async () => {
    const id = await createWorkflow(await currentActor(), { template: Number(template), name: String(name ?? ""), approvers });
    done();
    return id;
  });
}
