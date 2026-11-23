"use client";
// The tiles of the Analysis Canvas (GLOSSARY: Analysis Canvas; ticket #988): shortcuts offered by how many Metrics are on it, taken
// from the one list of quick starts in the core (quick-starts.ts), which names the picker entry each is a shortcut for. The first of
// the Metrics given is the one to explain; Drivers is about it.
import { Play } from "lucide-react";
import type { Metric } from "@ziffr/core/types";
import { QUICK_STARTS, type QuickTemplate } from "@ziffr/core/quick-starts";
import { cn } from "@/lib/utils";

/** What a tile asks of the canvas: how many Metrics, and the words when it is not there yet. */
const NEEDS: Record<string, { ok: (n: number) => boolean; why: string }> = {
  forecast: { ok: (n) => n >= 1, why: "Drop one metric" },
  correlation: { ok: (n) => n === 2, why: "Drop exactly two metrics" },
  drivers: { ok: (n) => n >= 2, why: "Drop two or more metrics" },
  matrix: { ok: (n) => n >= 3, why: "Drop three or more metrics" },
};

/** The tiles, offered for `ms` (the one to explain first). `run` runs one on the Metrics it is given. */
export function QuickTiles({ ms, run, pending }: { ms: Metric[]; run: (template: Exclude<QuickTemplate, "did-it-work">, ids: number[]) => void; pending: boolean }) {
  const n = ms.length;
  const go = (t: Exclude<QuickTemplate, "did-it-work">) => (t === "forecast" ? ms.forEach((m) => run("forecast", [m.id])) : run(t, t === "correlation" ? [ms[0].id, ms[1].id] : ms.map((m) => m.id)));
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {QUICK_STARTS.filter((q) => q.kind === "tile").map((q) => {
        const t = q.template as Exclude<QuickTemplate, "did-it-work">;
        const need = NEEDS[t], ok = need.ok(n);
        const blurb = t === "drivers" ? `What moves most with ${ms[0]?.name ?? "the one to explain"}?` : q.blurb;
        return (
          <button key={q.id} disabled={!ok || pending} onClick={() => go(t)} title={ok ? undefined : need.why}
            className={cn("flex items-start gap-2 rounded-[var(--radius-stock)] p-2.5 text-left text-sm transition-[transform,box-shadow]", ok ? "stock hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)]" : "cursor-not-allowed border border-dashed border-[var(--color-rule-2)] text-muted-foreground")}>
            <Play className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span><span className="font-medium">{q.label}</span><span className="block text-xs text-muted-foreground">{ok ? blurb : need.why}</span></span>
          </button>
        );
      })}
    </div>
  );
}
