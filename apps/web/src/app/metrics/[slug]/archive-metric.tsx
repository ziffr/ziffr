"use client";
// Archiving a Metric and bringing it back (GLOSSARY: Archived Metric): for Owners, Admins and the Metric's owner. A
// Metric a Total adds up is asked up to which period it counts (spec 0058). The core checks who again.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { archiveMetric, restoreMetric } from "@/app/series-actions";
import { setTotalPartPeriods } from "@/app/total-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { PeriodChoice } from "../period-choices";

/** A Total that counts the Metric from now on, with the periods to pick from and the last one it has a value for. */
export type CountingTotal = { id: number; name: string; open: boolean; last: string; periods: PeriodChoice[] };

/** The confirmation of "Archive…" (an entry of the Metric page's ⋯ menu): says what archiving does. */
export function ArchiveMetric({ metricId, name, totals = [], open, onOpenChange }: { metricId: number; name: string; totals?: CountingTotal[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [pending, start] = useTransition();
  // Per Total, the last period it counts the Metric in ("" keeps counting it); proposed: the last with a value.
  const [until, setUntil] = useState<Record<number, string>>(() => Object.fromEntries(totals.map((t) => [t.id, t.last])));
  const [confirmed, setConfirmed] = useState(false);
  const unconfirmed = totals.some((t) => t.open && until[t.id]) && !confirmed;
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Archive {name}?</DialogTitle>
        <p className="text-sm text-muted-foreground">Its values, history and Versions stay, and widgets keep showing them. Nobody is asked for it any more and it takes no values. It no longer counts towards the workspace&rsquo;s Metrics, and you can bring it back at any time.</p>
        {totals.map((t) => (
          <label key={t.id} className="mt-1 block text-sm">
            <span className="mb-1.5 block [overflow-wrap:anywhere]">The Total {t.name} adds it up. Count it up to</span>
            <select className="min-h-11 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-base sm:min-h-9 sm:text-sm" value={until[t.id] ?? ""} onChange={(e) => setUntil((u) => ({ ...u, [t.id]: e.target.value }))}>
              {t.periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              <option value="">Keep counting it: later periods then wait for a value that does not come</option>
            </select>
          </label>
        ))}
        {totals.some((t) => t.open && until[t.id]) && (
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
            <span>I know that people who see an open Total learn the changed sums.</span>
          </label>
        )}
        <Button
          className="mt-2 min-h-11 sm:min-h-9"
          disabled={pending || unconfirmed}
          onClick={() => start(async () => {
            try {
              // The Totals first: refused, the Metric is not archived either.
              for (const t of totals) {
                if (!until[t.id]) continue;
                const ended = await setTotalPartPeriods(t.id, metricId, until[t.id], confirmed);
                if (isActionError(ended)) { toast.error("Not archived", { description: `${t.name}: ${ended.error}` }); return; }
              }
              const r = await archiveMetric(metricId);
              if (isActionError(r)) { toast.error("Not archived", { description: r.error }); return; }
              toast.success(`${name} archived`, { description: "Find it under Archived on the Metrics page." });
              onOpenChange(false);
              router.refresh();
            } catch {
              toast.error("Not archived", { description: UNEXPECTED });
            }
          })}
        >
          {pending ? "Archiving…" : "Archive the Metric"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** "Bring back", an entry of the ⋯ menu: the Metric is asked for and takes values again. */
export function useBringBack(metricId: number, name: string): () => void {
  const router = useRouter();
  const [, start] = useTransition();
  return () => start(async () => {
    try {
      const r = await restoreMetric(metricId);
      if (isActionError(r)) { toast.error("Not brought back", { description: r.error }); return; }
      toast.success(`${name} is back`, { description: "It is asked for and takes values again." });
      router.refresh();
    } catch {
      toast.error("Not brought back", { description: UNEXPECTED });
    }
  });
}
