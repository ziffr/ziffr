"use client";
// The Metrics to archive for a smaller Size (spec 0029, ticket #270), ticked as the page proposes; the count says how
// many more are needed. The core archives each one with every check archiving has.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { archiveForRoom } from "@/app/size-actions";
import type { RoomMetric } from "@ziffr/core/make-room";

/** A period start as "Mar 2026", or "No values yet". */
const latestWords = (p: string | null) => (p ? `Latest value ${new Date(`${p}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}` : "No values yet");

/** The list with its ticks and the button. */
export function MakeRoomForm({ offered, ticked, need }: { offered: RoomMetric[]; ticked: number[]; need: number }) {
  const [chosen, setChosen] = useState(new Set(ticked));
  const [pending, start] = useTransition();
  const router = useRouter();
  const missing = Math.max(0, need - chosen.size);
  const toggle = (id: number) => setChosen((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await archiveForRoom([...chosen]);
            if (isActionError(r)) { toast.error("Not archived", { description: r.error }); return; }
            toast.success(`${r.archived} Metric${r.archived === 1 ? "" : "s"} archived`);
            router.push("/settings/workspace#size");
          } catch {
            toast.error("Not archived", { description: UNEXPECTED });
          }
        });
      }}
    >
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border">
        {offered.map((m) => (
          <li key={m.id}>
            <label className="flex min-h-10 items-center gap-3 px-3 py-2">
              <input type="checkbox" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} className="size-4 accent-[var(--color-ink)]" />
              <span className="font-medium">{m.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{latestWords(m.latest)}</span>
            </label>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="text-[var(--color-ink-2)]">{chosen.size} ticked{missing > 0 ? `, ${missing} more needed to fit` : ", enough to fit"}.</p>
      <Button type="submit" disabled={pending || chosen.size === 0}>{pending ? "Archiving…" : `Archive ${chosen.size} Metric${chosen.size === 1 ? "" : "s"}`}</Button>
    </form>
  );
}
