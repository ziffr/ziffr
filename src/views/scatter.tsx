"use client";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { compactValue, formatValue, periodLabel } from "@/lib/format";
import type { MetricDescription } from "@/lib/types";

export function ScatterView({
  x,
  y,
  pairs,
  height = 260,
}: {
  x: MetricDescription;
  y: MetricDescription;
  pairs: { period: string; x: number; y: number }[];
  height?: number | string;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--border)" />
          <XAxis type="number" dataKey="x" name={x.name} domain={["auto", "auto"]} tickFormatter={(v) => compactValue(x, v)} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis type="number" dataKey="y" name={y.name} domain={["auto", "auto"]} tickFormatter={(v) => compactValue(y, v)} tick={{ fontSize: 11 }} width={64} stroke="var(--muted-foreground)" />
          <Tooltip
            content={({ payload }) => {
              const p = payload?.[0]?.payload as { period: string; x: number; y: number } | undefined;
              if (!p) return null;
              return (
                <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow">
                  <div className="font-medium">{periodLabel(p.period, x.period)}</div>
                  <div>{x.name}: {formatValue(x, p.x)}</div>
                  <div>{y.name}: {formatValue(y, p.y)}</div>
                </div>
              );
            }}
          />
          <Scatter data={pairs} fill="var(--chart-1)" isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
