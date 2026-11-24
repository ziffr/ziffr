"use client";
// The Metrics on the Analysis Canvas, each with its role in words (GLOSSARY: Analysis Canvas; ticket #988): one is marked as the
// one to explain, the analyses that explain a Metric (Drivers, What moves B?, What does B need?, What if A changes?, Did it work?)
// are about it, and the others are compared with it. The mark is its own control and is kept with the canvas: the order the Metrics
// were dropped in does not decide it. Only Metrics the page sent are drawn, which are ones the person sees.
import { X } from "lucide-react";
import type { Metric } from "@ziffr/core/types";
import { PERIOD_LABEL } from "@ziffr/core/periods";
import { cn } from "@/lib/utils";

/** The role control of one chip: pressed on the one to explain, a button to make it so on the others. */
function RoleButton({ m, explained, onExplain, disabled }: { m: Metric; explained: boolean; onExplain: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={explained}
      aria-label={explained ? `${m.name} is the one to explain` : `Make ${m.name} the one to explain`}
      disabled={disabled}
      onClick={() => { if (!explained) onExplain(); }}
      className={cn("min-h-7 rounded-[var(--radius-input)] px-1.5 text-xs", explained ? "bg-foreground font-medium text-background" : "border border-[var(--color-rule-2)] text-muted-foreground hover:bg-muted hover:text-foreground")}
    >
      {explained ? "The one to explain" : "Make this the one to explain"}
    </button>
  );
}

/** The chips of the canvas. With one Metric it is the one to explain and needs no control. */
export function CanvasChips({ ms, explainedId, onExplain, onRemove, disabled }: { ms: Metric[]; explainedId: number | null; onExplain: (id: number) => void; onRemove: (id: number) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ms.map((m) => {
        const explained = m.id === explainedId;
        return (
          <span key={m.id} data-explained={explained} className={cn("stock flex flex-col gap-1 rounded-[var(--radius-stock)] py-1.5 pr-1.5 pl-2.5 text-sm", explained && ms.length > 1 && "outline-2 -outline-offset-2 outline-[var(--color-ink-2)]")}>
            <span className="flex items-center gap-1.5">
              {m.name}
              <span className="text-xs text-muted-foreground">{PERIOD_LABEL[m.period].toLowerCase()}</span>
              <button onClick={() => onRemove(m.id)} aria-label={`Take ${m.name} off the canvas`} className="rounded p-0.5 text-muted-foreground hover:bg-muted"><X className="size-3" /></button>
            </span>
            {ms.length > 1
              ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{!explained && "Compared with"}<RoleButton m={m} explained={explained} onExplain={() => onExplain(m.id)} disabled={disabled} /></span>
              : <span className="text-xs font-medium">The one to explain</span>}
          </span>
        );
      })}
    </div>
  );
}
