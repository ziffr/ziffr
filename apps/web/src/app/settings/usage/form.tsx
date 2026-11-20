"use client";
// The suggested Metrics to archive (spec 0031, ticket #364), all ticked; archiving asks once more. Nothing happens
// without the click, and the core archives each with every check archiving has.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { archiveUnused } from "@/app/usage-actions";

/** The checklist, its count and the confirmed button. */
export function ArchiveSuggestions({ items }: { items: { id: number; name: string; why: string }[] }) {
  const [chosen, setChosen] = useState(new Set(items.map((i) => i.id)));
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (id: number) => setChosen((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const n = chosen.size;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm(`Archive ${n} Metric${n === 1 ? "" : "s"}? They keep their values and history, ask for nothing, and can be brought back.`)) return;
        start(async () => {
          try {
            const r = await archiveUnused([...chosen]);
            if (isActionError(r)) { toast.error("Not archived", { description: r.error }); return; }
            toast.success(`${r.archived} Metric${r.archived === 1 ? "" : "s"} archived`);
            router.refresh();
          } catch {
            toast.error("Not archived", { description: UNEXPECTED });
          }
        });
      }}
    >
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border">
        {items.map((m) => (
          <li key={m.id}>
            <label className="flex min-h-10 items-center gap-3 px-3 py-2">
              <input type="checkbox" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} className="size-4 accent-[var(--color-ink)]" />
              <span className="font-medium">{m.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{m.why}</span>
            </label>
          </li>
        ))}
      </ul>
      <Button type="submit" disabled={pending || n === 0}>{pending ? "Archiving…" : `Archive ${n} Metric${n === 1 ? "" : "s"}`}</Button>
    </form>
  );
}
