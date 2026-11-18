"use client";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { compactValue, formatValue } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { MetricDescription } from "@ziffr/core/types";
import { periodLabel, type YearStart } from "@ziffr/core/periods";
import { commonPeriod } from "@ziffr/core/correlation";

/** Two Metrics against each other, one dot per common period: the longer of their periods (spec 0019). */
export function ScatterView({
  x,
  y,
  pairs,
  height = 260,
  yearStart,
  numberStyle,
}: {
  /** The workspace's year start, for naming periods. */
  yearStart: YearStart;
  /** How the workspace writes numbers. */
  numberStyle: NumberStyle;
  x: MetricDescription;
  y: MetricDescription;
  pairs: { period: string; x: number; y: number }[];
  height?: number | string;
}) {
  return (
    <div style={{ height }} role="img" aria-label={`${y.name} against ${x.name}, ${pairs.length} points`}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart accessibilityLayer={false} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--color-rule)" />
          <XAxis type="number" dataKey="x" name={x.name} domain={["auto", "auto"]} tickFormatter={(v) => compactValue(x, v, numberStyle)} tick={{ fontSize: 12, fill: "var(--color-muted)", fontFamily: "var(--font-outlier)" }} stroke="var(--color-rule-2)" />
          <YAxis type="number" dataKey="y" name={y.name} domain={["auto", "auto"]} tickFormatter={(v) => compactValue(y, v, numberStyle)} tick={{ fontSize: 12, fill: "var(--color-muted)", fontFamily: "var(--font-outlier)" }} width={68} stroke="var(--color-rule-2)" />
          <Tooltip
            content={({ payload }) => {
              const p = payload?.[0]?.payload as { period: string; x: number; y: number } | undefined;
              if (!p) return null;
              return (
                <div className="stock rounded-[var(--radius-input)] px-2.5 py-1.5 text-xs">
                  <div className="font-medium">{periodLabel(p.period, commonPeriod(x.period, y.period), yearStart)}</div>
                  <div>{x.name}: <span className="fig">{formatValue(x, p.x, numberStyle)}</span></div>
                  <div>{y.name}: <span className="fig">{formatValue(y, p.y, numberStyle)}</span></div>
                </div>
              );
            }}
          />
          <Scatter data={pairs} fill="var(--color-data)" isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
