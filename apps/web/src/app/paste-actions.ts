"use server";
// Paste values (spec 0026; GLOSSARY: Observation, Import): the preview and the recording of a paste from a
// spreadsheet, as thin calls into the core, which reads the text again and checks every value for the signed-in
// person. The browser sends only the text and the person's choices, never values it read itself.
import { revalidatePath } from "next/cache";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";
import { previewValues as corePreviewValues, recordPastedValues as coreRecordPastedValues, type PasteInput } from "@ziffr/core/paste-values";
import { pasteTemplate, type PasteTemplateInput } from "@ziffr/core/paste-template";

/** What each value of a paste would do, without recording anything. */
export async function previewPaste(input: PasteInput) {
  return attempt(async () => corePreviewValues(await currentActor(), input));
}

/** Records the paste's values that were not left out, each with the outcome it gets now. */
export async function recordPaste(input: PasteInput) {
  return attempt(async () => {
    const r = await coreRecordPastedValues(await currentActor(), input);
    revalidatePath("/", "layout");
    return r;
  });
}

/** A template file to fill in and paste back: the person's own Metrics by slug and the periods they wait for. Records nothing. */
export async function pasteTemplateFile(input: PasteTemplateInput) {
  return attempt(async () => pasteTemplate(await currentActor(), { kind: input?.kind, metricId: input?.metricId ?? null, period: input?.period ?? null, periods: input?.periods ?? null }));
}
