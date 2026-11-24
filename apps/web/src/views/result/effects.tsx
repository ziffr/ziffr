"use client";
// What a what-if reaches (GLOSSARY: Takeaway; ticket #1076): the change asked for, and for each Metric it reaches its change and the range it is likely
// between. The Metrics are in their own units, so each row has its own scale from the lowest to the highest number it holds, with 0 marked: no row is
// compared with another by its length. The number is written on the row, and a row nothing can be said of has no bar.
import { formatValue } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { EffectsChart } from "@ziffr/core/result-chart";

const signed = (u: EffectsChart["rows"][number]["unit"], v: number, style: NumberStyle) => `${v > 0 ? "+" : ""}${formatValue(u, v, style)}`;

/** The rows of a what-if, each on its own scale. */
export function EffectsView({ chart: c, style }: { chart: EffectsChart; style: NumberStyle }) {
  return (
    <ul className="m-0 list-none space-y-2 p-0 text-sm" data-chart="effects">
      {c.rows.map((r, i) => {
        const nums = [0, r.effect, r.lo, r.hi].filter((v): v is number => v !== null);
        const [from, to] = [Math.min(...nums), Math.max(...nums)];
        const at = (v: number) => `${to === from ? 50 : ((v - from) / (to - from)) * 100}%`;
        return (
          <li key={i} className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(0,11rem)]" data-label={r.label} data-value={r.effect ?? ""}>
            <span dir="auto" className="break-words text-xs">{i === 0 ? `${r.label} (the change asked for)` : r.label}{r.note && <span className="block text-muted-foreground">{r.note}</span>}</span>
            <span className="relative mx-2 block h-4" aria-hidden>
              {r.effect !== null && (
                <>
                  <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--color-rule-2)]" />
                  {r.lo !== null && r.hi !== null && <span className="absolute top-1 h-2 rounded-sm bg-[var(--color-band)] outline outline-1 outline-[var(--color-rule-2)]" style={{ left: at(r.lo), width: `${((r.hi - r.lo) / (to - from || 1)) * 100}%` }} />}
                  <span className="absolute inset-y-0 w-px bg-[var(--color-ink)]" style={{ left: at(0) }} />
                  <span className="absolute top-0.5 size-3 -translate-x-1/2 rotate-45 border-2 border-[var(--color-data)] bg-[var(--color-cotton)]" style={{ left: at(r.effect) }} />
                </>
              )}
            </span>
            <span className="fig col-span-2 text-xs sm:col-span-1">{r.effect === null ? "can’t tell" : `${signed(r.unit, r.effect, style)}${r.lo !== null && r.hi !== null ? ` (${signed(r.unit, r.lo, style)} to ${signed(r.unit, r.hi, style)})` : ""}`}</span>
          </li>
        );
      })}
    </ul>
  );
}
