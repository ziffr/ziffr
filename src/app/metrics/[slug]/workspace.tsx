"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessageSquarePlus, MousePointerClick, X } from "lucide-react";
import { MetricChart } from "@/views/metric-chart";
import { createAction } from "@/app/actions";
import { formatValue, periodLabel } from "@/lib/format";
import type { ForecastPoint } from "@/analyses/forecast";
import type { Metric, Point, Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MetricWorkspace({
  metric,
  points,
  forecast,
  markers,
  people,
  viewer,
}: {
  metric: Metric;
  points: Point[];
  forecast: ForecastPoint[] | null;
  markers: string[];
  people: Profile[];
  viewer: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const others = people.filter((p) => p.id !== viewer);
  const [assignee, setAssignee] = useState(others.find((p) => p.id === "ben")?.id ?? others[0]?.id);
  const [question, setQuestion] = useState("");
  const [pending, start] = useTransition();
  const point = points.find((p) => p.period === selected);

  const pick = (period: string) => {
    setSelected(period);
    const v = points.find((p) => p.period === period)?.value;
    const bad = metric.polarity === "lower" ? "high" : "low";
    const off = (metric.target_max !== null && v! > metric.target_max) || (metric.target_min !== null && v! < metric.target_min);
    setQuestion(off ? `Why is ${metric.name.toLowerCase()} so ${bad} in ${periodLabel(period, metric.period)}?` : `What happened with ${metric.name.toLowerCase()} in ${periodLabel(period, metric.period)}?`);
  };

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><MousePointerClick className="size-3.5" /> Click a point to ask someone about it</span>
        <span className="flex items-center gap-3">
          <Legend className="bg-chart-2/20" label="Target range" />
          {forecast && <Legend className="border-t-2 border-dashed border-chart-1" label="Forecast" />}
          {markers.length > 0 && <Legend className="rounded-full border border-chart-5 bg-chart-5/25" label="Action" />}
        </span>
      </div>
      <MetricChart metric={metric} points={points} forecast={forecast} markers={markers} selected={selected} onSelect={pick} />
      {selected && point && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <MessageSquarePlus className="size-4 text-primary" />
            <span className="font-medium">New Action about {periodLabel(selected, metric.period)}</span>
            <span className="text-muted-foreground">· {formatValue(metric, point.value)}</span>
            <button onClick={() => setSelected(null)} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Cancel"><X className="size-4" /></button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex shrink-0 items-center gap-2 text-sm">
              Assign to
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">
                {others.map((p) => <option key={p.id} value={p.id}>{p.name.split(" ")[0]} ({p.role})</option>)}
              </select>
            </label>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={1} className="min-h-9 flex-1" />
            <Button
              disabled={pending || !question.trim()}
              onClick={() =>
                start(async () => {
                  const id = await createAction({ metricId: metric.id, period: selected, assigneeId: assignee!, question });
                  router.push(`/actions/${id}`);
                })
              }
            >
              Assign Action
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="hidden items-center gap-1.5 sm:flex">
      <span className={`inline-block h-2.5 w-4 ${className}`} />
      {label}
    </span>
  );
}
