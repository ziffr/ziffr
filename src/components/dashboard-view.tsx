import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, MessageSquare, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import { getActions, getAllSeries, getProfileMap } from "@/lib/data";
import { formatValue, health, periodLabel, targetText } from "@/lib/format";
import { createDashboard, togglePin } from "@/app/actions";
import { Sparkline } from "@/views/sparkline";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export async function DashboardView({ id }: { id?: number }) {
  const [{ data: dashboards }, { metrics, series }, actions, people] = await Promise.all([
    db.from("dashboards").select("*").order("id"),
    getAllSeries(),
    getActions(),
    getProfileMap(),
  ]);
  const current = dashboards?.find((d) => d.id === id) ?? dashboards?.[0];
  const { data: items } = current ? await db.from("dashboard_items").select("*").eq("dashboard_id", current.id).order("position") : { data: [] };
  const pinned = (items ?? []).map((i) => metrics.find((m) => m.id === i.metric_id)!).filter(Boolean);

  return (
    <>
      <PageHeader title={current?.name ?? "Dashboards"} sub={current ? <>Owned by <Person p={people[current.owner_id]} /> · pin metrics from any metric page</> : undefined} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {dashboards?.map((d) => (
          <Link key={d.id} href={`/dashboards/${d.id}`} className={cn("rounded-full border px-3 py-1 text-sm", d.id === current?.id ? "border-primary bg-primary/5 font-medium" : "bg-background hover:bg-muted")}>{d.name}</Link>
        ))}
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground hover:text-foreground"><Plus className="size-3.5" /> New dashboard</summary>
          <form action={createDashboard} className="absolute z-20 mt-2 w-80 rounded-xl border bg-background p-4 shadow-lg">
            <Input name="name" required placeholder="Dashboard name" className="mb-3" />
            <div className="mb-3 max-h-56 space-y-1.5 overflow-y-auto text-sm">
              {metrics.map((m) => (
                <label key={m.id} className="flex items-center gap-2"><input type="checkbox" name="metrics" value={m.id} className="size-4 accent-primary" /> {m.name}</label>
              ))}
            </div>
            <Button type="submit" className="w-full">Create</Button>
          </form>
        </details>
      </div>

      {pinned.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">Nothing pinned yet. Open a <Link href="/metrics" className="underline">metric</Link> and use “Pin to dashboard”.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pinned.map((m) => {
            const pts = series[m.slug] ?? [];
            const last = pts[pts.length - 1];
            const prev = pts[pts.length - 2];
            const change = last && prev && prev.value !== 0 ? (last.value - prev.value) / Math.abs(prev.value) : null;
            const tone = health(m, last?.value);
            const good = change === null || m.polarity === "target" ? null : (change > 0) === (m.polarity === "higher");
            const openActions = actions.filter((a) => a.metric_id === m.id && a.status !== "closed").length;
            return (
              <div key={m.id} className={cn("group relative rounded-xl border bg-background p-4 transition-shadow hover:shadow-md", tone === "bad" && "border-destructive/40")}>
                <form action={togglePin.bind(null, current!.id, m.id, true)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100">
                  <button title="Unpin" className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-3.5" /></button>
                </form>
                <Link href={`/metrics/${m.slug}`} className="block">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {m.name}
                    {openActions > 0 && <span className="flex items-center gap-0.5 rounded-full bg-chart-5/15 px-1.5 text-[11px] text-chart-5"><MessageSquare className="size-3" />{openActions}</span>}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className={cn("text-2xl font-semibold tracking-tight", tone === "bad" && "text-destructive")}>{last ? formatValue(m, last.value) : "–"}</span>
                    {change !== null && (
                      <span className={cn("flex items-center text-xs", good === true && "text-chart-2", good === false && "text-destructive")}>
                        {change > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{(change * 100).toFixed(1)} %
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{last ? periodLabel(last.period, m.period) : "No values yet"} · target {targetText(m)}</div>
                  {pts.length > 1 && <div className="mt-3"><Sparkline points={pts.slice(m.period === "day" ? -60 : -18)} tone={tone} /></div>}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
