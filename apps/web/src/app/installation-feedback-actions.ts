"use server";
// The feedback review queue (spec 0049, ticket #919; GLOSSARY: Feedback): thin calls into the core, which checks that
// this is the central version (ziffr.net) and that the person is an Installation Admin. Each answers an error text
// instead of throwing; the ids and words come from a browser and are checked again in the core.
import { revalidatePath } from "next/cache";
import { approveFeedback, rejectFeedback } from "@ziffr/core/feedback-review";
import { attempt } from "@/lib/action-result";
import { installationActor } from "@/lib/installation";

async function decide(work: (actor: NonNullable<Awaited<ReturnType<typeof installationActor>>>) => Promise<void>) {
  return attempt(async () => {
    const actor = await installationActor();
    if (!actor) return { error: "Sign in first." };
    await work(actor);
    revalidatePath("/installation/feedback");
    return { ok: true as const };
  });
}

/** Approves a waiting feedback so it is filed, optionally with the maintainer's edit of its words. */
export async function approveFeedbackAction(id: string, words?: string) {
  return decide((actor) => approveFeedback(actor, String(id ?? ""), words === undefined ? undefined : { words }));
}

/** Rejects a waiting feedback with the reason the person reads. */
export async function rejectFeedbackAction(id: string, reason: string) {
  return decide((actor) => rejectFeedback(actor, String(id ?? ""), reason));
}
