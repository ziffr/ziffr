import Link from "next/link";
import { ClipboardPaste, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Sparkline } from "@/views/sparkline";
import { getAllSeries, getNumberStyle, getProfileMap, getYearStart } from "@/lib/data";
import { visibleMetricIds } from "@/lib/access";
import { viewerId } from "@/lib/viewer";
import { formatValue, health, SOURCE_LABEL, targetText } from "@ziffr/core/format";
import { Change, COLOUR_LEGEND, TargetChip } from "@/components/target-chip";
import { PERIOD_LABEL, periodLabel } from "@ziffr/core/periods";
import { inUse, isArchived } from "@ziffr/core/metric-row";
import { cn } from "@/lib/utils";
import { QuickLookButton } from "@/components/metric-quick-look";

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  // The list shows the latest value, the change and a trend line of 30 periods: only those are read.
  const [{ metrics: all, series }, people, viewer, yearStart, numberStyle, sp] = await Promise.all([getAllSeries({ points: 30 }), getProfileMap(), viewerId(), getYearStart(), getNumberStyle(), searchParams]);
  const visible = await visibleMetricIds(viewer, all);
  const seen = all.filter((m) => visible.has(m.id));
  // Archived Metrics (GLOSSARY: Archived Metric) are listed only under their own filter.
  const showArchived = sp.show === "archived";
  const archivedCount = seen.filter(isArchived).length;
  const metrics = showArchived ? seen.filter(isArchived) : inUse(seen);
  const filter = (archived: boolean) => cn("rounded-[var(--radius-input)] px-2.5 py-1 no-underline", archived === showArchived ? "stock font-medium" : "text-muted-foreground hover:bg-muted");
  return (
    <>
      <PageHeader title="Metrics" sub="Each metric is described once. Its values then arrive by chat, mail, a form link or the API.">
        <Link href="/paste-values" className={buttonVariants({ variant: "outline" })}>
          <ClipboardPaste aria-hidden /> Paste values
        </Link>
        <Link href="/metrics/new" className={buttonVariants()}>
          <Plus aria-hidden /> New metric
        </Link>
      </PageHeader>

      {(archivedCount > 0 || showArchived) && (
        <nav aria-label="Which Metrics" className="mb-3 flex flex-wrap gap-1 text-sm">
          <Link href="/metrics" aria-current={!showArchived ? "true" : undefined} className={filter(false)}>In use</Link>
          <Link href="/metrics?show=archived" aria-current={showArchived ? "true" : undefined} className={filter(true)}>Archived ({archivedCount})</Link>
        </nav>
      )}

      {showArchived && metrics.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center text-sm text-muted-foreground">No Archived Metrics. Archiving a Metric keeps its values and history and stops asking for it.</p>
      ) : metrics.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center">
          <p className="font-medium">No metrics yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Describe your first one, or ask a colleague to share theirs.</p>
          <Link href="/metrics/new" className={buttonVariants({ className: "mt-4" })}>New metric</Link>
        </div>
      ) : (
        <>
        <p className="mb-2 text-xs text-muted-foreground">{COLOUR_LEGEND}</p>
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
                return (
                  <tr key={m.id} className="group relative cursor-pointer border-b border-border last:border-0 hover:bg-[var(--color-paper-2)]">
                    <td className="px-4 py-3">
                      <Link href={`/metrics/${m.slug}`} className="font-medium no-underline after:absolute after:inset-0 group-hover:underline">
                        {m.name}
                      </Link>
                      <QuickLookButton slug={m.slug} name={m.name} />
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {PERIOD_LABEL[m.period]}, {m.formula ? "derived from other metrics" : `via ${m.sources.map((s) => SOURCE_LABEL[s]).join(" or ")}`}
                      </div>
                      <div className="fig mt-0.5 text-xs text-[var(--color-ink-2)] sm:hidden">Target {targetText(m, numberStyle)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="fig whitespace-nowrap">{last ? formatValue(m, last.value, numberStyle) : "–"}</div>
                      <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                        <TargetChip numberStyle={numberStyle} metric={m} value={last?.value} />
                        {last ? periodLabel(last.period, m.period, yearStart, true) : "No values yet"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--color-ink-2)]"><Change numberStyle={numberStyle} pct={change} /></td>
                    <td className="hidden w-32 px-4 py-3 md:table-cell">{pts.length > 1 && <Sparkline points={pts.slice(-30)} height={28} tone={tone} />}</td>
                    <td className="fig hidden px-4 py-3 text-xs text-[var(--color-ink-2)] sm:table-cell">{targetText(m, numberStyle)}</td>
                    <td className="hidden px-4 py-3 lg:table-cell"><Person p={people[m.owner_id]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </>
  );
}
