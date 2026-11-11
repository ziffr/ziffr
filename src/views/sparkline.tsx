"use client";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import type { Point } from "@/lib/types";

export function Sparkline({ points, height = 48, tone = "neutral" }: { points: Point[]; height?: number | string; tone?: "good" | "bad" | "neutral" }) {
  const color = tone === "bad" ? "var(--destructive)" : tone === "good" ? "var(--chart-2)" : "var(--chart-1)";
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
