// A Metric's page (GLOSSARY: Metric, Comparison, Target Series, Observation, Action, Workflow): its numbers first,
// then one tab each for analyses, targets, history and how values arrive, instead of one long scroll.
import { approvalQuestionForWeb } from "@ziffr/core/approval-question";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, Lock, MessageSquare, Sigma, Sparkles } from "lucide-react";
import { getAllSeries, getAttainmentMethod, getBreakdowns, getLastValues, getNumberStyle, getProfiles, getSeriesValues, getYearStart } from "@/lib/data";
import { ATTAINMENT_METHOD_LABEL, methodFor } from "@ziffr/core/attainment-method";
import { CompareTable } from "@/components/compare-table";
import { resolverFrom } from "@ziffr/core/compare";
import { inputsProblem } from "@ziffr/core/formula";
import { TargetsEditor } from "./series-form";
import { ArchivedNote } from "./archived-note";
import { RetentionBox } from "./retention-box";
import { canArchiveMetric } from "@ziffr/core/archived-metrics";
import { canEditMetric } from "@ziffr/core/metrics";
import { firstAsksFor } from "@ziffr/core/first-asks";
import { SourcesEditor } from "./sources-editor";
import { EditDetails } from "./edit-details";
import { countryCode } from "@/lib/countries";
import { currentActor, viewerId } from "@/lib/viewer";
import { metricExtras } from "@ziffr/core/page-data";
import { pastedValueIds } from "@ziffr/core/paste-values";
import { ValueMarks } from "./value-marks";
import { can } from "@ziffr/core/actor";
import { submittingKeyNames } from "@ziffr/core/access-keys";
import { feedChoices, feedNames } from "@ziffr/core/feeds";
import { FeedPicker, RemoveFeed } from "./feed-picker";
import { formatNumber, formatPercent, formatValue, POLARITY_LABEL, RULE_LABEL, SOURCE_LABEL, targetText } from "@ziffr/core/format";
import { FORECAST_MIN_POINTS, forecast } from "@ziffr/core/forecast";
import { comparedBy, periodCountLabel, periodWord, rankCorrelations, strength } from "@ziffr/core/correlation";
import { ANALYSES } from "@/analyses";
import { ScatterView } from "@/views/scatter";
import { PageHeader } from "@/components/page-header";
import { Person } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { MetricWorkspace } from "./workspace";
import { MetricToolbar } from "./metric-toolbar";
import { recordingOffer } from "@ziffr/core/record-own-value";
import { canAskNow } from "@ziffr/core/ask-now";
import { MetricWorkflow } from "@/components/metric-workflow";
import { alertMeData } from "./alert-me";
import { RequestAccess } from "@/components/who-can-see";
import type { PeriodState, Workflow } from "@ziffr/core/types";
import { getGroups, getRawShares, readableActions, visibleDashboards, visibleMetricIds } from "@/lib/access";
import { isDemo } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/status";
import { Change, TargetChip } from "@/components/target-chip";
import { PERIOD_LABEL, periodLabel } from "@ziffr/core/periods";
import { moneyUnit } from "@ziffr/core/units";
import { workspaceProfile } from "@ziffr/core/workspace-settings";
import { NotApprovedMark } from "@/views/approval-mark";
import { countView } from "@/lib/count-view";
import { periodRecordUrl } from "@/lib/period-record-url";

const DAILY_WINDOW = 90;
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "analysis", label: "Analysis" },
  { id: "targets", label: "Targets" },
  { id: "history", label: "History" },
  { id: "settings", label: "Description" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** The Breakdown the page shows: the period asked for in `bp` if it has one, else the latest, and whether its rows add up. */
function breakdownShown<R extends { value: number }>(byPeriod: Record<string, R[]>, bp: string | undefined, all: { period: string; value: number }[]) {
  const bdPeriods = Object.keys(byPeriod).sort();
  const bdPeriod = bp && byPeriod[bp] ? bp : bdPeriods[bdPeriods.length - 1];
  const bdRows = bdPeriod ? [...byPeriod[bdPeriod]].sort((a, b) => b.value - a.value) : [];
  const bdSum = bdRows.reduce((a, r) => a + r.value, 0);
  const bdTotal = all.find((p) => p.period === bdPeriod)?.value ?? null;
  // Rows that add up to nothing have no shares: 0 of 0 would show as "NaN %".
  const bdAdds = bdTotal !== null && bdSum !== 0 && Math.abs(bdSum - bdTotal) <= Math.abs(bdTotal) * 0.02;
  return { bdPeriods, bdPeriod, bdRows, bdSum, bdTotal, bdAdds };
}

/** One metric: its latest value, chart and comparisons, and tabs for analyses, targets, history and settings. */
/** The sentence under a just-created Metric: only for its owner and Editors, and only right after creating it. */
const createdNoteFor = (created: string | undefined, canEdit: boolean, actor: Parameters<typeof firstAsksFor>[0], id: number) => (created && canEdit ? firstAsksFor(actor, id) : Promise.resolve(null));

export default async function MetricPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ vs?: string; created?: string; bp?: string; full?: string; tab?: string; suggest?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "overview";
  // Links inside a tab keep the tab; everything else about the page is in its own parameter.
  const at = (extra: Record<string, string> = {}) => `?${new URLSearchParams({ ...(tab === "overview" ? {} : { tab }), ...extra })}`;
  const [{ metrics, series }, people, viewer, demo, yearStart, numberStyle, attainmentMethod] = await Promise.all([getAllSeries(), getProfiles(), viewerId(), isDemo(), getYearStart(), getNumberStyle(), getAttainmentMethod()]);
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

  // Metrics of every period, each on its common period with this one (spec 0019); those kept to their own period say why.
  const { ranked: correlations, leftOut } = rankCorrelations(metric, metrics.filter((m) => visible.has(m.id)), resolverFrom(metrics, series), { yearStart });
  const notCombined = [...new Set(leftOut.filter((l) => l.why === "not-combined").map((l) => l.reason))];
  const partner = correlations.find((c) => c.metric.slug === sp.vs) ?? correlations[0];

  if (!visible.has(metric.id)) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm">
        <Lock className="mx-auto mb-2 size-6 text-muted-foreground" />
        <p className="font-medium">{metric.name} isn’t shared with you</p>
        <p className="mt-1 text-muted-foreground">{peopleById[metric.owner_id] ? `${peopleById[metric.owner_id].name} owns it.` : "Its owner can share it with you."}</p>
        <RequestAccess type="metric" id={metric.id} owner={peopleById[metric.owner_id]?.name.split(" ")[0] ?? "the owner"} />
      </div>
    );
  }
  const actor = await currentActor();
  // Only a Metric this person sees is counted (the refusal above returns first); a number, never a person.
  void countView(actor, { kind: "metric", id: metric.id });
  const [actions, extras, dashboards, shares, groups, keyNames, choices, askable, profile, archivable, record, alertMe] = await Promise.all([
    readableActions(viewer, { metricId: metric.id }),
    metricExtras(actor, metric.id, metric.period),
    visibleDashboards(viewer),
    getRawShares(),
    getGroups(),
    // Which program sent a value: the names of the Access Keys behind this Metric's values (spec 0002).
    submittingKeyNames(actor, metric.id),
    feedChoices(actor),
    // Ask me now is for the owner who also submits it (spec 0021).
    canAskNow(actor, metric.id),
    // Its currency is the unit Edit details proposes when the Metric becomes a money one (spec 0022).
    workspaceProfile(actor),
    // Owners, Admins and its owner archive it and bring it back (GLOSSARY: Archived Metric).
    canArchiveMetric(actor, metric.id),
    // Record a value is for someone who submits the Metric; the offer is null for everyone else (ticket #521).
    recordingOffer(actor, metric.id),
    alertMeData({ id: metric.id, name: metric.name }, demo),
  ]);
  const { tokens, workflows, workflowId, state: wfState, period: wfPeriod, pending } = extras;
  const markers = [...new Set(actions.map((a) => a.period_start))];
  // Breakdown (GLOSSARY: Breakdown): any uploaded period, the latest by default.
  const bdByPeriod = (await getBreakdowns([metric.id]))[metric.id] ?? {};
  const { targets, projections } = await getSeriesValues([metric.id]);
  const tSeries = targets[metric.id] ?? [];
  const pSeries = projections[metric.id] ?? [];
  const { bdPeriods, bdPeriod, bdRows, bdSum, bdTotal, bdAdds } = breakdownShown(bdByPeriod, sp.bp, all);
  // Tables on this page read like the chart: oldest on top, newest at the bottom. Which were pasted shows in History (spec 0026).
  const obs = (await getLastValues(metric.id, 12)).reverse(), pasted = new Set(await pastedValueIds(actor, metric.id, obs.map((o) => o.id)));
  // Feeds are Submitters but nobody's colleague: the names of only those this page shows, as its Submitters or as
  // the senders of its values, so both say where a value came from.
  const feeds = await feedNames(actor, [...tokens.map((t) => t.submitter_id), ...obs.map((o) => o.submitter_id ?? "")]);
  for (const [id, name] of Object.entries(feeds)) peopleById[id] ??= { id, name, role: "Feed", color: "#64748b", email: "", slack_handle: "" };
  const isOwner = metric.owner_id === viewer;
  // Its owner and its Editors change targets, description and Sources; deleting and sharing stay the owner's.
  const canEdit = isOwner || (await canEditMetric(actor, metric.id));
  // Which target counts for the latest period: its own Target Series value if there is one, else the Target Range.
  const periodTarget = last ? tSeries.find((t) => t.period === last.period) : undefined;
  // Says nothing of the inputs but that their periods differ: it may be read by someone who cannot see them.
  const derivedProblem = inputsProblem(metric, metrics);

  // What the first requests really did, read from the Outbox's own records (only for its owner and Editors).
  const createdNote = await createdNoteFor(sp.created, canEdit, actor, metric.id);

  return (
    <>
      {sp.created && (
        <div className="mb-4 stock rounded-[var(--radius-card)] p-4 text-sm">
          <span className="font-medium">Metric created.</span> It has no values yet. {createdNote}
          {demo && <>{" "}<Link href="/sources" className="font-medium underline">Go to Sources</Link> to answer it.</>}
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
        {/* Record a value is the one main button, for someone who submits the Metric; Share is the owner's; the rest is in the ⋯ menu. */}
        <MetricToolbar
          id={metric.id} people={people} metric={{ id: metric.id, name: metric.name, slug: metric.slug }} record={record} askable={askable}
          share={isOwner ? { name: metric.name, ownerId: metric.owner_id, shares, groups } : null} alert={alertMe ? { mine: alertMe.mine, choices: alertMe.choices } : null}
          canDuplicate={can(actor, "create") && !metric.formula} dashboards={dashboards.filter((d) => d.role !== "viewer").map((d) => ({ id: d.id, name: d.name }))}
          archive={{ allowed: archivable && !demo, archived: Boolean(metric.archived_at) }} canDelete={isOwner && !demo}
        />
      </PageHeader>
      <ArchivedNote archivedAt={metric.archived_at ?? null} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={last ? `Latest, ${periodLabel(last.period, metric.period, yearStart)}` : "Latest"}>
          <span className="flex flex-wrap items-center gap-2">{last ? formatValue(metric, last.value, numberStyle) : "–"}{last && pending.includes(last.period) && <NotApprovedMark />}<TargetChip numberStyle={numberStyle} metric={periodTarget && metric.polarity !== "target" ? { ...metric, target_min: metric.polarity === "lower" ? null : periodTarget.value, target_max: metric.polarity === "lower" ? periodTarget.value : null } : metric} value={last?.value} /></span>
        </Stat>
        <Stat label="Change vs. previous period">
          <Change numberStyle={numberStyle} pct={change} size="size-5" />
        </Stat>
        <Stat label={`Target, ${POLARITY_LABEL[metric.polarity].toLowerCase()}`} note={periodTarget ? `From the target series for ${periodLabel(periodTarget.period, metric.period, yearStart)}. Other periods without one use ${targetText(metric, numberStyle).toLowerCase()}.` : tSeries.length ? "The target range; periods in the target series use their own target." : undefined}>
          <span className="fig">{periodTarget ? formatValue(metric, periodTarget.value, numberStyle) : targetText(metric, numberStyle)}</span>
        </Stat>
      </div>

      <nav aria-label="Metric sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link key={t.id} href={t.id === "overview" ? "?" : `?tab=${t.id}`} scroll={false} aria-current={tab === t.id ? "page" : undefined} className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm no-underline", tab === t.id ? "border-[var(--color-ink)] font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-6">
          {/* A Derived Metric whose inputs cannot be combined says why, instead of an empty chart (spec 0022). */}
          {derivedProblem ? (
            <div role="status" className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center text-sm text-muted-foreground">{derivedProblem}</div>
          ) : points.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center text-sm text-muted-foreground">
              No values yet. They arrive by {metric.sources.map((s) => SOURCE_LABEL[s]).join(" or ")}. <Link href="?tab=settings" className="underline">See who submits</Link>.
            </div>
          ) : (
            <MetricWorkspace numberStyle={numberStyle} metric={metric} points={points} forecast={fc?.points ?? null} forecastNote={!fc && points.length > 0 ? `Forecast once there are ${FORECAST_MIN_POINTS} ${metric.period}s of values` : null} markers={markers} people={people} viewer={viewer} yearStart={yearStart} />
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="stock rounded-[var(--radius-card)] p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">Comparisons</h2>
                <nav aria-label="Comparison mode" className="flex gap-1 text-xs">
                  <Link href={at()} scroll={false} aria-current={!sp.full ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2 py-1 no-underline", !sp.full ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>To date</Link>
                  <Link href={at({ full: "1" })} scroll={false} aria-current={sp.full ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2 py-1 no-underline", sp.full ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>Full periods</Link>
                </nav>
              </div>
              <CompareTable numberStyle={numberStyle} attainmentMethod={attainmentMethod} metric={metric} resolve={resolverFrom(metrics, series)} targets={tSeries} full={Boolean(sp.full)} yearStart={yearStart} />
            </section>

            <section className="stock rounded-[var(--radius-card)] p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">Breakdown</h2>
                {bdPeriods.length > 0 && (
                  <nav aria-label="Breakdown period" className="flex flex-wrap gap-1">
                    {bdPeriods.slice(-6).map((p) => (
                      <Link key={p} href={at({ bp: p })} scroll={false} aria-current={p === bdPeriod ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2 py-1 text-xs no-underline", p === bdPeriod ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>
                        {periodLabel(p, metric.period, yearStart, true)}
                      </Link>
                    ))}
                  </nav>
                )}
              </div>
              {bdRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No breakdown yet. Add rows with the next value on the form, or send one line per row, such as <code className="fig">Germany {formatNumber(61200, 0, numberStyle)}</code>.</p>
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
                            <td className="fig py-2 text-right">{formatValue(metric, r.value, numberStyle)}</td>
                            {bdAdds && <td className="fig py-2 text-right text-muted-foreground">{formatPercent((r.value / bdSum) * 100, numberStyle)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {bdTotal !== null && !bdAdds && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      These rows don’t add up to the total ({formatValue(metric, bdTotal, numberStyle)}); the total stays the metric’s value{metric.format === "percent" ? ", as rates don’t add up" : ""}.
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === "analysis" && (
        <section className="stock rounded-[var(--radius-card)] p-5">
          <h2 className="mb-4 flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primary" /> Analyses</h2>
          <div className="mb-5 flex flex-wrap gap-2">
            {/* Analyses still to come are a preview for demo visitors only. */}
            {ANALYSES.filter((a) => a.available || demo).map((a) => (
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
                  Trend {fc.trendPerPeriod >= 0 ? "+" : ""}{formatValue(metric, fc.trendPerPeriod, numberStyle)} per {metric.period}. Next {fc.points.length === 1 ? metric.period : `${fc.points.length} ${metric.period}s`}:{" "}
                  <span className="font-medium text-foreground">{formatValue(metric, fc.points[fc.points.length - 1].value, numberStyle)}</span> expected by {periodLabel(fc.points[fc.points.length - 1].period, metric.period, yearStart)}
                  {" "}(likely between {formatValue(metric, fc.points[fc.points.length - 1].lo, numberStyle)} and {formatValue(metric, fc.points[fc.points.length - 1].hi, numberStyle)}). Shown dashed on the chart.
                </p>
              ) : <p className="mt-1 text-sm text-muted-foreground">Needs at least {FORECAST_MIN_POINTS} values{points.length ? `; ${points.length} so far` : ""}.{metric.period === "year" ? ` A yearly Metric has one after ${FORECAST_MIN_POINTS} years.` : ""}</p>}
            </div>
            <div>
              <h3 className="text-sm font-medium">Correlation</h3>
              {partner ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Moves most with <span className="font-medium text-foreground">{partner.metric.name}</span>: {strength(partner.result.r)} (r = {formatNumber(partner.result.r, 2, numberStyle)}{partner.result.combined ? "" : `, ${periodCountLabel(partner.result.period, partner.result.n)}`}).{comparedBy(partner.result) && <> {comparedBy(partner.result)}.</>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {correlations.slice(0, 5).map((c) => (
                      <Link key={c.metric.id} href={at({ vs: c.metric.slug })} scroll={false} className={cn("rounded-md border px-2 py-0.5 text-xs", c.metric.id === partner.metric.id ? "stock" : "hover:bg-muted")}>
                        {c.metric.name} <span className="fig text-muted-foreground">{formatNumber(c.result.r, 2, numberStyle)}</span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : <p className="mt-1 text-sm text-muted-foreground">No other metric with enough shared history.</p>}
              {notCombined.map((r) => <p key={r} className="mt-1 text-xs text-muted-foreground">{r}</p>)}
            </div>
          </div>
          {partner && (
            <div className="mt-4">
              <p className="mb-1 text-xs text-muted-foreground">{partner.metric.name} (x) vs. {metric.name} (y), one dot per {periodWord(partner.result.period)}</p>
              <ScatterView numberStyle={numberStyle} x={partner.metric} y={metric} pairs={partner.result.pairs.map((p) => ({ period: p.period, x: p.y, y: p.x }))} yearStart={yearStart} />
            </div>
          )}
        </section>
      )}

      {tab === "targets" && (
        <section className="stock max-w-2xl rounded-[var(--radius-card)] p-5">
          <h2 className="font-medium">Targets and projections</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            The target range ({targetText(metric, numberStyle).toLowerCase()}, {POLARITY_LABEL[metric.polarity].toLowerCase()}) applies to every period. A period with its own target here, such as a monthly budget, uses that one instead. Projections are values expected for future periods; they never count as real values.
          </p>
          {metric.formula ? <p className="text-sm text-muted-foreground">A derived metric takes its targets from its formula&rsquo;s metrics.</p> : (
            <TargetsEditor metric={metric} targets={tSeries} projections={pSeries} canEdit={canEdit} yearStart={yearStart} numberStyle={numberStyle} />
          )}
          {!canEdit && !metric.formula && <p className="mt-3 text-xs text-muted-foreground">Only {peopleById[metric.owner_id]?.name ?? "the owner"} and people it is shared with as Editor change them.</p>}
        </section>
      )}

      {tab === "history" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {!metric.formula && (
            <section className="stock rounded-[var(--radius-card)] p-5">
              {/* Paste history is offered to whoever submits for the Metric on the web form; the core checks again when they paste. */}
              <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="font-medium">Latest values</h2>{metric.sources.includes("web_form") && tokens.some((t) => t.submitter_id === actor.personId) && <Link href={`/paste-values?metric=${encodeURIComponent(metric.slug)}`} className="text-sm">Paste history</Link>}</div>
              {obs.length === 0 ? <p className="text-sm text-muted-foreground">No values yet.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr><th className="pb-2 font-normal">Period</th><th className="pb-2 text-right font-normal">Value</th><th className="pb-2 pl-3 font-normal">From</th><th className="pb-2 font-normal">Submitted by</th></tr>
                  </thead>
                  <tbody>
                    {obs.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="py-2"><Link href={periodRecordUrl(metric.slug, o.period_start)} className="hover:underline">{periodLabel(o.period_start, metric.period, yearStart)}</Link>{pending.includes(o.period_start) && <> <NotApprovedMark short /></>}</td>
                        <td className="py-2 text-right">
                          <span className="fig">{formatValue(metric, o.value, numberStyle)}</span>
                          {o.original_value !== null && <span className="block text-xs text-muted-foreground"><span className="line-through">{formatValue(metric, o.original_value, numberStyle)}</span> corrected</span>}
                          <ValueMarks pastedBy={pasted.has(o.id) ? (peopleById[o.submitter_id ?? ""]?.name ?? "someone") : null} imported={Boolean(o.imported)} />
                        </td>
                        <td className="py-2 pl-3 text-muted-foreground">{SOURCE_LABEL[o.source as keyof typeof SOURCE_LABEL] ?? o.source}{o.access_key_id && keyNames[o.access_key_id] ? ` · ${keyNames[o.access_key_id]}` : null}</td>
                        <td className="py-2"><Person p={o.submitter_id ? peopleById[o.submitter_id] : undefined} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
          <section className="stock rounded-[var(--radius-card)] p-5">
            <h2 className="mb-3 flex items-center gap-2 font-medium"><MessageSquare className="size-4" /> Questions and tasks</h2>
            {actions.length === 0 ? <p className="text-sm text-muted-foreground">None yet. Click a point on the chart in Overview to ask about it.</p> : (
              <ul className="divide-y">
                {[...actions].sort((a, b) => a.period_start.localeCompare(b.period_start)).map((a) => (
                  <li key={a.id}>
                    <Link href={`/actions/${a.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-muted/40">
                      <StatusDot status={a.status} />
                      <span className="flex-1">{approvalQuestionForWeb(a.question)}{a.breakdown_label && <span className="ml-1.5 text-xs text-muted-foreground">on {a.breakdown_label}</span>}</span>
                      <span className="text-xs text-muted-foreground">{periodLabel(a.period_start, metric.period, yearStart, true)}</span>
                      <Person p={peopleById[a.assignee_id]} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "settings" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="stock rounded-[var(--radius-card)] p-5 text-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-medium">Description</h2>
              {canEdit && <EditDetails metric={metric} money={moneyUnit(profile.currency)} numberStyle={numberStyle} attainmentMethod={attainmentMethod} fixed={obs.length > 0 ? "values" : tSeries.length + pSeries.length > 0 ? "series" : null} />}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <Row k="Owner"><Person p={peopleById[metric.owner_id]} /></Row>
              <Row k="Period">{PERIOD_LABEL[metric.period]}</Row>
              <Row k="Format">{metric.format}{metric.unit && metric.format === "number" ? ` (${metric.unit})` : ""}, {metric.decimals} decimals</Row>
              <Row k="Which way is good">{POLARITY_LABEL[metric.polarity]}</Row>
              <Row k="Target">{targetText(metric, numberStyle)}</Row>
              <Row k="Attainment">{ATTAINMENT_METHOD_LABEL[methodFor(metric, attainmentMethod)]}{metric.attainment_method ? "" : ", as the workspace"}</Row>
              {metric.formula ? (
                <Row k="Formula"><code className="rounded bg-muted px-1 py-0.5 text-xs">{metric.formula.replace(/\{([a-z-]+)\}/g, (_, s) => metrics.find((m) => m.slug === s)?.name ?? s)}</code></Row>
              ) : (
                <>
                  <Row k="Values arrive by">{canEdit ? <SourcesEditor metricId={metric.id} sources={metric.sources} /> : metric.sources.map((s) => SOURCE_LABEL[s]).join(", ") || "None"}</Row>
                  <Row k="A second value">{RULE_LABEL[metric.submission_rule]}</Row>
                </>
              )}
            </dl>
          </section>
          {!metric.formula && <RetentionBox metric={metric} demo={demo} suggest={sp.suggest} />}
          {!metric.formula && <MetricWorkflow metric={metric} yearStart={yearStart} workflowId={workflowId} workflows={workflows as Workflow[]} period={wfPeriod} state={(wfState as PeriodState | null) ?? null} tokens={tokens.filter((t) => !t.stands_in_for && !t.feed).map((t) => ({ submitter_id: t.submitter_id, stand_in_id: t.stand_in_id }))} people={people} isOwner={isOwner} />}
          {!metric.formula && (
            <section className="stock rounded-[var(--radius-card)] p-5 text-sm">
              <h2 className="mb-1 flex items-center gap-2 font-medium"><KeyRound className="size-4" /> Who submits</h2>
              <p className="mb-3 text-xs text-muted-foreground">Who may send values for this metric. Ziffr recognises them by their Slack name or mail address, or by their personal form link.</p>
              <ul className="space-y-2">
                {tokens.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <Person p={peopleById[t.submitter_id]} />
                    {t.feed ? (
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">Feed{canEdit && <RemoveFeed metricId={metric.id} feedId={t.submitter_id} name={peopleById[t.submitter_id]?.name ?? "this Feed"} />}</span>
                    ) : !t.code ? null : metric.sources.includes("web_form") ? (
                      <Link href={`/submit/${t.code}`} className="text-xs underline">Open form link</Link>
                    ) : <code className="fig text-xs text-muted-foreground">{t.code}</code>}
                  </li>
                ))}
                {!tokens.length && <li className="text-muted-foreground">Nobody yet.</li>}
              </ul>
              {canEdit && <FeedPicker metricId={metric.id} choices={choices.filter((c) => !tokens.some((t) => t.submitter_id === c.id))} />}
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="stock rounded-[var(--radius-card)] p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{children}</div>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
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
