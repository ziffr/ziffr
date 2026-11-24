"use server";
// "Who can see this" and asking for access (GLOSSARY: Share). Thin calls into the core (@ziffr/core/sharing), which
// checks who acts and in which Workspace.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { asVisitor } from "@/lib/demo-write";
import * as sharing from "@ziffr/core/sharing";
import type { ObjectType } from "@ziffr/core/access";

/** Who can see it and why; the owner also gets open requests. */
export async function whoCanSee(type: ObjectType, id: number) {
  return sharing.whoCanSee(await currentActor(), type, Number(id));
}

/** Asks the owner for access; the owner hears about it. */
export async function requestAccess(type: ObjectType, id: number) {
  return asVisitor("access-actions:requestAccess", async () => {
    const r = await sharing.requestAccess(await currentActor(), type, Number(id));
    revalidatePath("/", "layout");
    return r;
  });
}

/** The owner grants Viewer access, or declines; the requester is told either way. */
export async function decideAccess(requestId: number, grant: boolean) {
  await asVisitor("access-actions:decideAccess", async () => {
    await sharing.decideAccess(await currentActor(), Number(requestId), Boolean(grant));
    revalidatePath("/", "layout");
  });
}
