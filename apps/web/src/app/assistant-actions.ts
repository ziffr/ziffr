"use server";
// Connected assistants (spec 0023, GLOSSARY: Access Key): thin calls into the core (@ziffr/core/assistant-connections).
import { revalidatePath } from "next/cache";
import { disconnectMine } from "@ziffr/core/assistant-connections";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";

/** Disconnects one of the person's own assistants, in whichever of their workspaces it is. */
export async function disconnectAssistant(id: number) {
  return attempt(async () => {
    await disconnectMine(await currentActor(), Number(id));
    revalidatePath("/settings/assistants");
    revalidatePath("/settings/keys");
  });
}
