"use client";
// The bar above the Metrics list for downloading the values of the Metrics ticked in it (spec 0056; GLOSSARY: Metric).
// The checkboxes belong to this form through their `form` attribute, so the page stays a server page and the download
// is a plain GET to /metric-values, which the core checks. Only slugs are sent; the server decides what is in the file.
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** The id the list's checkboxes name in their `form` attribute. */
export const METRIC_EXPORT_FORM = "metrics-export";

/** "Download values", "Select all" and "Clear" for the ticked Metrics; `max` is the most one download holds. */
export function MetricExportBar({ max }: { max: number }) {
  const form = useRef<HTMLFormElement>(null);
  const [picked, setPicked] = useState(0);
  const boxes = () => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="metric"][form="${METRIC_EXPORT_FORM}"]`));
  useEffect(() => {
    const count = () => setPicked(boxes().filter((b) => b.checked).length);
    // Ticks are made in the list, outside this component: listen where they bubble to.
    document.addEventListener("change", count);
    return () => document.removeEventListener("change", count);
  }, []);
  const setAll = (on: boolean) => { boxes().slice(0, on ? max : undefined).forEach((b) => { b.checked = on; }); setPicked(boxes().filter((b) => b.checked).length); };
  const tooMany = picked > max;
  return (
    <form id={METRIC_EXPORT_FORM} ref={form} method="get" action="/metric-values" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <Button type="submit" variant="outline" disabled={picked === 0 || tooMany}>
        <Download aria-hidden /> Download values
      </Button>
      <span aria-live="polite" className="text-muted-foreground">
        {picked === 0 ? "Tick Metrics to download their values as a CSV file." : tooMany ? `Pick at most ${max} Metrics for one download.` : `${picked} selected`}
      </span>
      <button type="button" onClick={() => setAll(true)} className="min-h-11 px-1 text-xs text-muted-foreground underline sm:min-h-0">Select all</button>
      {picked > 0 && <button type="button" onClick={() => setAll(false)} className="min-h-11 px-1 text-xs text-muted-foreground underline sm:min-h-0">Clear</button>}
    </form>
  );
}
