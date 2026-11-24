"use server";
// Team Widget Templates and slide layouts (GLOSSARY: Widget Template): thin calls into the core
// (@ziffr/core/templates). Everyone uses them, only the creator changes them.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attemptAsVisitor } from "@/lib/demo-write";
import * as templates from "@ziffr/core/templates";
import type { Choices } from "@ziffr/core/team-templates";
import type { SlideShape } from "@ziffr/core/types";

const done = () => revalidatePath("/", "layout");

/** Saves a slide of the viewer's own deck as a team slide layout. */
export async function saveSlideLayout(input: { deckId: number; shapes: SlideShape[]; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }) {
  return attemptAsVisitor("template-actions:saveSlideLayout", async () => {
    const id = await templates.saveSlideLayout(await currentActor(), input);
    done();
    return id;
  });
}

/** Saves a widget as a team template, new or replacing one of the viewer's own. */
export async function saveTemplate(input: { widgetId: number; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }) {
  return attemptAsVisitor("template-actions:saveTemplate", async () => {
    const id = await templates.saveTemplate(await currentActor(), input);
    done();
    return id;
  });
}

/** Renames a template the viewer created. */
export async function renameTemplate(id: number, name: string, description: string) {
  return attemptAsVisitor("template-actions:renameTemplate", async () => {
    await templates.renameTemplate(await currentActor(), Number(id), String(name ?? ""), String(description ?? ""));
    done();
  });
}

/** Deletes a template the viewer created. */
export async function deleteTemplate(id: number) {
  return attemptAsVisitor("template-actions:deleteTemplate", async () => {
    await templates.deleteTemplate(await currentActor(), Number(id));
    done();
  });
}
