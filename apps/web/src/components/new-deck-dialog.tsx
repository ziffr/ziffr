"use client";
// Starting a deck from a Deck Template (spec 0030, GLOSSARY: Deck Template, Slot): a name, a template and a Metric for
// each of its Slots, picked once however many slides show it. The core checks every Metric again; this only offers
// what the page sent.
import { fillsComplete } from "@ziffr/core/team-templates";
import type { DeckTemplateSummary } from "@ziffr/core/deck-templates";
import { createDeckFromTemplate } from "@/app/deck-workflow-template-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { shown, unwrap } from "@/lib/action-error";
import { cn } from "@/lib/utils";
import { LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SlotFills } from "./slot-fills";

/** A button that opens the dialog for a new deck from one of the team's Deck Templates. */
export function NewDeckFromTemplate({ templates, metrics, people }: { templates: DeckTemplateSummary[]; metrics: { id: number; name: string }[]; people: Record<string, { name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [fills, setFills] = useState<number[][]>([]);
  const t = templates.find((x) => x.id === picked) ?? null;
  const pick = (x: DeckTemplateSummary) => {
    setPicked(x.id);
    // Each Slot starts with the first Metric it was made with that this viewer sees, if any.
    setFills(x.slots.map((s) => (s.exampleIds ?? []).filter((m) => metrics.some((y) => y.id === m)).slice(0, s.multiple ? 50 : 1)));
  };
  const ready = !!t && fillsComplete(t.slots, fills);
  const make = () => start(async () => {
    try {
      const href = unwrap(await createDeckFromTemplate(t!.id, name, fills));
      setOpen(false);
      router.push(href);
    } catch (e) {
      toast.error("Not done", { description: shown(e) });
    }
  });
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}><LayoutTemplate aria-hidden /> From a Deck Template</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(48rem,calc(100vh-2rem))] flex-col sm:max-w-2xl">
          <DialogTitle className="flex items-center gap-2"><LayoutTemplate aria-hidden className="size-4" /> New deck from a Deck Template</DialogTitle>
          <DialogDescription>Pick a template, then a Metric for each of its places, once even when several slides show it. The deck is yours; the template stays as it is.</DialogDescription>
          <form className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-1" onSubmit={(e) => { e.preventDefault(); if (ready) make(); }}>
            <label className="block text-sm font-medium">Name<Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={t?.name ?? "Name of the new deck"} className="mt-1" /></label>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Template</legend>
              <ul className="grid gap-2 sm:grid-cols-2">
                {templates.map((x) => (
                  <li key={x.id}>
                    <label className={cn("flex h-full cursor-pointer items-start gap-2 rounded-[var(--radius-stock)] border p-2.5 text-sm hover:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring", picked === x.id ? "border-[var(--color-ink)] bg-muted" : "border-input")}>
                      <input type="radio" name="deck-template" checked={picked === x.id} onChange={() => pick(x)} className="mt-0.5 accent-[var(--color-ink)]" />
                      <span>
                        <span className="font-medium">{x.name}</span>
                        <span className="block text-xs text-muted-foreground">{x.description ? `${x.description} ` : ""}<span className="fig">{x.slides}</span> slide{x.slides === 1 ? "" : "s"}, by {people[x.owner_id]?.name.split(" ")[0] ?? "a former member"}.</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            {t && (
              <div className="space-y-3">
                <SlotFills slots={t.slots} metrics={metrics} fills={fills} onChange={setFills} />
                {!metrics.length && t.slots.length > 0 && <p className="text-sm text-muted-foreground">You see no Metrics yet to fill it with.</p>}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!ready || pending}>Create deck</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
