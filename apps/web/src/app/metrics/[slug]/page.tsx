import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, KeyRound, Lock, MessageSquare, Sigma, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { getAllSeries, getBreakdowns, getProfiles, getSeriesValues } from "@/lib/data";
import { CompareTable } from "@/components/compare-table";
import { resolverFrom } from "@ziffr/core/compare";
import { SeriesForm } from "./series-form";
import { VersionsDialog } from "@/components/versions-dialog";
import { countryCode } from "@/lib/countries";
import { currentWorkspaceId, viewerId } from "@/lib/viewer";
import { formatValue, health, PERIOD_LABEL, periodLabel, periodStart, POLARITY_LABEL, RULE_LABEL, SOURCE_LABEL, targetText } from "@ziffr/core/format";
import { format } from "date-fns";
import { forecast } from "@/analyses/forecast";
import { rankCorrelations, strength } from "@/analyses/correlation";
import { ANALYSES } from "@/analyses";
import { ScatterView } from "@/views/scatter";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { MetricWorkspace } from "./workspace";
import { PinMenu } from "./pin";
import { ShareDialog } from "@/components/share-dialog";
import { buttonVariants } from "@/components/ui/button";
import { MetricWorkflow } from "@/components/metric-workflow";
import { RequestAccess, WhoCanSee } from "@/components/who-can-see";
import { workingPeriod } from "@ziffr/core/workflow-rules";
import type { PeriodState, Workflow } from "@ziffr/core/types";
import { getGroups, getRawShares, readableActions, visibleDashboards, visibleMetricIds } from "@/lib/access";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/status";

const DAILY_WINDOW = 90;

export default async function MetricPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ vs?: string; created?: string; bp?: string; full?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [{ metrics, observations, series }, people, viewer] = await Promise.all([getAllSeries(), getProfiles(), viewerId()]);
  const metric = metrics.find((m) => m.slug === slug);
  if (!metric) notFound();
  const visible = await visibleMetricIds(viewer, metrics);
  const peopleById = Object.fromEntries(people.map((p) => [p.id, p]));

  const all = series[slug] ?? [];
  const points = metric.period === "day" ? all.slice(-DAILY_WINDOW) : all;
  const fc = forecast(points, metric.period);
  const last = all[all.length - 1];
  const prev = all[all.length - 2];
  const change = last && prev && prev.value !== 0 ? (last.value - prev.value) / Math.abs(prev.value) : null;
  const tone = health(metric, last?.value);
  const improving = change === null || metric.polarity === "target" ? null : (change > 0) === (metric.polarity === "higher");

  const correlations = rankCorrelations(metric, metrics.filter((m) => visible.has(m.id)), series);
  const partner = correlations.find((c) => c.metric.slug === sp.vs) ?? correlations[0];

  if (!visible.has(metric.id)) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm">
        <Lock className="mx-auto mb-2 size-6 text-muted-foreground" />
        <p className="font-medium">{metric.name} isn’t shared with you</p>
        <p className="mt-1 text-muted-foreground">{peopleById[metric.owner_id]?.name} owns it.</p>
        <RequestAccess type="metric" id={metric.id} owner={peopleById[metric.owner_id]?.name.split(" ")[0] ?? "the owner"} />
      </div>
    );
  }
  const [actions, { data: tokens }, dashboards, shares, groups, { data: workflows }, { data: wfRow }] = await Promise.all([
    readableActions(viewer, { metricId: metric.id }),
    db.from("tokens").select("*").eq("metric_id", metric.id),
    visibleDashboards(viewer),
    getRawShares(),
    getGroups(),
    db.from("workflows").select("*").eq("workspace_id", await currentWorkspaceId()).order("id"),
    db.from("metrics").select("workflow_id").eq("id", metric.id).single(),
  ]);
  const wfPeriod = workingPeriod(format(new Date(), "yyyy-MM-dd"), metric.period, periodStart);
  const { data: wfState } = await db.from("period_states").select("*").eq("metric_id", metric.id).eq("period_start", wfPeriod).maybeSingle();
  const markers = [...new Set(actions.map((a) => a.period_start))];
  // Breakdown (GLOSSARY: Breakdown): any uploaded period, the latest by default.
  const bdByPeriod = (await getBreakdowns([metric.id], observations))[metric.id] ?? {};
  const { targets, projections } = await getSeriesValues([metric.id]);
  const tSeries = targets[metric.id] ?? [];
  const pSeries = projections[metric.id] ?? [];
  const bdPeriods = Object.keys(bdByPeriod).sort().reverse();
  const bdPeriod = sp.bp && bdByPeriod[sp.bp] ? sp.bp : bdPeriods[0];
  const bdRows = bdPeriod ? [...bdByPeriod[bdPeriod]].sort((a, b) => b.value - a.value) : [];
  const bdSum = bdRows.reduce((a, r) => a + r.value, 0);
  const bdTotal = all.find((p) => p.period === bdPeriod)?.value ?? null;
  const bdAdds = bdTotal !== null && Math.abs(bdSum - bdTotal) <= Math.abs(bdTotal) * 0.02;
  const obs = observations.filter((o) => o.metric_id === metric.id).slice(-12).reverse();

  return (
    <>
      {sp.created && (
        <div className="mb-4 stock rounded-[var(--radius-card)] p-4 text-sm">
          <span className="font-medium">Metric created.</span> It has no values yet. Its Submitters got a Token and a first Prompt.{" "}
          <Link href="/sources" className="font-medium underline">Go to Sources</Link> to answer it.
        </div>
      )}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {metric.name}
            {metric.formula && <Badge variant="secondary"><Sigma /> Derived</Badge>}
          </span>
        }
        sub={metric.description}
      >
        <Link href={`/analyze?add=${metric.id}`} className={buttonVariants({ variant: "outline" })}><Sparkles /> Analyze</Link>
        <PinMenu metricId={metric.id} dashboards={dashboards.filter((d) => d.role !== "viewer")} />
        <WhoCanSee type="metric" id={metric.id} people={people} />
        <VersionsDialog type="metric" id={metric.id} people={people} />
        {metric.owner_id === viewer && <ShareDialog objectType="metric" objectId={metric.id} name={metric.name} ownerId={metric.owner_id} people={people} shares={shares} groups={groups} />}
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={last ? `Latest, ${periodLabel(last.period, metric.period)}` : "Latest"}>
          <span className={cn(tone === "bad" && "text-destructive")}>{last ? formatValue(metric, last.value) : "–"}</span>
        </Stat>
        <Stat label="Change vs. previous period">
          {change === null ? "–" : (
            <span className={cn("flex items-center gap-1", improving === true && "text-[var(--color-success)]", improving === false && "text-destructive")}>
              {change > 0 ? <ArrowUpRight className="size-5" /> : <ArrowDownRight className="size-5" />}
              {(change * 100).toFixed(1)} %
            </span>
          )}
        </Stat>
        <Stat label={`Target, ${POLARITY_LABEL[metric.polarity].toLowerCase()}`}><span className="fig">{targetText(metric)}</span></Stat>
      </div>

      {points.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center text-sm text-muted-foreground">
          No Observations yet. Values arrive through {metric.sources.map((s) => SOURCE_LABEL[s]).join(" or ")}. <Link href="/sources" className="underline">Open Sources</Link>.
        </div>
      ) : (
        <MetricWorkspace metric={metric} points={points} forecast={fc?.points ?? null} markers={markers} people={people} viewer={viewer} />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="stock rounded-[var(--radius-card)] p-5">
            <h2 className="mb-4 flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primary" /> Analyses</h2>
            <div className="mb-5 flex flex-wrap gap-2">
              {ANALYSES.map((a) => (
                <span key={a.id} title={a.blurb} className={cn("flex items-center gap-1.5 rounded-[var(--radius-input)] border px-2.5 py-1 text-xs", a.available ? "stock font-medium" : "border-dashed text-muted-foreground")}>
                  {!a.available && <Lock aria-hidden className="size-3" />} {a.label}{!a.available && ", coming soon"}
                </span>
              ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">Forecast</h3>
                {fc ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Trend {fc.trendPerPeriod >= 0 ? "+" : ""}{formatValue(metric, fc.trendPerPeriod)} per {metric.period}. Next {fc.points.length} {metric.period}s:{" "}
                    <span className="font-medium text-foreground">{formatValue(metric, fc.points[fc.points.length - 1].value)}</span> expected by {periodLabel(fc.points[fc.points.length - 1].period, metric.period)}
                    {" "}(likely between {formatValue(metric, fc.points[fc.points.length - 1].lo)} and {formatValue(metric, fc.points[fc.points.length - 1].hi)}). Shown dashed on the chart.
                  </p>
                ) : <p className="mt-1 text-sm text-muted-foreground">Needs at least 4 values.</p>}
              </div>
              <div>
                <h3 className="text-sm font-medium">Correlation</h3>
                {partner ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Moves most with <span className="font-medium text-foreground">{partner.metric.name}</span>: {strength(partner.result.r)} (r = {partner.result.r.toFixed(2)}, {partner.result.n} {metric.period}s).
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {correlations.slice(0, 5).map((c) => (
                        <Link key={c.metric.id} href={`?vs=${c.metric.slug}`} scroll={false} className={cn("rounded-md border px-2 py-0.5 text-xs", c.metric.id === partner.metric.id ? "stock" : "hover:bg-muted")}>
                          {c.metric.name} <span className="fig text-muted-foreground">{c.result.r.toFixed(2)}</span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : <p className="mt-1 text-sm text-muted-foreground">No other {PERIOD_LABEL[metric.period].toLowerCase()} metric with enough shared history.</p>}
              </div>
            </div>
            {partner && (
              <div className="mt-4">
                <p className="mb-1 text-xs text-muted-foreground">{partner.metric.name} (x) vs. {metric.name} (y), one dot per {metric.period}</p>
                <ScatterView x={partner.metric} y={metric} pairs={partner.result.pairs.map((p) => ({ period: p.period, x: p.y, y: p.x }))} />
              </div>
            )}
          </section>

          <section className="stock rounded-[var(--radius-card)] p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Comparisons</h2>
              <nav aria-label="Comparison mode" className="flex gap-1 text-xs">
                <Link href="?" scroll={false} aria-current={!sp.full ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2 py-1 no-underline", !sp.full ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>To date</Link>
                <Link href="?full=1" scroll={false} aria-current={sp.full ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2 py-1 no-underline", sp.full ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>Full periods</Link>
              </nav>
            </div>
            <CompareTable metric={metric} resolve={resolverFrom(metrics, series)} targets={tSeries} full={Boolean(sp.full)} />
          </section>

          <section className="stock rounded-[var(--radius-card)] p-5">
            <h2 className="mb-3 font-medium">Targets and projections</h2>
            {tSeries.length + pSeries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No target series or projections yet. The target range applies to every period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-1.5 font-normal">Period</th><th className="pb-1.5 text-right font-normal">Target</th><th className="pb-1.5 text-right font-normal">Projection</th></tr></thead>
                <tbody>
                  {[...new Set([...tSeries, ...pSeries].map((p) => p.period))].sort().reverse().slice(0, 8).map((p) => (
                    <tr key={p} className="border-t border-border">
                      <td className="py-1.5">{periodLabel(p, metric.period)}</td>
                      <td className="fig py-1.5 text-right">{formatValue(metric, tSeries.find((x) => x.period === p)?.value ?? null)}</td>
                      <td className="fig py-1.5 text-right">{formatValue(metric, pSeries.find((x) => x.period === p)?.value ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {metric.owner_id === viewer && !metric.formula && <SeriesForm metricId={metric.id} />}
          </section>

          <section className="stock rounded-[var(--radius-card)] p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Breakdown</h2>
              {bdPeriods.length > 0 && (
                <nav aria-label="Breakdown period" className="flex flex-wrap gap-1">
                  {bdPeriods.slice(0, 6).map((p) => (
                    <Link key={p} href={`?bp=${p}`} scroll={false} aria-current={p === bdPeriod ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2 py-1 text-xs no-underline", p === bdPeriod ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>
                      {periodLabel(p, metric.period, true)}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
            {bdRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No breakdown yet. Paste rows with the next value on the web form, or send one line per row, such as <code className="fig">Germany 61,200</code>.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr><th className="pb-2 font-normal">Row</th><th className="pb-2 text-right font-normal">Value</th>{bdAdds && <th className="pb-2 text-right font-normal">Share</th>}</tr>
                  </thead>
                  <tbody>
                    {bdRows.map((r) => {
                      const code = countryCode(r.label);
                      return (
                        <tr key={r.label} className="border-t border-border">
                          <td className="py-2">
                            <span className="flex items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {code && <img src={`/flags/${code}.svg`} alt="" className="h-3 w-4 rounded-[2px] object-cover" />}
                              {r.label}
                            </span>
                          </td>
                          <td className="fig py-2 text-right">{formatValue(metric, r.value)}</td>
                          {bdAdds && <td className="fig py-2 text-right text-muted-foreground">{((r.value / bdSum) * 100).toFixed(1)} %</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {bdTotal !== null && !bdAdds && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    These rows don’t add up to the total ({formatValue(metric, bdTotal)}); the total stays the metric’s value{metric.format === "percent" ? ", as rates don’t add up" : ""}.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="stock rounded-[var(--radius-card)] p-5">
            <h2 className="mb-3 flex items-center gap-2 font-medium"><MessageSquare className="size-4" /> Actions</h2>
            {actions.length === 0 ? <p className="text-sm text-muted-foreground">No Actions yet. Click a point on the chart to assign one.</p> : (
              <ul className="divide-y">
                {actions.map((a) => (
                  <li key={a.id}>
                    <Link href={`/actions/${a.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-muted/40">
                      <StatusDot status={a.status} />
                      <span className="flex-1">{a.question}{a.breakdown_label && <span className="ml-1.5 text-xs text-muted-foreground">on {a.breakdown_label}</span>}</span>
                      <span className="text-xs text-muted-foreground">{periodLabel(a.period_start, metric.period, true)}</span>
                      <Person p={peopleById[a.assignee_id]} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!metric.formula && (
            <section className="stock rounded-[var(--radius-card)] p-5">
              <h2 className="mb-3 font-medium">Latest observations</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="pb-2 font-normal">Period</th><th className="pb-2 font-normal">Value</th><th className="pb-2 font-normal">Source</th><th className="pb-2 font-normal">Submitter</th></tr>
                </thead>
                <tbody>
                  {obs.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="py-2">{periodLabel(o.period_start, metric.period)}</td>
                      <td className="py-2 font-medium">
                        <span className="fig font-normal">{formatValue(metric, o.value)}</span>
                        {o.original_value !== null && <span className="ml-2 text-xs font-normal text-muted-foreground line-through">{formatValue(metric, o.original_value)}</span>}
                        {o.original_value !== null && <Badge variant="outline" className="ml-2">Corrected</Badge>}
                      </td>
                      <td className="py-2 text-muted-foreground">{SOURCE_LABEL[o.source as keyof typeof SOURCE_LABEL] ?? o.source}</td>
                      <td className="py-2"><Person p={o.submitter_id ? peopleById[o.submitter_id] : undefined} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="stock rounded-[var(--radius-card)] p-5 text-sm">
            <h2 className="mb-3 font-medium">Metric description</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <Row k="Owner"><Person p={peopleById[metric.owner_id]} /></Row>
              <Row k="Period">{PERIOD_LABEL[metric.period]}</Row>
              <Row k="Format">{metric.format}{metric.unit && metric.format === "number" ? ` (${metric.unit})` : ""}, {metric.decimals} decimals</Row>
              <Row k="Polarity">{POLARITY_LABEL[metric.polarity]}</Row>
              <Row k="Target">{targetText(metric)}</Row>
              {metric.formula ? (
                <Row k="Formula"><code className="rounded bg-muted px-1 py-0.5 text-xs">{metric.formula.replace(/\{([a-z-]+)\}/g, (_, s) => metrics.find((m) => m.slug === s)?.name ?? s)}</code></Row>
              ) : (
                <>
                  <Row k="Sources">{metric.sources.map((s) => SOURCE_LABEL[s]).join(", ") || "None"}</Row>
                  <Row k="Rule">{RULE_LABEL[metric.submission_rule]}</Row>
                </>
              )}
            </dl>
          </section>
          {!metric.formula && (
            <MetricWorkflow metric={metric} workflowId={wfRow?.workflow_id ?? null} workflows={(workflows ?? []) as Workflow[]} period={wfPeriod} state={(wfState as PeriodState | null) ?? null} tokens={(tokens ?? []).filter((t) => !t.stands_in_for)} people={people} isOwner={metric.owner_id === viewer} />
          )}
          {!metric.formula && (
            <section className="stock rounded-[var(--radius-card)] p-5 text-sm">
              <h2 className="mb-1 flex items-center gap-2 font-medium"><KeyRound className="size-4" /> Tokens</h2>
              <p className="mb-3 text-xs text-muted-foreground">Who may submit values. Usually invisible: implied by the sender’s Slack handle or mail address.</p>
              <ul className="space-y-2">
                {(tokens ?? []).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <Person p={peopleById[t.submitter_id]} />
                    {metric.sources.includes("web_form") ? (
                      <Link href={`/submit/${t.code}`} className="text-xs underline">Open form</Link>
                    ) : <code className="fig text-xs text-muted-foreground">{t.code}</code>}
                  </li>
                ))}
                {!tokens?.length && <li className="text-muted-foreground">No Submitters yet.</li>}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stock rounded-[var(--radius-card)] p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{children}</div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{children}</dd>
    </>
  );
}
