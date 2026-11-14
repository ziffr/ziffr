import { currentActor } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { connectorsView } from "@ziffr/core/page-data";
import { emailOptedOut } from "@ziffr/core/email-opt-out";
import { inboundEnabled, mailEnabled } from "@ziffr/core/mail";
import { PageHeader } from "@/components/page-header";
import { isDemo } from "@/lib/auth";
import { ConnectorsScreen, type DeliveryRow, type PrefRow } from "./screen";

export default async function ConnectorsPage() {
  const actor = await currentActor();
  const viewer = actor.personId;
  // What the person may see is decided in the core: readable Deliveries, and only their own Token codes.
  const [people, view, optedOut, demo] = await Promise.all([getProfiles(), connectorsView(actor), emailOptedOut(actor), isDemo()]);
  return (
    <>
      <PageHeader title="Connectors" sub="How Ziffr reaches people where they already work, and how their answers come back. Values arrive the same way." />
      <ConnectorsScreen viewer={viewer} isOwner={view.isAdmin} people={people} prefs={view.prefs as PrefRow[]} deliveries={view.deliveries as unknown as DeliveryRow[]} tokens={view.tokens} optedOut={optedOut} demo={demo} email={mailEnabled() ? (inboundEnabled() ? "both" : "send") : "off"} />
    </>
  );
}
