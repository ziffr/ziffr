"use client";
// Handing a Metric over (GLOSSARY: Metric Owner): beside the owner's name, for the Metric's owner, Owners and Admins.
// The core checks who may and who may take it.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { handOverMetricTo } from "@/app/series-actions";
import { Button } from "@/components/ui/button";

/** "Hand over…": pick a Member, and the Metric is theirs; you stay on as its Editor. */
export function HandOver({ metricId, name, choices }: { metricId: number; name: string; choices: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!choices.length) return null;
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Hand ${name} over to someone else`}>Hand over…</Button>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select aria-label={`Who takes over ${name}`} value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
        <option value="">Who takes over?</option>
        {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Button size="sm" variant="outline" disabled={pending || !to} onClick={() => start(async () => {
        try {
          const r = await handOverMetricTo(metricId, to);
          if (isActionError(r)) { toast.error("Not handed over", { description: r.error }); return; }
          toast.success("Handed over", { description: "They are told, and the previous owner stays on as Editor." });
          setOpen(false); router.refresh();
        } catch { toast.error("Not handed over", { description: UNEXPECTED }); }
      })}>{pending ? "Handing over…" : "Hand over"}</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </span>
  );
}
