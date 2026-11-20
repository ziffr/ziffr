"use server";
// Packs (spec 0030, GLOSSARY: Pack): thin calls into the core, which checks the file again on the server, and who may
// install, update or uninstall (Owners and Admins; Owners for a Pack with Themes; never in the demo).
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { installPackFile, readPackFile } from "@ziffr/core/packs";
import { exportPack, type ExportChoice, type ExportManifest } from "@ziffr/core/pack-export";
import { readPackUpdate, readUninstall, takeNewVersion, uninstallPack, updatePackFile } from "@ziffr/core/pack-updates";

/** Reads an uploaded Pack file for its Preview; nothing is written. The problems come back with their lines. */
export async function readPack(text: string) {
  return attempt(async () => readPackFile(await currentActor(), String(text ?? "")));
}

/** Installs an uploaded Pack file after its warnings were confirmed; returns the install's id. */
export async function installPack(text: string, confirmed: { unsigned: boolean; assistantTexts: boolean }) {
  return attempt(async () => {
    const id = await installPackFile(await currentActor(), String(text ?? ""), { unsigned: confirmed?.unsigned === true, assistantTexts: confirmed?.assistantTexts === true });
    revalidatePath("/", "layout");
    return id;
  });
}

/** A Pack of what the viewer picked in their Workspace, as its file's text, and what had to stay out. */
export async function exportAsPack(manifest: ExportManifest, choice: ExportChoice) {
  return attempt(async () => exportPack(await currentActor(), manifest, choice));
}

/** What updating an installed Pack from a newer file would do; nothing is written. */
export async function readUpdate(installId: number, text: string) {
  return attempt(async () => readPackUpdate(await currentActor(), Number(installId), String(text ?? "")));
}

/** Updates an installed Pack from a newer file after its warnings were confirmed. */
export async function updatePack(installId: number, text: string, confirmed: { unsigned: boolean; assistantTexts: boolean }) {
  return attempt(async () => {
    const plan = await updatePackFile(await currentActor(), Number(installId), String(text ?? ""), { unsigned: confirmed?.unsigned === true, assistantTexts: confirmed?.assistantTexts === true });
    revalidatePath("/", "layout");
    return plan;
  });
}

/** What uninstalling a Pack would remove and keep; nothing is written. */
export async function readUninstallPlan(installId: number) {
  return attempt(async () => readUninstall(await currentActor(), Number(installId)));
}

/** Uninstalls a Pack: removes what nobody changed and nothing uses, keeps the rest. */
export async function uninstall(installId: number) {
  return attempt(async () => {
    const plan = await uninstallPack(await currentActor(), Number(installId));
    revalidatePath("/", "layout");
    return plan;
  });
}

/** Takes the newer version waiting beside a changed template or Theme. */
export async function takeOffer(table: "templates" | "themes", id: number) {
  return attempt(async () => {
    await takeNewVersion(await currentActor(), table === "themes" ? "themes" : "templates", Number(id));
    revalidatePath("/", "layout");
  });
}
