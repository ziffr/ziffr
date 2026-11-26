"use client";
// Record a first value where a Widget stands empty (GLOSSARY: Widget, Submitter): a dashboard's grid offers it for the
// Metrics the viewer submits. The slide-over lives here, outside the cards, so a tap or a long press in it never
// reaches the card behind it. The core checks again who may record.
import { useCallback, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { RecordingOffer } from "@ziffr/core/record-own-value";
import { RecordSheet } from "@/app/metrics/[slug]/record-value";
import { Button } from "@/components/ui/button";
import { RecordActionContext, type RecordAction } from "@/views/no-values-note";
import { recordLabel } from "@/views/no-values-words";

/** Gives the empty views inside it a button for each Metric in `offers` (keyed by Metric id). */
export function RecordActions({ offers, children }: { offers: Record<number, RecordingOffer>; children: ReactNode }) {
  // The offer itself is kept, so the slide-over and its answer stay when the recorded value takes the button away.
  const [chosen, setChosen] = useState<RecordingOffer | null>(null);
  const action = useCallback<RecordAction>((metrics) => {
    const m = metrics.find((x) => x.id !== undefined && offers[x.id]);
    return m ? <Button variant="outline" size="sm" className="max-md:h-11" onClick={() => setChosen(offers[m.id!])}><Plus aria-hidden /> {recordLabel(m.period)}</Button> : null;
  }, [offers]);
  return (
    <RecordActionContext value={action}>
      {children}
      {chosen && <RecordSheet offer={chosen} open onOpenChange={(open) => { if (!open) setChosen(null); }} />}
    </RecordActionContext>
  );
}
