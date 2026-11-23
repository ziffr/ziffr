"use client";
// "Add to deck…" from a widget's menu (ticket #1; GLOSSARY: Widget, Deck): pick a deck the person may change, or a
// new one, and a slide or a new slide; the deck opens with an independent copy of the widget there. The decks are
// asked for when the panel opens (spec 0050), so a dashboard full of widgets loads none of them.
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { addToDeck, deckChoices } from "@/app/convert-actions";
import type { DeckTarget } from "@ziffr/core/deck-additions";
import { SlideOverWindow } from "./slide-over-window";

const NEW = "new";
const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";

/** The window behind "Add to deck…" for one widget, in the side panel while `open`. */
export function AddToDeckDialog({ widgetId, open, onOpenChange }: { widgetId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!open) return null;
  return (
    <SlideOverWindow title="Add to deck" description="A copy of this widget goes on the slide you pick. The deck opens there; the widget here stays as it is." onClose={() => onOpenChange(false)}>
      <AddToDeckForm widgetId={widgetId} onClose={() => onOpenChange(false)} />
    </SlideOverWindow>
  );
}

function AddToDeckForm({ widgetId, onClose }: { widgetId: number; onClose: () => void }) {
  const [decks, setDecks] = useState<DeckTarget[] | null>(null);
  const [deck, setDeck] = useState<string>(NEW);
  const [slide, setSlide] = useState<string>(NEW);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (decks) return;
    start(async () => {
      try {
        const list = unwrap(await deckChoices());
        setDecks(list);
        if (list.length) setDeck(String(list[0].id));
      } catch (e) {
        toast.error("Your decks could not be listed", { description: shown(e) });
      }
    });
  }, [decks]);

  const chosen = decks?.find((d) => String(d.id) === deck) ?? null;
  const add = () => start(async () => {
    try {
      // On success the server opens the deck; only a refusal comes back.
      unwrap(await addToDeck(widgetId, chosen ? chosen.id : null, chosen && slide !== NEW ? slide : null));
    } catch (e) {
      toast.error("Not added", { description: shown(e) });
    }
  });

  return (
    <div className="space-y-3">
        {!decks ? <p className="text-sm text-muted-foreground">Listing your decks…</p> : (
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-xs font-medium">Deck</span>
              <select className={field} value={deck} onChange={(e) => { setDeck(e.target.value); setSlide(NEW); }} aria-label="Deck">
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                <option value={NEW}>New deck</option>
              </select>
            </label>
            {!decks.length && <p className="text-xs text-muted-foreground">You may change no deck yet: a new one is made, named after the widget.</p>}
            {chosen && (
              <label className="block space-y-1">
                <span className="text-xs font-medium">Slide</span>
                <select className={field} value={slide} onChange={(e) => setSlide(e.target.value)} aria-label="Slide">
                  <option value={NEW}>New slide at the end</option>
                  {chosen.slides.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!decks || pending} onClick={add}>Add to {chosen ? "deck" : "a new deck"}</Button>
        </div>
    </div>
  );
}
