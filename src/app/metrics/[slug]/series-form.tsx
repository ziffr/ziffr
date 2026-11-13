"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadSeries } from "@/app/series-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Paste targets (a budget) or projections, one "period value" line each. Owner only. */
export function SeriesForm({ metricId }: { metricId: number }) {
  const [kind, setKind] = useState<"target" | "projection">("target");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await uploadSeries(metricId, kind, text, note);
            toast.success(`${r.saved} ${kind === "target" ? "targets" : "projections"} saved`, { description: r.skipped ? `${r.skipped} lines skipped: use one "2026-12 140000" line per period.` : undefined });
            if (r.saved) setText("");
          } catch (err) {
            toast.error("Not saved", { description: (err as Error).message });
          }
        });
      }}
    >
      <div className="flex flex-wrap gap-2 text-sm">
        <select aria-label="Series" value={kind} onChange={(e) => setKind(e.target.value as "target" | "projection")} className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2">
          <option value="target">Targets (budget)</option>
          <option value="projection">Projections</option>
        </select>
        <Input aria-label="Note" placeholder="Note, e.g. Budget 2027" value={note} onChange={(e) => setNote(e.target.value)} className="w-56" />
      </div>
      <textarea aria-label="Period and value lines" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"2026-12 140000\n2027-01 112000"} className="fig w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 py-2 text-sm" />
      <Button type="submit" disabled={pending || !text.trim()}>Save</Button>
    </form>
  );
}
