import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, KeyRound, Lock, MessageSquare, Sigma, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { getActions, getAllSeries, getProfiles } from "@/lib/data";
import { viewerId } from "@/lib/viewer";
import { formatValue, health, PERIOD_LABEL, periodLabel, POLARITY_LABEL, RULE_LABEL, SOURCE_LABEL, targetText } from "@/lib/format";
import { forecast } from "@/analyses/forecast";
import { rankCorrelations, strength } from "@/analyses/correlation";
import { ANALYSES } from "@/analyses";
import { ScatterView } from "@/views/scatter";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { MetricWorkspace } from "./workspace";
import { PinMenu } from "./pin";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/status";

const DAILY_WINDOW = 90;

export default async function MetricPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ vs?: string; created?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [{ metrics, observations, series }, people, viewer] = await Promise.all([getAllSeries(), getProfiles(), viewerId()]);
  const metric = metrics.find((m) => m.slug === slug);
  if (!metric) notFound();
  const peopleById = Object.fromEntries(people.map((p) => [p.id, p]));

  const all = series[slug] ?? [];
  const points = metric.period === "day" ? all.slice(-DAILY_WINDOW) : all;
  const fc = forecast(points, metric.period);
  const last = all[all.length - 1];
  const prev = all[all.length - 2];
  const change = last && prev && prev.value !== 0 ? (last.value - prev.value) / Math.abs(prev.value) : null;
  const tone = health(metric, last?.value);
  const improving = change === null || metric.polarity === "target" ? null : (change > 0) === (metric.polarity === "higher");

  const correlations = rankCorrelations(metric, metrics, series);
  const partner = correlations.find((c) => c.metric.slug === sp.vs) ?? correlations[0];

  const [actions, { data: tokens }, { data: dashboards }, { data: items }] = await Promise.all([
    getActions({ metricId: metric.id }),
    db.from("tokens").select("*").eq("metric_id", metric.id),
    db.from("dashboards").select("*").order("id"),
    db.from("dashboard_items").select("*").eq("metric_id", metric.id),
  ]);
  const markers = [...new Set(actions.map((a) => a.period_start))];
  const obs = observations.filter((o) => o.metric_id === metric.id).slice(-12).reverse();

  return (
    <>
      {sp.created && (
        <div className="mb-4 rounded-xl border border-chart-2/40 bg-chart-2/10 p-4 text-sm">
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
        <PinMenu metricId={metric.id} dashboards={(dashboards ?? []).map((d) => ({ id: d.id, name: d.name, pinned: !!items?.some((i) => i.dashboard_id === d.id) }))} />
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={last ? `Latest · ${periodLabel(last.period, metric.period)}` : "Latest"}>
          <span className={cn(tone === "bad" && "text-destructive")}>{last ? formatValue(metric, last.value) : "–"}</span>
        </Stat>
        <Stat label="Change vs. previous period">
          {change === null ? "–" : (
            <span className={cn("flex items-center gap-1", improving === true && "text-chart-2", improving === false && "text-destructive")}>
              {change > 0 ? <ArrowUpRight className="size-5" /> : <ArrowDownRight className="size-5" />}
              {(change * 100).toFixed(1)} %
            </span>
          )}
        </Stat>
        <Stat label={`Target · ${POLARITY_LABEL[metric.polarity].toLowerCase()}`}>{targetText(metric)}</Stat>
      </div>

      {points.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
          No Observations yet. Values arrive through {metric.sources.map((s) => SOURCE_LABEL[s]).join(" or ")}. <Link href="/sources" className="underline">Open Sources</Link>.
        </div>
      ) : (
        <MetricWorkspace metric={metric} points={points} forecast={fc?.points ?? null} markers={markers} people={people} viewer={viewer} />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-background p-5">
            <h2 className="mb-4 flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primary" /> Analyses</h2>
            <div className="mb-5 flex flex-wrap gap-2">
              {ANALYSES.map((a) => (
                <span key={a.id} title={a.blurb} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs", a.available ? "border-primary/40 bg-primary/5 font-medium" : "border-dashed text-muted-foreground")}>
                  {!a.available && <Lock className="size-3" />} {a.label} {!a.available && "· coming soon"}
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
                        <Link key={c.metric.id} href={`?vs=${c.metric.slug}`} scroll={false} className={cn("rounded-md border px-2 py-0.5 text-xs", c.metric.id === partner.metric.id ? "border-primary bg-primary/5" : "hover:bg-muted")}>
                          {c.metric.name} <span className="font-mono text-muted-foreground">{c.result.r.toFixed(2)}</span>
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

          <section className="rounded-xl border bg-background p-5">
            <h2 className="mb-3 flex items-center gap-2 font-medium"><MessageSquare className="size-4" /> Actions</h2>
            {actions.length === 0 ? <p className="text-sm text-muted-foreground">No Actions yet. Click a point on the chart to assign one.</p> : (
              <ul className="divide-y">
                {actions.map((a) => (
                  <li key={a.id}>
                    <Link href={`/actions/${a.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-muted/40">
                      <StatusDot status={a.status} />
                      <span className="flex-1">{a.question}</span>
                      <span className="text-xs text-muted-foreground">{periodLabel(a.period_start, metric.period, true)}</span>
                      <Person p={peopleById[a.assignee_id]} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!metric.formula && (
            <section className="rounded-xl border bg-background p-5">
              <h2 className="mb-3 font-medium">Latest Observations</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="pb-2 font-normal">Period</th><th className="pb-2 font-normal">Value</th><th className="pb-2 font-normal">Source</th><th className="pb-2 font-normal">Submitter</th></tr>
                </thead>
                <tbody>
                  {obs.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="py-2">{periodLabel(o.period_start, metric.period)}</td>
                      <td className="py-2 font-medium">
                        {formatValue(metric, o.value)}
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
          <section className="rounded-xl border bg-background p-5 text-sm">
            <h2 className="mb-3 font-medium">Metric Description</h2>
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
            <section className="rounded-xl border bg-background p-5 text-sm">
              <h2 className="mb-1 flex items-center gap-2 font-medium"><KeyRound className="size-4" /> Tokens</h2>
              <p className="mb-3 text-xs text-muted-foreground">Who may submit values. Usually invisible: implied by the sender’s Slack handle or mail address.</p>
              <ul className="space-y-2">
                {(tokens ?? []).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <Person p={peopleById[t.submitter_id]} />
                    {metric.sources.includes("web_form") ? (
                      <Link href={`/submit/${t.code}`} className="font-mono text-xs text-primary underline">form link</Link>
                    ) : <code className="font-mono text-xs text-muted-foreground">{t.code}</code>}
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
    <div className="rounded-xl border bg-background p-4">
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
