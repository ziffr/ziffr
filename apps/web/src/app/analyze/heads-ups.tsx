// The Heads-ups of the person, for their block on the Analyze page (GLOSSARY: Heads-up, Takeaway; spec 0041, ticket 14): what Ziffr noticed in
// Metrics the person may see, in the Takeaway's own words, strongest first, with Not useful and Mute. The list is not drawn on the page:
// it goes to the side panel behind the block, which says how many there are. With none there is no block.
// Security: everything here comes from the core's `myHeadsUps` for the signed-in person, so only Heads-ups about Metrics they may
// see (both of a pair) reach the page; a failure says nothing about why.
import type { Actor } from "@ziffr/core/actor";
import { myHeadsUps, type MyHeadsUps } from "@ziffr/core/heads-up-state";
import { TakeawayView } from "@/components/takeaway-view";
import { HeadsUpItem } from "./heads-up-buttons";
import { HeadsUpsHint, type HintState } from "./heads-up-hint";

/** The Heads-ups of the person, or null when they could not be read just now. */
async function read(actor: Actor): Promise<MyHeadsUps | null> {
  try {
    return await myHeadsUps(actor);
  } catch {
    // Not the words of the error: nothing is told, and nothing says why.
    return null;
  }
}

/** The block shows a state, never the words of an error. */
function stateOf(heads: MyHeadsUps | null): HintState {
  if (heads === null) return { kind: "unread" };
  if (!heads.on) return { kind: "off" };
  return { kind: "count", count: heads.items.length };
}

/** The block under the title, with the list of Heads-ups for its side panel: `demo` is read-only (no Not useful, no Mute). */
export async function HeadsUpsSection({ actor, demo }: { actor: Actor; demo: boolean }) {
  const heads = await read(actor);
  const items = heads?.on ? heads.items : [];
  return (
    <HeadsUpsHint state={stateOf(heads)}>
      <ul aria-label="Heads-ups" className="divide-y divide-[var(--color-rule-2)] rounded-[var(--radius-card)] border border-[var(--color-rule-2)]">
        {items.map((h) => (
          <HeadsUpItem key={h.key} headsUpKey={h.key} named={h.named.map((m) => ({ id: m.id, name: m.name }))} readOnly={demo}>
            <TakeawayView takeaway={h.takeaway} />
          </HeadsUpItem>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Ziffr looks again every few hours and says nothing when there is nothing to say.</p>
    </HeadsUpsHint>
  );
}
