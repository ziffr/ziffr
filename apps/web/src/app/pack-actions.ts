"use server";
// Packs (spec 0030, GLOSSARY: Pack): thin calls into the core, which checks the file again on the server, and who may
// install, update or uninstall (Owners and Admins; Owners for a Pack with Themes; never in the demo).
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { installPackFile, readPackFile } from "@ziffr/core/packs";
import { installFromMarketplace, readMarketplacePack, readMarketplaceUpdate, searchMarketplace, updateFromMarketplace } from "@ziffr/core/marketplace";
import { exportPack, themeLogoForExport, type ExportChoice, type ExportManifest, type ExportOptionsChosen } from "@ziffr/core/pack-export";
import { tryExportedPack } from "@ziffr/core/pack-export-try";
import { PACK_SET_UP_ON } from "./use-pack/switch";
import { installIncludedPack, readIncludedPack, readIncludedUpdate, updateIncludedPack } from "@ziffr/core/included-packs";
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

type Described = Pick<ExportOptionsChosen, "guide" | "comesFrom" | "setUp">;
/** What the browser sent of "Describe your Pack"; the set-up questions only while the guided set-up is switched on. */
const chosen = (withTags: boolean, described: Described): ExportOptionsChosen => ({ tags: withTags !== false, guide: described?.guide, comesFrom: described?.comesFrom, setUp: PACK_SET_UP_ON ? described?.setUp : undefined });

/** A Pack of what the viewer picked in their Workspace, as its file's text, and what had to stay out. */
export async function exportAsPack(manifest: ExportManifest, choice: ExportChoice, withTags = true, described: Described = {}) {
  return attempt(async () => exportPack(await currentActor(), manifest, choice, chosen(withTags, described)));
}

/** What the guided set-up would read of that file, for "Try it"; nothing is written. */
export async function tryAsPack(manifest: ExportManifest, choice: ExportChoice, withTags = true, described: Described = {}) {
  if (!PACK_SET_UP_ON) notFound();
  return attempt(async () => tryExportedPack(await currentActor(), manifest, choice, chosen(withTags, described)));
}

/** The logo of one of the viewer's Themes, as the Export dialog previews it. */
export async function themeLogoPreview(themeId: number) {
  return attempt(async () => themeLogoForExport(await currentActor(), themeId));
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

/** Uninstalls a Pack: removes what nobody changed and nothing uses, keeps the rest; with `removeLogo`, the kept Themes lose the Pack's logo. */
export async function uninstall(installId: number, removeLogo?: boolean) {
  return attempt(async () => {
    const plan = await uninstallPack(await currentActor(), Number(installId), { removeLogo: removeLogo === true });
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

/** Free Packs on the Marketplace matching the search words; only the words are sent. */
export async function searchPacks(query: string) {
  return attempt(async () => searchMarketplace(await currentActor(), String(query ?? "")));
}

/** A Marketplace Pack's Preview, its signature checked; nothing is written. */
export async function readFromMarketplace(packId: string, version: string) {
  return attempt(async () => readMarketplacePack(await currentActor(), String(packId ?? ""), String(version ?? "")));
}

/** Installs a Pack from the Marketplace, its signature checked. */
export async function installFromTheMarketplace(packId: string, version: string, confirmed: { assistantTexts: boolean }) {
  return attempt(async () => {
    const id = await installFromMarketplace(await currentActor(), String(packId ?? ""), String(version ?? ""), { assistantTexts: confirmed?.assistantTexts === true });
    revalidatePath("/", "layout");
    return id;
  });
}

/** What updating an installed Pack to a Marketplace version would do; nothing is written. */
export async function readMarketplaceUpdatePlan(installId: number, version: string) {
  return attempt(async () => readMarketplaceUpdate(await currentActor(), Number(installId), String(version ?? "")));
}

/** Updates an installed Pack to a Marketplace version, its signature checked. */
export async function updateFromTheMarketplace(installId: number, version: string, confirmed: { assistantTexts: boolean }) {
  return attempt(async () => {
    const plan = await updateFromMarketplace(await currentActor(), Number(installId), String(version ?? ""), { assistantTexts: confirmed?.assistantTexts === true });
    revalidatePath("/", "layout");
    return plan;
  });
}

/** One of Ziffr's own Packs' Preview, named by its id (looked up in the list that comes with Ziffr); nothing is written. */
export async function readIncludedPackFile(packId: string) {
  return attempt(async () => readIncludedPack(await currentActor(), String(packId ?? "")));
}

/** Installs one of Ziffr's own Packs, named by its id, by a person's click. */
export async function installIncludedPackFile(packId: string, confirmed: { assistantTexts: boolean }) {
  return attempt(async () => {
    const id = await installIncludedPack(await currentActor(), String(packId ?? ""), { assistantTexts: confirmed?.assistantTexts === true });
    revalidatePath("/", "layout");
    return id;
  });
}

/** What updating an installed one of Ziffr's own Packs to the version that comes with this Ziffr would do; nothing is written. */
export async function readIncludedUpdatePlan(installId: number) {
  return attempt(async () => readIncludedUpdate(await currentActor(), Number(installId)));
}

/** Updates an installed one of Ziffr's own Packs to the version that comes with this Ziffr. */
export async function updateIncludedPackFile(installId: number, confirmed: { assistantTexts: boolean }) {
  return attempt(async () => {
    const plan = await updateIncludedPack(await currentActor(), Number(installId), { assistantTexts: confirmed?.assistantTexts === true });
    revalidatePath("/", "layout");
    return plan;
  });
}
