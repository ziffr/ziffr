import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Sparkline } from "@/views/sparkline";
import { getAllSeries, getProfileMap } from "@/lib/data";
import { visibleMetricIds } from "@/lib/access";
import { viewerId } from "@/lib/viewer";
import { formatValue, health, PERIOD_LABEL, periodLabel, SOURCE_LABEL, targetText } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function MetricsPage() {
  const [{ metrics: all, series }, people, viewer] = await Promise.all([getAllSeries(), getProfileMap(), viewerId()]);
  const visible = await visibleMetricIds(viewer, all);
  const metrics = all.filter((m) => visible.has(m.id));
  return (
    <>
      <PageHeader title="Metrics" sub="Each metric is described once. Observations then arrive through its Sources.">
        <Link href="/metrics/new" className={buttonVariants()}>
          <Plus aria-hidden /> New metric
        </Link>
      </PageHeader>

      {metrics.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center">
          <p className="font-medium">No metrics yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Describe your first one, or ask a colleague to share theirs.</p>
          <Link href="/metrics/new" className={buttonVariants({ className: "mt-4" })}>New metric</Link>
        </div>
      ) : (
        <div className="stock overflow-x-auto rounded-[var(--radius-card)]">
          <table className="w-full text-sm">
            <caption className="sr-only">Metrics with their latest value, change, trend, target and owner</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Metric</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Latest</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Change</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Trend</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Target</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Owner</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const pts = series[m.slug] ?? [];
                const last = pts[pts.length - 1];
                const prev = pts[pts.length - 2];
                const tone = health(m, last?.value);
                const change = last && prev && prev.value ? (last.value - prev.value) / Math.abs(prev.value) : null;
                const good = change === null || m.polarity === "target" ? null : (change > 0) === (m.polarity === "higher");
                return (
                  <tr key={m.id} className="group relative border-b border-border last:border-0 hover:bg-[var(--color-paper-2)]">
                    <td className="px-4 py-3">
                      <Link href={`/metrics/${m.slug}`} className="font-medium no-underline after:absolute after:inset-0 group-hover:underline">
                        {m.name}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {PERIOD_LABEL[m.period]}, {m.formula ? "derived from other metrics" : `via ${m.sources.map((s) => SOURCE_LABEL[s]).join(" or ")}`}
                      </div>
                      <div className="fig mt-0.5 text-xs text-[var(--color-ink-2)] sm:hidden">Target {targetText(m)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={cn("fig whitespace-nowrap", tone === "bad" && "text-destructive")}>{last ? formatValue(m, last.value) : "–"}</div>
                      <div className="text-xs text-muted-foreground">{last ? periodLabel(last.period, m.period, true) : "No values yet"}</div>
                    </td>
                    <td className={cn("fig px-4 py-3 text-right text-xs whitespace-nowrap", good === true && "text-[var(--color-success)]", good === false && "text-destructive")}>
                      {change === null ? "–" : `${change > 0 ? "+" : ""}${(change * 100).toFixed(1)} %`}
                    </td>
                    <td className="hidden w-32 px-4 py-3 md:table-cell">{pts.length > 1 && <Sparkline points={pts.slice(-30)} height={28} tone={tone} />}</td>
                    <td className="fig hidden px-4 py-3 text-xs text-[var(--color-ink-2)] sm:table-cell">{targetText(m)}</td>
                    <td className="hidden px-4 py-3 lg:table-cell"><Person p={people[m.owner_id]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
