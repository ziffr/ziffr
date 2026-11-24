"use client";
// The grid of a correlation matrix (GLOSSARY: Takeaway, Correlation; ticket #1076): every pair of the Metrics with its number and its strength word,
// the strongest pairs darker. The word and the number are in the cell, so nothing is read from colour alone.
import { formatNumber } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { GridChart } from "@ziffr/core/result-chart";

/** The grid: one cell for each pair above the diagonal, empty where a pair could not be compared. */
export function GridView({ chart: c, style }: { chart: GridChart; style: NumberStyle }) {
  const cell = (row: number, col: number) => c.cells.find((x) => x.row === row && x.col === col);
  const last = c.labels.length - 1;
  return (
    <div className="overflow-x-auto" data-chart="grid">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">How the Metrics move together, pair by pair</caption>
        <thead>
          <tr><td />{c.labels.slice(1).map((l, i) => <th key={i} scope="col" dir="auto" className="px-1 pb-1 text-left font-medium">{l}</th>)}</tr>
        </thead>
        <tbody>
          {c.labels.slice(0, last).map((l, row) => (
            <tr key={row}>
              <th scope="row" dir="auto" className="pr-2 text-left font-medium">{l}</th>
              {c.labels.slice(1).map((_, k) => {
                const col = k + 1;
                const x = col > row ? cell(row, col) : undefined;
                if (!x) return <td key={col} className="p-0.5"><div className="min-h-12 rounded-sm bg-[var(--color-band)] opacity-40" aria-hidden /></td>;
                const shade = x.r === null ? 0 : Math.min(1, Math.abs(x.r));
                return (
                  <td key={col} className="p-0.5" data-r={x.r ?? ""}>
                    <div className="min-h-12 rounded-sm border border-[var(--color-rule-2)] px-1.5 py-1" style={{ background: `color-mix(in oklab, var(--color-data) ${Math.round(shade * 35)}%, var(--color-card))` }}>
                      {x.r === null ? <span className="text-muted-foreground">can&rsquo;t be compared</span> : <><span className="fig block text-sm font-medium">{formatNumber(x.r, 2, style)}</span><span className="block text-muted-foreground">{x.word}</span></>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
