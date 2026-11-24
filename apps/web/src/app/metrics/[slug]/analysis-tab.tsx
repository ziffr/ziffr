// The Analysis tab of a Metric's page (GLOSSARY: Metric, Takeaway, Correlation; ticket #988): what Ziffr already knows about this one
// Metric, top to bottom. First the analyses ready for it (the forecast with its chart, then what fits of the usual range, the Target outlook
// and when it changed), then what moves with it (the strongest links to the Metrics the person sees, one chart for the selected link), then
// a way into Choose a method with this Metric on the canvas. The Takeaways are the core's words; this only lays them out.
import Link from "next/link";
import type { ReadyCard } from "@ziffr/core/analysis-picker";
import { stretchingPoints, stretchNote } from "@ziffr/core/chart-stretch";
import { basisLabel, periodWord, type rankCorrelations } from "@ziffr/core/correlation";
import { correlationTakeaway } from "@ziffr/core/takeaways/takeaway";
import { formatNumber } from "@ziffr/core/format";
import type { NumberStyle } from "@ziffr/core/number-style";
import { type YearStart } from "@ziffr/core/periods";
import type { Metric, Point } from "@ziffr/core/types";
import type { ForecastPoint } from "@ziffr/core/forecast";
import { TakeawayView } from "@/components/takeaway-view";
import { ScatterView } from "@/views/scatter";
import { cn } from "@/lib/utils";
import { ReadyCards } from "./ready-cards";

type Ranked = ReturnType<typeof rankCorrelations>["ranked"][number];
type Props = {
  metric: Metric; ready: ReadyCard[]; points: Point[]; forecast: ForecastPoint[] | null; numberStyle: NumberStyle; yearStart: YearStart;
  correlations: Ranked[]; partner: Ranked | undefined; notCombined: string[]; byValue: boolean; at: (extra: Record<string, string>) => string; keepBasis: Record<string, string>;
};

/** The Analysis tab. */
export function AnalysisTab({ metric, ready, points, forecast, numberStyle, yearStart, correlations, partner, notCombined, byValue, at, keepBasis }: Props) {
  const ctx = { style: numberStyle, yearStart };
  // The points of the chart of the selected link: all are kept, and a few far from the rest are named under it in words.
  const scatter = partner ? partner.result.pairs.map((p) => ({ period: p.period, x: p.y, y: p.x })) : [];
  const stretch = partner ? stretchNote(stretchingPoints(scatter), periodWord(partner.result.period)) : null;
  return (
    <div className="space-y-8">
          {/* At most four analyses run for this page view, each under its own work bound (readyFor). */}
          <ReadyCards
            cards={ready}
            metric={metric}
            points={points}
            forecast={forecast}
            numberStyle={numberStyle}
            yearStart={yearStart}
          />

          <section aria-label={`What moves with ${metric.name}`} className="stock rounded-[var(--radius-card)] p-5">
            <h2 className="text-base font-medium">What moves with {metric.name}</h2>
            {partner ? (
              <>
                <ul className="mt-3 divide-y divide-[var(--color-rule-2)]">
                  {correlations.slice(0, 5).map((c) => {
                    const t = correlationTakeaway(metric, c.metric, c.result, ctx);
                    return (
                      <li key={c.metric.id}>
                        <Link href={at({ vs: c.metric.slug, ...keepBasis })} scroll={false} aria-current={c.metric.id === partner.metric.id ? "true" : undefined} className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-2 py-2 text-sm hover:bg-muted", c.metric.id === partner.metric.id && "bg-muted font-medium")}>
                          <span>{c.metric.name}</span>
                          <span className="text-xs text-muted-foreground">{t.kind === "answer" ? t.strengthText : "cannot be told"} · {basisLabel(c.result)}</span>
                          <span className="fig ml-auto text-xs text-muted-foreground">{formatNumber(c.result.r, 2, numberStyle)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3">
                  <TakeawayView takeaway={correlationTakeaway(metric, partner.metric, partner.result, ctx)}>
                    <BasisToggle byValue={byValue} at={at} partner={partner} />
                  </TakeawayView>
                </div>
              </>
            ) : <p className="mt-1 text-sm text-muted-foreground">No other metric with enough shared history.</p>}
            {notCombined.map((r) => <p key={r} className="mt-1 text-xs text-muted-foreground">{r}</p>)}
            {!partner && <ShowTheNumbers byValue={byValue} at={at} partner={partner} />}
            {partner && (
              <div className="mt-4">
                <p className="mb-1 text-xs text-muted-foreground">{partner.metric.name} (x) vs. {metric.name} (y), one dot per {periodWord(partner.result.period)}{changeNote(partner.result)}</p>
                <ScatterView numberStyle={numberStyle} x={partner.metric} y={metric} pairs={scatter} yearStart={yearStart} />
                {stretch && <p className="mt-1 text-xs text-muted-foreground">{stretch}</p>}
              </div>
            )}
          </section>

          <section aria-label={`Ask about ${metric.name}`} className="stock rounded-[var(--radius-card)] p-5">
            <h2 className="text-base font-medium">Ask about {metric.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pick what you want to know, such as what moves it, whether it changed or what it would take to reach a value. The list starts with what fits {metric.name}.</p>
            <Link href={`/analyze?metric=${encodeURIComponent(metric.slug)}`} className="mt-3 inline-flex min-h-10 items-center rounded-[var(--radius-stock)] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Choose a method for {metric.name}</Link>
          </section>
        </div>
  );
}

/** The older comparison on the values as they are, a link that sets `?basis=values`; it goes inside a Takeaway's Show the numbers. */
function BasisToggle({ byValue, at, partner }: { byValue: boolean; at: (extra: Record<string, string>) => string; partner?: { metric: { slug: string } } }) {
  const href = at({ ...(partner ? { vs: partner.metric.slug } : {}), ...(byValue ? {} : { basis: "values" }) });
  return (
    <p className="mt-1">
      Two Metrics that both grow look related even when nothing links them, so by default growth is removed. {byValue ? "Now compared on the values as they are. " : ""}
      <Link href={href} scroll={false} className="underline">{byValue ? "Remove growth again" : "Compare on the values as they are"}</Link>
    </p>
  );
}

/** Show the numbers for a Correlation that has no partner yet: only the choice of what it is compared on. */
function ShowTheNumbers({ byValue, at, partner }: { byValue: boolean; at: (extra: Record<string, string>) => string; partner?: { metric: { slug: string } } }) {
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">Show the numbers</summary>
      <BasisToggle byValue={byValue} at={at} partner={partner} />
    </details>
  );
}


/** What a dot is when growth was removed: the change from the period before. */
function changeNote(result: { basis: string; period: Parameters<typeof periodWord>[0] }): string {
  return result.basis === "changes" ? `, each the change from the ${periodWord(result.period)} before` : "";
}
