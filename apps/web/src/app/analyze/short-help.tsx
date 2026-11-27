"use client";
// What a person can do about a question with too little history (GLOSSARY: Analysis Canvas, Method, Metric): add earlier values
// through the Metric page's own "Fill past periods" dialog. Offered only where the core said they may paste values for that Metric;
// the paste page checks that again and leads back here. Nothing is recorded from this row.
import { useState } from "react";
import { History } from "lucide-react";
import type { ShortView } from "@ziffr/core/analysis-picker";
import { FillPast } from "@/app/metrics/[slug]/fill-past";

const BUTTON = "stock flex min-h-11 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm text-foreground";

/** The buttons under a greyed question whose history is short. */
export function ShortHelp({ short }: { short: ShortView }) {
  const [filling, setFilling] = useState(false);
  if (!short.mayAddEarlier) return null;
  return (
    <div className="flex flex-wrap gap-2 px-2.5 pb-2.5">
      <button type="button" onClick={() => setFilling(true)} className={BUTTON}><History aria-hidden className="size-3.5" /> Add earlier values</button>
      {/* Only the two ways that take pasted values, which is what the core's check allows here. */}
      {filling && <FillPast metric={short.metric} from="analyze" ways={{ paste: true, assistant: false, system: false }} open onOpenChange={setFilling} onAssistant={() => {}} />}
    </div>
  );
}
