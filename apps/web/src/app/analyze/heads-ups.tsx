// The Heads-ups list on the Analyze page (GLOSSARY: Heads-up, Takeaway; spec 0041, ticket 14): what Ziffr noticed in Metrics the
// person may see, in the Takeaway's own words, strongest first, with Not useful and Mute. Quiet is a result: an empty list says so.
// Security: everything here comes from the core's `myHeadsUps` for the signed-in person, so only Heads-ups about Metrics they may
// see (both of a pair) reach the page; a failure says nothing about why.
import Link from "next/link";
import type { Actor } from "@ziffr/core/actor";
import { myHeadsUps, type MyHeadsUps } from "@ziffr/core/heads-up-state";
import { TakeawayView } from "@/components/takeaway-view";
import { HeadsUpButtons } from "./heads-up-buttons";

/** The Heads-ups of the person, or null when they could not be read just now. */
async function read(actor: Actor): Promise<MyHeadsUps | null> {
  try {
    return await myHeadsUps(actor);
  } catch {
    // Not the words of the error: nothing is told, and nothing says why.
    return null;
  }
}

/** The list called Heads-ups: `demo` is read-only (no Not useful, no Mute). */
export async function HeadsUpsSection({ actor, demo }: { actor: Actor; demo: boolean }) {
  const heads = await read(actor);
  return (
    <section id="heads-ups" aria-labelledby="heads-ups-heading" className="mb-6 space-y-2">
      <h2 id="heads-ups-heading" className="text-sm font-semibold">Heads-ups</h2>
      {heads === null ? (
        <p className="text-sm text-muted-foreground">Heads-ups could not be read just now. Try again in a moment.</p>
      ) : !heads.on ? (
        <p className="text-sm text-muted-foreground">You turned Heads-ups off for yourself. You can turn them on under <Link href="/settings/deliveries" className="underline">Your Deliveries</Link>.</p>
      ) : heads.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing stands out right now. Ziffr looks again every few hours and says nothing when there is nothing to say.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-rule-2)] rounded-[var(--radius-card)] border border-[var(--color-rule-2)]">
          {heads.items.map((h) => (
            <li key={h.key} className="p-3 text-sm">
              <TakeawayView takeaway={h.takeaway} />
              <HeadsUpButtons headsUpKey={h.key} named={h.named.map((m) => ({ id: m.id, name: m.name }))} readOnly={demo} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
