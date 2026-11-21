// Connectors → Who gets what (GLOSSARY: Delivery Preference): the table of choices; the core decides whose rows are visible.
import { currentActor } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { connectorsView } from "@ziffr/core/page-data";
import { Preferences, type PrefRow } from "../preferences-view";

export default async function WhoGetsWhatPage() {
  const actor = await currentActor();
  const [people, view] = await Promise.all([getProfiles(), connectorsView(actor)]);
  // A Guest's page names only themselves and the people on the Deliveries shown to them, not the whole Workspace.
  const named = new Set([actor.personId, ...view.deliveries.flatMap((d) => [d.recipient_id, d.sender_id] as (string | null)[])]);
  const shownPeople = actor.role === "guest" ? people.filter((p) => named.has(p.id)) : people;
  return <Preferences viewer={actor.personId} isOwner={view.isAdmin} people={shownPeople} prefs={view.prefs as PrefRow[]} />;
}
