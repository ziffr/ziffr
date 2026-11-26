"use server";
// Pack Guides in Help and in Export as Pack (spec 0058, GLOSSARY: Pack Guide): thin calls into the core, which decides
// who sees an installed Pack's guide (everyone in the Workspace but Guests) and who may export, and checks the stored
// guide and the texts from the browser again. They only read.
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { listInstalledGuides, readInstalledGuide } from "@ziffr/core/installed-pack-guides";
import { draftPackGuide } from "@ziffr/core/pack-export-guide";
import { guideFromText, type PackGuideText } from "@ziffr/core/pack-guide-text";
import type { ExportChoice } from "@ziffr/core/pack-export";

/** The viewer's Workspace's installed Packs that have a guide: ids, names and versions only. */
export async function readPackGuides() {
  return attempt(async () => listInstalledGuides(await currentActor()));
}

/** One installed Pack's guide, or null when the viewer may not see it or there is none. */
export async function readPackGuide(installId: number) {
  return attempt(async () => readInstalledGuide(await currentActor(), Number(installId)));
}

/** What "Describe your Pack" starts with: the names of what goes into the file, and guides of installed Packs to take over. */
export async function describePack(packId: string, choice: ExportChoice) {
  return attempt(async () => draftPackGuide(await currentActor(), String(packId ?? ""), choice));
}

/** What the guide's fields hold that a Pack may not, each at its section and line; nothing is read or written. */
export async function checkPackGuide(text: PackGuideText) {
  return attempt(async () => { await currentActor(); return guideFromText(text).problems; });
}
