// Connectors → Outbox (GLOSSARY: Delivery, Outbox): what Ziffr sent, as it looks on the other side. What a person may see
// is decided in the core: readable Deliveries, and only their own Token codes.
import { currentActor } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { connectorsView } from "@ziffr/core/page-data";
import { isDemo } from "@/lib/auth";
import { visitorsMayChangeDemo } from "@/lib/demo-visit-action";
import { Outbox, type DeliveryRow } from "../outbox-view";

export default async function OutboxPage() {
  const actor = await currentActor();
  const [people, view, demo, changes] = await Promise.all([getProfiles(), connectorsView(actor), isDemo(), visitorsMayChangeDemo()]);
  // A Guest's page names only themselves and the people on the Deliveries shown to them, not the whole Workspace.
  const named = new Set([actor.personId, ...view.deliveries.flatMap((d) => [d.recipient_id, d.sender_id] as (string | null)[])]);
  const shownPeople = actor.role === "guest" ? people.filter((p) => named.has(p.id)) : people;
  return <Outbox isOwner={view.isAdmin} people={shownPeople} deliveries={view.deliveries as unknown as DeliveryRow[]} tokens={view.tokens} demo={demo} changes={changes} />;
}
