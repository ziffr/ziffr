"use server";
// Pack Guides in Help (spec 0058, GLOSSARY: Pack Guide): thin calls into the core, which decides who sees an installed
// Pack's guide (everyone in the Workspace but Guests) and checks the stored guide again. They only read.
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { listInstalledGuides, readInstalledGuide } from "@ziffr/core/installed-pack-guides";

/** The viewer's Workspace's installed Packs that have a guide: ids, names and versions only. */
export async function readPackGuides() {
  return attempt(async () => listInstalledGuides(await currentActor()));
}

/** One installed Pack's guide, or null when the viewer may not see it or there is none. */
export async function readPackGuide(installId: number) {
  return attempt(async () => readInstalledGuide(await currentActor(), Number(installId)));
}
