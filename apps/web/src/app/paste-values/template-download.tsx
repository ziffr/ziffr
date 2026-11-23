"use client";
// Download a template (spec 0026; GLOSSARY: Observation): a CSV that names the Metrics the person may paste for and the
// periods they wait for, to fill in a spreadsheet and bring back to the box above. The core makes the file for this person;
// the browser only saves it. Nothing is recorded.
import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { shown, unwrap } from "@/lib/action-error";
import { pasteTemplateFile } from "@/app/paste-actions";
import type { PasteChoice } from "./paste-screen";

type Kind = "rows" | "matrix" | "history";

/** The row under the box: which template, and the button. `metricId` is the Metric chosen for a two-column paste. */
export function TemplateDownload({ metrics, metricId }: { metrics: PasteChoice[]; metricId: number | null }) {
  const [kind, setKind] = useState<Kind>(metricId ? "history" : "rows");
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState("");
  const [chosen, setChosen] = useState<number | null>(metricId ?? metrics[0]?.id ?? null);
  const history = kind === "history";
  const make = () => start(async () => {
    try {
      const r = unwrap(await pasteTemplateFile({ kind, metricId: history ? chosen : null, period: kind === "matrix" && period ? period : null })) as { fileName: string; text: string; metrics: number; periods: number };
      const url = URL.createObjectURL(new Blob([r.text], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.fileName; a.click();
      URL.revokeObjectURL(url);
      toast.success(history ? `${r.periods} period${r.periods === 1 ? "" : "s"} without a value` : `${r.metrics} Metric${r.metrics === 1 ? "" : "s"} in the template`);
    } catch (e) {
      toast.error("No template was made", { description: shown(e) });
    }
  });
  if (!metrics.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <span>Template</span>
        <select className="rounded-[var(--radius-input)] border border-input bg-card px-2 py-1 text-sm" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Template layout">
          <option value="rows">One value per row (your Metrics, this period)</option>
          <option value="matrix">Metrics down, periods across (the last 12)</option>
          <option value="history">One Metric&rsquo;s periods without a value</option>
        </select>
      </label>
      {kind === "matrix" && (
        <select className="rounded-[var(--radius-input)] border border-input bg-card px-2 py-1 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period of the Metrics in the template">
          <option value="">Metrics with the most common period</option>
          {["day", "week", "month", "quarter", "half", "year"].map((p) => <option key={p} value={p}>{`${p[0].toUpperCase()}${p.slice(1)}ly Metrics`.replace("Dayly", "Daily").replace("Halfly", "Half-yearly").replace("Yearly Metrics", "Yearly Metrics")}</option>)}
        </select>
      )}
      {history && (
        <select className="rounded-[var(--radius-input)] border border-input bg-card px-2 py-1 text-sm" value={chosen ?? ""} onChange={(e) => setChosen(Number(e.target.value))} aria-label="Metric for the template">
          {metrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      <Button variant="outline" size="sm" disabled={pending || (history && !chosen)} onClick={make}><Download aria-hidden /> Download a template</Button>
      <span className="text-muted-foreground">A CSV to fill in your spreadsheet and bring back here. Nothing is recorded by downloading it.</span>
    </div>
  );
}
