"use server";
// Version history (GLOSSARY: Version): thin calls into the core (@ziffr/core/version-history), which decides who may
// see and restore what.
import { isActionError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import * as history from "@ziffr/core/version-history";
import type { VersionType } from "@ziffr/core/versions";
import type { WorkflowConfig } from "@ziffr/core/types";

/** The versions of an object, newest first. */
export async function listVersions(type: VersionType, id: number) {
  return history.listVersions(await currentActor(), type, Number(id));
}

/** Names a version. */
export async function nameVersion(versionId: number, name: string) {
  await history.nameVersion(await currentActor(), Number(versionId), String(name ?? ""));
}

/** Restoring writes the old state back and records it as a new version: history only ever grows. */
export async function restoreVersion(versionId: number) {
  await history.restoreVersion(await currentActor(), Number(versionId), {
    // A Workflow is restored through the same save as editing it, so its checks apply (the core's saveWorkflow, as the restorer).
    restoreWorkflow: async (id, name, config) => {
      const { saveWorkflow } = await import("./workflow-actions");
      // A refusal comes back as words; the restore stops with them.
      const r = await saveWorkflow(id, name, config as WorkflowConfig);
      if (isActionError(r)) throw new Error(r.error);
    },
  });
  revalidatePath("/", "layout");
}

/** Names the current state, like a git tag. */
export async function saveNamedVersion(type: VersionType, id: number, name: string) {
  await history.saveNamedVersion(await currentActor(), type, Number(id), String(name ?? ""));
}
