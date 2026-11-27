"use server";
// Fill in for someone (GLOSSARY: Filled-in Value; spec 0046), as a thin call: the core decides who may, from facts it reads
// itself (the Metric's and the Workflow's owner, the Due Date, Away, the Lock, the Submission Rule), and refuses in words
// that say what to do instead. The browser sends only the Metric, the period, the person and the text typed.
import { revalidatePath } from "next/cache";
import { attempt } from "@/lib/action-result";
import { currentActor } from "@/lib/viewer";
import { inDemoVisit } from "@/lib/demo-visit-action";
import { demoTextForVisit } from "@ziffr/core/demo-text";
import { fillInValue } from "@ziffr/core/fill-in";

/** What the form shows after a try: whether it was recorded, the intake's own words, and `noteKept` when the note was
 * not saved. */
type FilledInAnswer = { ok: boolean; detail: string; noteKept?: boolean };

/** The signed-in Metric owner or Workflow owner enters a value for a Submitter of the Metric, marked as entered by them. */
export async function fillInForSubmitter(input: { metricId: number; period: string; for: string; value: string; breakdown?: string; note?: string }): Promise<FilledInAnswer | { error: string }> {
  // A visitor's texts (the value, the Breakdown's labels) go through the text rules first (spec 0051).
  return attempt(() => inDemoVisit("fill-in-actions:fillInForSubmitter", async (visiting) => {
    const r = await fillInValue(await currentActor(), {
      metricId: Number(input?.metricId), period: String(input?.period ?? ""), for: String(input?.for ?? ""),
      value: demoTextForVisit(visiting, String(input?.value ?? ""), "name"), breakdown: demoTextForVisit(visiting, String(input?.breakdown ?? ""), "message"),
      // The demo keeps no notes.
      note: !visiting && typeof input?.note === "string" ? input.note : undefined,
    });
    revalidatePath("/", "layout");
    return { ok: r.ok, detail: r.detail, ...(r.valueNote?.saved === false ? { noteKept: true } : {}) };
  }));
}
