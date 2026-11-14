import { currentActor } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { connectorsView } from "@ziffr/core/page-data";
import { PageHeader } from "@/components/page-header";
import { ConnectorsScreen, type DeliveryRow, type PrefRow } from "./screen";

export default async function ConnectorsPage() {
  const actor = await currentActor();
  const viewer = actor.personId;
  // What the person may see is decided in the core: readable Deliveries, and only their own Token codes.
  const [people, view] = await Promise.all([getProfiles(), connectorsView(actor)]);
  return (
    <>
      <PageHeader title="Connectors" sub="How Ziffr reaches people where they already work, and how their answers come back. Values arrive the same way." />
      <ConnectorsScreen viewer={viewer} isOwner={view.isAdmin} people={people} prefs={view.prefs as PrefRow[]} deliveries={view.deliveries as DeliveryRow[]} tokens={view.tokens} />
    </>
  );
}
