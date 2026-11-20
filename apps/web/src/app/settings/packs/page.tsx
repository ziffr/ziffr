// The Packs page (spec 0030, GLOSSARY: Pack): the Packs installed in the Workspace and what each added, for everyone in
// it but Guests; Owners and Admins install one from a file, after seeing every item drawn with Sample Data.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { listInstalledPacks } from "@ziffr/core/packs";
import { numberStyleOf } from "@ziffr/core/workspace-settings";
import { getProfileMap } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { PacksScreen } from "./screen";

export default async function PacksPage() {
  const actor = await currentActor();
  const [installed, demo, numberStyle, people] = await Promise.all([listInstalledPacks(actor), isDemo(), numberStyleOf(actor.workspaceId), getProfileMap()]);
  const manages = !demo && (actor.role === "owner" || actor.role === "admin");
  return (
    <>
      <PageHeader title="Packs" sub="Ready-made Metric Catalog entries, templates, View Designs and Themes, each a file with no code. Installing one adds them to the Workspace; it makes no Metric until you use them." />
      <PacksScreen
        // Only the installer's name goes to the browser, never the rest of a profile.
        installed={installed.map((p) => ({ ...p, installedBy: p.installedBy ? people[p.installedBy]?.name ?? null : null }))}
        manages={manages}
        demo={demo}
        guest={actor.role === "guest"}
        viewer={actor.personId}
        numberStyle={numberStyle}
      />
    </>
  );
}
