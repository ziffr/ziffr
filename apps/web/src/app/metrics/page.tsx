import Link from "next/link";
import { ClipboardPaste, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Sparkline } from "@/views/sparkline";
import { getAllSeries, getNumberStyle, getProfileMap, getYearStart } from "@/lib/data";
import { visibleMetricIds } from "@/lib/access";
import { currentActor, viewerId } from "@/lib/viewer";
import { can } from "@ziffr/core/actor";
import { formatValue, health, SOURCE_LABEL, targetText } from "@ziffr/core/format";
import { Change, COLOUR_LEGEND, TargetChip } from "@/components/target-chip";
import { PERIOD_LABEL, periodLabel } from "@ziffr/core/periods";
import { inUse, isArchived } from "@ziffr/core/metric-row";
import { cn } from "@/lib/utils";
import { QuickLookButton } from "@/components/metric-quick-look";
import { TagChips } from "@/components/tag-chips";
import { metricIdsWithTags, tagSight } from "@ziffr/core/tag-sight";
import { tagFilterHref, tagsFromParam } from "@/lib/tag-filter";

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ show?: string; tag?: string | string[] }> }) {
  // The list shows the latest value, the change and a trend line of 30 periods: only those are read.
  const [{ metrics: all, series }, people, viewer, yearStart, numberStyle, sp, actor] = await Promise.all([getAllSeries({ points: 30 }), getProfileMap(), viewerId(), getYearStart(), getNumberStyle(), searchParams, currentActor()]);
  // One source for who may start things: the core's `can`. A Guest sees no button that would be refused.
  const creates = can(actor, "create");
  const visible = await visibleMetricIds(viewer, all);
  const seen = all.filter((m) => visible.has(m.id));
  // Archived Metrics (GLOSSARY: Archived Metric) are listed only under their own filter.
  const showArchived = sp.show === "archived";
  const archivedCount = seen.filter(isArchived).length;
  const byView = showArchived ? seen.filter(isArchived) : inUse(seen);
  // The Tag filter (GLOSSARY: Tag): Metrics that carry all the picked Tags; the Tags offered and their counts are only those of
  // Metrics this person may see, so a word never shows what is out of their sight. A word that is none of them matches nothing.
  const picked = tagsFromParam(sp.tag);
  const sight = await tagSight(actor);
  const tagged = picked.length ? new Set(await metricIdsWithTags(actor, picked)) : null;
  const metrics = tagged ? byView.filter((m) => tagged.has(m.id)) : byView;
  const pickedKeys = new Set(picked.map((t) => t.toLowerCase()));
  // A Tag's count is what this view lists: Archived Metrics count under Archived only.
  const offered = sight.tags.map((t) => ({ name: t.name, n: showArchived ? t.archived : t.metrics - t.archived })).filter((t) => t.n > 0 || pickedKeys.has(t.name.toLowerCase()));
  const toggled = (name: string) => (pickedKeys.has(name.toLowerCase()) ? picked.filter((p) => p.toLowerCase() !== name.toLowerCase()) : [...picked, name]);
  const filter = (archived: boolean) => cn("inline-flex min-h-11 items-center rounded-[var(--radius-input)] px-3 no-underline sm:min-h-0 sm:px-2.5 sm:py-1", archived === showArchived ? "stock font-medium" : "text-muted-foreground hover:bg-muted");
  return (
    <>
      <PageHeader title="Metrics" sub="Each metric is described once. Its values then arrive by chat, mail, a form link or the API.">
        {creates && (
          <Link href="/paste-values" className={buttonVariants({ variant: "outline" })}>
            <ClipboardPaste aria-hidden /> Paste values
          </Link>
        )}
        {creates && (
          <Link href="/metrics/new" className={buttonVariants()}>
            <Plus aria-hidden /> New metric
          </Link>
        )}
      </PageHeader>

      {(archivedCount > 0 || showArchived) && (
        <nav aria-label="Which Metrics" className="mb-3 flex flex-wrap gap-1 text-sm">
          <Link href={tagFilterHref(picked)} aria-current={!showArchived ? "true" : undefined} className={filter(false)}>In use</Link>
          <Link href={tagFilterHref(picked, true)} aria-current={showArchived ? "true" : undefined} className={filter(true)}>Archived ({archivedCount})</Link>
        </nav>
      )}

      {offered.length > 0 && (
        <nav aria-label="Tags" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          <span className="mr-1 text-xs text-muted-foreground">Tag</span>
          {offered.map((t) => {
            const on = pickedKeys.has(t.name.toLowerCase());
            return (
              <Link key={t.name} href={tagFilterHref(toggled(t.name), showArchived)} aria-current={on ? "true" : undefined} className={cn("rounded-full border px-2.5 py-0.5 text-xs no-underline", on ? "stock border-[var(--color-ink-2)] font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
                {t.name} <span className="fig">{t.n}</span>
              </Link>
            );
          })}
          {picked.length > 0 && <Link href={tagFilterHref([], showArchived)} className="ml-1 text-xs text-muted-foreground underline">Clear</Link>}
        </nav>
      )}

      {picked.length > 0 && metrics.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center text-sm text-muted-foreground">No Metric carries {picked.length > 1 ? "all of these Tags" : "this Tag"}. <Link href={tagFilterHref([], showArchived)} className="underline">Show all Metrics</Link></p>
      ) : showArchived && metrics.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center text-sm text-muted-foreground">No Archived Metrics. Archiving a Metric keeps its values and history and stops asking for it.</p>
      ) : metrics.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center">
          <p className="font-medium">{creates ? "No metrics yet" : "Nothing has been shared with you yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{creates ? "Describe your first one, or ask a colleague to share theirs." : "Ask whoever invited you."}</p>
          {creates && <Link href="/metrics/new" className={buttonVariants({ className: "mt-4" })}>New metric</Link>}
        </div>
      ) : (
        <>
        <p className="mb-2 text-xs text-muted-foreground">{COLOUR_LEGEND}</p>
        <div className="stock overflow-x-auto rounded-[var(--radius-card)]">
          <table className="w-full text-sm max-sm:block">
            <caption className="sr-only">Metrics with their latest value, change, trend, target and owner</caption>
            <thead className="max-sm:sr-only">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">Metric</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Latest</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Change</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Trend</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Target</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Owner</th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {metrics.map((m) => {
                const pts = series[m.slug] ?? [];
                const last = pts[pts.length - 1];
                const prev = pts[pts.length - 2];
                const tone = health(m, last?.value);
                const change = last && prev && prev.value ? (last.value - prev.value) / Math.abs(prev.value) : null;
                return (
                  <tr key={m.id} className="group relative cursor-pointer border-b border-border last:border-0 hover:bg-[var(--color-paper-2)] max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-5 max-sm:px-4 max-sm:py-3">
                    <td className="px-4 py-3 max-sm:w-full max-sm:p-0">
                      <Link href={`/metrics/${m.slug}`} className="font-medium no-underline after:absolute after:inset-0 group-hover:underline">
                        {m.name}
                      </Link>
                      <QuickLookButton slug={m.slug} name={m.name} />
                      <div className="mt-0.5 text-xs text-muted-foreground max-sm:text-sm">
                        {PERIOD_LABEL[m.period]}, {m.formula ? "derived from other metrics" : `via ${m.sources.map((s) => SOURCE_LABEL[s]).join(" or ")}`}
                      </div>
                      <div className="fig mt-0.5 text-sm text-[var(--color-ink-2)] sm:hidden">Target {targetText(m, numberStyle)}</div>
                      <TagChips names={sight.namesByMetric.get(m.id) ?? []} className="mt-1" />
                    </td>
                    <td className="px-4 py-3 text-right max-sm:mt-2 max-sm:min-w-0 max-sm:p-0 max-sm:text-left">
                      <div className="fig whitespace-nowrap max-sm:text-base max-sm:font-medium">{last ? formatValue(m, last.value, numberStyle) : "–"}</div>
                      <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-xs text-muted-foreground max-sm:justify-start max-sm:text-sm">
                        <TargetChip numberStyle={numberStyle} metric={m} value={last?.value} />
                        <span className="whitespace-nowrap">{last ? periodLabel(last.period, m.period, yearStart, true) : "No values yet"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--color-ink-2)] max-sm:mt-2 max-sm:p-0"><Change numberStyle={numberStyle} pct={change} /></td>
                    <td className="hidden w-32 px-4 py-3 md:table-cell">{pts.length > 1 && <Sparkline points={pts.slice(-30)} height={28} tone={tone} />}</td>
                    <td className="fig hidden whitespace-nowrap px-4 py-3 text-xs text-[var(--color-ink-2)] sm:table-cell">{targetText(m, numberStyle)}</td>
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
