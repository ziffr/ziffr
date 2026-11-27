"use client";
// What a person can do about a question that does not fit yet (GLOSSARY: Analysis Canvas, Method, Metric, Sample Data): see an example
// of its answer, and, where history is short, add earlier values through the Metric page's own "Fill past periods" dialog. That is
// offered only where the core said they may paste values for that Metric; the paste page checks again and leads back here.
import { useState } from "react";
import { History } from "lucide-react";
import type { EntryView } from "@ziffr/core/analysis-picker";
import { FillPast } from "@/app/metrics/[slug]/fill-past";
import { ShortExample } from "./short-example";

const BUTTON = "stock flex min-h-11 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm text-foreground";

/** The buttons under a greyed question: an example of its answer, and earlier values where history is what is short. */
export function ShortHelp({ entry }: { entry: EntryView }) {
  const [filling, setFilling] = useState(false);
  const short = entry.short;
  return (
    <div className="flex flex-wrap gap-2 px-2.5 pb-2.5">
      {short?.mayAddEarlier && <button type="button" onClick={() => setFilling(true)} className={BUTTON}><History aria-hidden className="size-3.5" /> Add earlier values</button>}
      <ShortExample entry={entry.id} span={short?.span ?? "month"} />
      {/* Only the two ways that take pasted values, which is what the core's check allows here. */}
      {filling && short && <FillPast metric={short.metric} from="analyze" ways={{ paste: true, assistant: false, system: false }} open onOpenChange={setFilling} onAssistant={() => {}} />}
    </div>
  );
}
