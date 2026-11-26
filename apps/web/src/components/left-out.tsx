"use client";
// What a deck's owner is told before sharing it (spec 0061; GLOSSARY: Share, Snapshot Part, Deck): who will not see
// which of the numbers its slides keep from Snapshots. The core counts it, and only of what the owner may see.
import { useEffect, useState } from "react";
import { deckShareLeftOut } from "@/app/deck-actions";
import { isActionError } from "@/lib/action-error";
import { leftOutWords } from "@/decks/kept/kept-drawing";
import type { DeckShareGaps, ShareGap } from "@ziffr/core/deck-snapshots";

/** The gaps of a deck, asked when its share panel opens; null for anything else, and until they arrive. */
export function useDeckGaps(deckId: number | null): DeckShareGaps | null {
  const [gaps, setGaps] = useState<DeckShareGaps | null>(null);
  useEffect(() => {
    if (deckId === null) return;
    deckShareLeftOut(deckId).then((r) => { if (!isActionError(r)) setGaps(r); }).catch(() => {});
  }, [deckId]);
  return gaps;
}

/** The line under a person or Group in the share panel. */
export function LeftOut({ gaps }: { gaps?: ShareGap[] }) {
  if (!gaps?.length) return null;
  return <span className="block text-xs font-medium">{leftOutWords(gaps)}</span>;
}

/** The note above the list of a deck whose numbers not everyone gets. */
export function LeftOutNote({ gaps }: { gaps: DeckShareGaps | null }) {
  if (!gaps || (!gaps.unnamed && !Object.keys(gaps.who).length)) return null;
  return (
    <div role="status" className="space-y-1 rounded-[var(--radius-input)] border border-input bg-muted/40 p-2.5 text-xs">
      <p>Sharing this deck does not show anyone the numbers its slides keep from a Snapshot: each person needs the dashboard they came from. The lines below say who will not see them.</p>
      {gaps.unnamed > 0 && <p>{gaps.unnamed === 1 ? "One part shows" : `${gaps.unnamed} parts show`} nothing to you, so Ziffr cannot say who sees {gaps.unnamed === 1 ? "it" : "them"}.</p>}
    </div>
  );
}
