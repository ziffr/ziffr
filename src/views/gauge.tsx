"use client";
import { formatValue } from "@/lib/format";
import type { Metric } from "@/lib/types";

/** Semicircle gauge: target band in green, needle at the latest value. */
export function Gauge({ metric, value, history }: { metric: Metric; value: number | undefined; history: number[] }) {
  const all = [...history, metric.target_min, metric.target_max].filter((v): v is number => v !== null && v !== undefined);
  const lo = Math.min(...all) * 0.9;
  const hi = Math.max(...all) * 1.1;
  const t = (v: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)));
  const pt = (f: number, r: number) => [60 - r * Math.cos(Math.PI * f), 60 - r * Math.sin(Math.PI * f)] as const;
  const arc = (a: number, b: number, r: number) => {
    const [x1, y1] = pt(a, r);
    const [x2, y2] = pt(b, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const tMin = metric.target_min !== null ? t(metric.target_min) : 0;
  const tMax = metric.target_max !== null ? t(metric.target_max) : 1;
  const ok = value !== undefined && (metric.target_min === null || value >= metric.target_min) && (metric.target_max === null || value <= metric.target_max);
  const [nx, ny] = pt(value === undefined ? 0 : t(value), 40);
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <svg viewBox="0 0 120 68" className="w-full max-w-56" role="img" aria-label={`${metric.name} ${formatValue(metric, value)} against target`}>
        <path d={arc(0, 1, 46)} stroke="var(--color-paper-3)" strokeWidth={10} fill="none" />
        <path d={arc(tMin, tMax, 46)} stroke="var(--color-success)" strokeOpacity={0.45} strokeWidth={10} fill="none" />
        {value !== undefined && <line x1={60} y1={60} x2={nx} y2={ny} stroke={ok ? "var(--color-ink)" : "var(--color-error)"} strokeWidth={2.5} strokeLinecap="round" />}
        <circle cx={60} cy={60} r={3.5} fill="var(--color-ink)" />
      </svg>
      <div className={`-mt-1 text-xl font-semibold tracking-[-0.02em] ${ok ? "" : "text-destructive"}`}>{formatValue(metric, value)}</div>
    </div>
  );
}
