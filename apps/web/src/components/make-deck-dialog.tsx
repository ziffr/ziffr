"use client";
// "Make a deck" on a dashboard or a Snapshot (spec 0061; GLOSSARY: Deck, Snapshot, Snapshot Part): the person says
// which numbers the new deck shows, the live ones or a shown Snapshot's, which never change. From a dashboard the
// live ones come first; from a shown Snapshot, its own. The core decides what each choice may hold.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { makeDeck, makeDeckFromSnapshot } from "@/app/convert-actions";
import { SlideOverWindow } from "./slide-over-window";

/** Where the deck is made from: a dashboard with its shown Snapshots, or one Snapshot, which may still be a draft. */
export type DeckSource = { dashboardId: number } & ({ snapshots: { id: number; label: string }[] } | { snapshot: { id: number; label: string; shown: boolean } });

/** The window behind "Make a deck…", in the side panel while mounted. */
export function MakeDeckDialog({ source, onClose }: { source: DeckSource; onClose: () => void }) {
  return (
    <SlideOverWindow short title="Make a deck" description="Choose which numbers the new deck shows." onClose={onClose}>
      <MakeDeckForm source={source} onClose={onClose} />
    </SlideOverWindow>
  );
}

/** The form: the two kinds of numbers, and which Snapshot where there is more than one to pick. */
function MakeDeckForm({ source, onClose }: { source: DeckSource; onClose: () => void }) {
  const one = "snapshot" in source ? source.snapshot : null;
  const choices = "snapshots" in source ? source.snapshots : one!.shown ? [one!] : [];
  const [kept, setKept] = useState(Boolean(one?.shown));
  const [snapshot, setSnapshot] = useState(choices[0]?.id);
  const [pending, start] = useTransition();
  const none = one ? "Show this Snapshot to everyone with access to use its numbers." : "Take a Snapshot of the dashboard and show it to use its numbers.";
  const make = () => start(async () => {
    try {
      // On success the server opens the deck; only a refusal comes back.
      unwrap(await (kept && snapshot ? makeDeckFromSnapshot(snapshot) : makeDeck(source.dashboardId)));
    } catch (err) {
      if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
      toast.error("No deck made", { description: shown(err) });
    }
  });
  const choice = "flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] p-3 has-checked:border-[var(--color-ink)]";
  const radio = "mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]";
  const live = (
    <label className={choice}>
      <input type="radio" name="deck-numbers" checked={!kept} onChange={() => setKept(false)} className={radio} />
      <span>
        <span className="block font-medium">Live numbers</span>
        <span className="block text-xs text-muted-foreground">A slide for each widget on the dashboard as it is now. The numbers change as values are recorded or corrected, and you can change the widgets.</span>
      </span>
    </label>
  );
  const snapshotChoice = (
    <label className={choice}>
      <input type="radio" name="deck-numbers" checked={kept} disabled={!choices.length} onChange={() => setKept(true)} className={radio} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{one ? `The numbers of ${one.label}` : "A Snapshot's numbers"}</span>
        <span className="block text-xs text-muted-foreground">A slide for each part of the Snapshot. The numbers never change. Each person sees them only if they may open the Snapshot: sharing the deck does not show them.</span>
        {!choices.length && <span className="mt-1 block text-xs font-medium">{none}</span>}
        {!one && choices.length > 0 && (
          <select aria-label="Which Snapshot" value={snapshot} onChange={(e) => { setSnapshot(Number(e.target.value)); setKept(true); }} className="mt-2 h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm">
            {choices.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </span>
    </label>
  );
  return (
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); make(); }}>
      <fieldset className="space-y-2">
        <legend className="sr-only">Numbers</legend>
        {/* The default stands first. */}
        {one?.shown ? <>{snapshotChoice}{live}</> : <>{live}{snapshotChoice}</>}
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending}>Make deck</Button>
      </div>
    </form>
  );
}
