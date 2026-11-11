"use client";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { Point } from "@/lib/types";

export function Sparkline({ points, height = 48, tone = "neutral" }: { points: Point[]; height?: number | string; tone?: "good" | "bad" | "neutral" }) {
  const color = tone === "bad" ? "var(--color-error)" : tone === "good" ? "var(--color-success)" : "var(--color-ink-2)";
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} accessibilityLayer={false}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line dataKey="value" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
