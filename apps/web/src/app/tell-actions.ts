"use server";
// Tell steps (GLOSSARY: Tell; spec 0032, ticket #377): "stop telling me", a thin call into the core (@ziffr/core/tell).
// The switch is the acting person's own, for one Workflow that tells them; the core refuses the demo.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as tell from "@ziffr/core/tell";

/** The person stops (or lets again) a Workflow's Tell steps telling them. */
export async function setTellStopped(workflowId: number, stopped: boolean) {
  return attempt(async () => {
    await tell.setTellStopped(await currentActor(), Number(workflowId), stopped === true);
    revalidatePath("/settings/alerts");
  });
}
