// The Packs page (spec 0030, GLOSSARY: Pack): the Packs installed in the Workspace and what each added, for everyone in
// it but Guests; Owners and Admins install one from a file, after seeing every item drawn with Sample Data.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { listInstalledPacks } from "@ziffr/core/packs";
import { marketplaceOn, marketplaceUpdates } from "@ziffr/core/marketplace";
import { exportOptions } from "@ziffr/core/pack-export";
import { can } from "@ziffr/core/actor";
import { offeredItems } from "@ziffr/core/pack-updates";
import { numberStyleOf } from "@ziffr/core/workspace-settings";
import { getProfileMap } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { listIncludedPacks } from "@ziffr/core/included-packs";
import { PacksScreen } from "./screen";

export default async function PacksPage() {
  const actor = await currentActor();
  const [installed, demo, numberStyle, people, offers] = await Promise.all([listInstalledPacks(actor), isDemo(), numberStyleOf(actor.workspaceId), getProfileMap(), offeredItems(actor)]);
  const manages = !demo && (actor.role === "owner" || actor.role === "admin");
  // What this person may put into a Pack: names only, of what they see. Nothing for a Guest.
  const options = can(actor, "create") ? await exportOptions(actor) : null;
  // Ziffr's own Packs, with what each brings, for those who install; counts and names from the bundled files only.
  const included = manages ? await listIncludedPacks(actor) : [];
  // The Marketplace only for those who install, and only when the Installation turned the connection on.
  const market = manages && (await marketplaceOn());
  const updates = market ? await marketplaceUpdates(actor) : [];
  return (
    <>
      <PageHeader title="Packs" sub="Ready-made Metric Catalog entries, templates, View Designs and Themes, each a file with no code. Installing one adds them to the Workspace; it makes no Metric until you use them." />
      <PacksScreen
        // Only the installer's name goes to the browser, never the rest of a profile.
        installed={installed.map((p) => ({ ...p, installedBy: p.installedBy ? people[p.installedBy]?.name ?? null : null }))}
        manages={manages}
        exportable={options}
        // The exporter's own name, as the editable Author of the Pack they export.
        authorName={people[actor.personId]?.name ?? ""}
        offers={offers}
        included={included}
        marketplace={market}
        updates={updates}
        demo={demo}
        guest={actor.role === "guest"}
        viewer={actor.personId}
        numberStyle={numberStyle}
      />
    </>
  );
}
