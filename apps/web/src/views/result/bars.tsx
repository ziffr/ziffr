"use client";
// Bars of a result (GLOSSARY: Takeaway, Breakdown; ticket #1076): the correlation at each delay with the best one marked, the share of each row of a
// Breakdown with the running total across them, each driver's share of what moved a Metric and each row's contribution to a change. It draws the numbers
// the core's chart holds; a bar the words are about is told apart by a solid fill against hatching and by a word under it, not by colour alone.
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, formatValue } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { BarsChart, ChartBar } from "@ziffr/core/result-chart";
import { tagWords } from "./words";

const percent = (v: number, style: NumberStyle) => `${formatNumber(v, v % 1 === 0 ? 0 : 1, style)} %`;
const HATCH = "result-hatch";

type Row = { label: string; value: number; tag: ChartBar["tag"] | null; run: number | null };
type TickProps = { x?: number | string; y?: number | string; payload?: { value: string | number } };

// What a column's label says under it: the (shortened) label, slanted where there are many, and "best delay" under the best one.
function tickOf(rows: Row[], delay: boolean) {
  const Tick = ({ x = 0, y = 0, payload }: TickProps) => {
    const label = String(payload?.value ?? "");
    const row = rows.find((r) => r.label === label);
    const long = !delay && rows.length > 6;
    return (
      <g transform={`translate(${Number(x)},${Number(y) + 4})`}>
        <text textAnchor={long ? "end" : "middle"} fontSize={11} fill="var(--color-muted)" transform={long ? "rotate(-35)" : undefined} dy={long ? 4 : 10}>{label.slice(0, 14)}</text>
        {delay && row?.tag === "best" && <text textAnchor="middle" fontSize={11} fill="var(--color-ink)" fontWeight={600} dy={24}>{tagWords("best")}</text>}
      </g>
    );
  };
  return Tick;
}

type Box = { x?: number; y?: number; width?: number; height?: number; payload?: Row };
function shapeOf(delay: boolean) {
  const Shape = ({ x = 0, y = 0, width = 0, height = 0, payload }: Box) => {
    const solid = delay ? payload?.tag === "best" : payload?.tag === "top";
    return <rect x={x} y={height < 0 ? y + height : y} width={width} height={Math.abs(height)} fill={solid ? "var(--color-data)" : `url(#${HATCH})`} stroke="var(--color-data)" strokeWidth={solid ? 1.5 : 1} data-label={payload?.label} data-value={payload?.value} />;
  };
  return Shape;
}

/** The columns: a correlation for each delay (best one marked), or the share of each row with the running share as a line. */
function Columns({ chart: c, style }: { chart: BarsChart; style: NumberStyle }) {
  const delay = c.measure === "delay";
  const rows: Row[] = c.bars.map((b, i) => ({ label: b.label, value: b.value, tag: b.tag ?? null, run: c.line?.[i] ?? null }));
  const text = (v: number) => (delay ? formatNumber(v, 2, style) : percent(v, style));
  return (
    <div style={{ height: delay ? 240 : 260 }} data-chart="columns">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart accessibilityLayer={false} data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 4 }}>
          <defs>
            <pattern id={HATCH} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--color-cotton)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-data)" strokeWidth="2" /></pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-rule)" />
          <XAxis dataKey="label" interval={0} height={delay ? 44 : 56} tick={tickOf(rows, delay)} stroke="var(--color-rule-2)" />
          <YAxis domain={delay ? [-1, 1] : [0, 100]} ticks={delay ? [-1, -0.5, 0, 0.5, 1] : [0, 25, 50, 75, 100]} tickFormatter={(v: number) => (delay ? formatNumber(v, 1, style) : `${v} %`)} tick={{ fontSize: 12, fill: "var(--color-muted)", fontFamily: "var(--font-outlier)" }} width={48} stroke="var(--color-rule-2)" />
          {delay && <ReferenceLine y={0} stroke="var(--color-ink)" />}
          <Tooltip formatter={(v) => (typeof v === "number" ? text(v) : String(v))} labelFormatter={(l) => (delay ? `Delay of ${l} ${c.span}s` : String(l))} />
          <Bar dataKey="value" isAnimationActive={false} shape={shapeOf(delay)} />
          {c.line && <Line dataKey="run" stroke="var(--color-accent)" strokeWidth={1.75} strokeDasharray="7 3 2 3" dot={{ r: 3, fill: "var(--color-cotton)", stroke: "var(--color-accent)" }} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const rowText = (b: ChartBar, c: BarsChart, style: NumberStyle): string => (c.measure === "importance" ? percent(b.value, style) : `${b.value > 0 ? "+" : ""}${formatValue(c.unit!, b.value, style)}`);

/** The rows: each driver's share of what moved a Metric, or each row's contribution to a change (from the middle, up to the right, down to the left). */
function Rows({ chart: c, style }: { chart: BarsChart; style: NumberStyle }) {
  const signed = c.measure === "change";
  const most = Math.max(...c.bars.map((b) => Math.abs(b.value)), 1e-300);
  return (
    <ul className="m-0 list-none space-y-1.5 p-0 text-sm" data-chart="rows">
      {c.bars.map((b, i) => {
        const width = `${(Math.abs(b.value) / (signed ? most : 100)) * (signed ? 50 : 100)}%`;
        const up = b.value >= 0;
        const side = signed ? (up ? { left: "50%" } : { right: "50%" }) : { left: 0 };
        const fill = up || !signed ? "var(--color-data)" : "repeating-linear-gradient(45deg, var(--color-data) 0 2px, var(--color-cotton) 2px 5px)";
        return (
          <li key={i} className={`grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 ${b.tag === "total" ? "border-t border-[var(--color-rule-2)] pt-1.5 font-medium" : ""}`} data-label={b.label} data-value={b.value}>
            <span dir="auto" className="break-words text-xs">
              {b.label === "" && b.tag ? tagWords(b.tag) : b.label}
              {b.note ? <span className="block text-muted-foreground">{b.note}</span> : b.tag && b.label !== "" ? <span className="block text-muted-foreground">{tagWords(b.tag)}</span> : null}
            </span>
            <span className="relative block h-3 rounded-sm bg-[var(--color-band)]" aria-hidden>
              <span className="absolute inset-y-0 rounded-sm border border-[var(--color-data)]" style={{ width, ...side, background: fill }} />
              {signed && <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--color-ink)]" />}
            </span>
            <span className="fig text-xs">{rowText(b, c, style)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Bars of a result: see the file's header. */
export function BarsView({ chart, style }: { chart: BarsChart; style: NumberStyle }) {
  return chart.measure === "delay" || chart.measure === "share" ? <Columns chart={chart} style={style} /> : <Rows chart={chart} style={style} />;
}
