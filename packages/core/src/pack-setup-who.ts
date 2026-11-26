// Who may fill a Position at Set up (spec 0058; GLOSSARY: Position, Submitter, Stand-in, Approver, Share, Contact,
// Guest). Pure: the same rules the places have today, said in words for the form.
// Security: filling a Position changes no Workspace Role; a person who may not have one of its places is refused for all.

/** A place a Position takes among what is being set up. */
export type Place = "submit" | "standIn" | "share" | "approve" | "told" | "tick" | "tickStandIn" | "snapshot";

/** What a person is in the Workspace, as far as places care. */
export type PersonKind = "member" | "guest" | "contact";

/** What a place needs a Workspace Role for, in the words of a refusal. A Contact has none. */
const NEEDS_ROLE: [Place, string][] = [["share", "be shared with"], ["approve", "approve"], ["told", "be told"], ["tick", "tick off a Task"], ["tickStandIn", "stand in for a Task"], ["snapshot", "get a Snapshot"]];

/** What each place is, as the form lists a Position's places. */
export const PLACE_WORDS: Record<Place, string> = {
  submit: "submits values", standIn: "stands in for Submitters", share: "is shared with", approve: "approves",
  told: "is told", tick: "ticks off Tasks", tickStandIn: "stands in for a Task", snapshot: "gets Snapshots",
};

/** Why a person of this kind may not fill a Position with these places, or null. */
export function whyNot(kind: PersonKind, places: ReadonlySet<Place>): string | null {
  if (kind === "contact") {
    const needs = NEEDS_ROLE.filter(([p]) => places.has(p)).map(([, words]) => words);
    if (needs.length) return `A Contact cannot ${needs.join(" or ")}: invite them on the Members page first.`;
  }
  if (kind === "guest" && (places.has("standIn") || places.has("tickStandIn"))) return "A Guest cannot stand in for someone.";
  return null;
}
