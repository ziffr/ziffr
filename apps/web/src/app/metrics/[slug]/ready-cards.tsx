// What Ziffr already knows about one Metric (GLOSSARY: Metric, Takeaway, Widget; ticket #988): the analyses of a Metric alone that fit
// its history and run by themselves, each with its Takeaway. The forecast is first and the largest, with its chart (the history, the forecast
// dashed and its likely range as a band), its Takeaway words and a Save as widget. Then, where they apply, the usual range, whether the
// Metric will reach its Target Range and when it changed. An analysis that cannot answer is not shown, and nothing is said about it. Only
// what the core gave for this person is drawn (readyFor works on a Metric the person sees).
import type { ReactNode } from "react";
import type { ReadyCard } from "@ziffr/core/analysis-picker";
import type { ForecastPoint } from "@ziffr/core/forecast";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { YearStart } from "@ziffr/core/periods";
import type { Metric, Point } from "@ziffr/core/types";
import { SaveWidget } from "@/app/analyze/save-widget";
import { TakeawayView } from "@/components/takeaway-view";
import { ForecastChart } from "./forecast-chart";

function Card({ card, children }: { card: ReadyCard; children?: ReactNode }) {
  return (
    <section aria-label={card.title} className="stock rounded-[var(--radius-card)] p-5">
      <h3 className="text-sm font-medium">{card.title}</h3>
      {children}
      <TakeawayView takeaway={card.takeaway} />
      {card.widget && <div className="mt-3"><SaveWidget {...card.widget} name={card.title} /></div>}
    </section>
  );
}

/** The cards for a Metric: the forecast first and full width, the others beside each other. */
export function ReadyCards({ cards, metric, points, forecast, numberStyle, yearStart }: { cards: ReadyCard[]; metric: Metric; points: Point[]; forecast: ForecastPoint[] | null; numberStyle: NumberStyle; yearStart: YearStart}) {
  const first = cards.find((c) => c.entry === "forecast");
  const rest = cards.filter((c) => c !== first);
  if (cards.length === 0) return null;
  return (
    <div className="space-y-4">
      <h2 className="text-base font-medium">Ready for {metric.name}</h2>
      {first && (
        <Card card={first}>
          {forecast && <div className="mt-3"><ForecastChart metric={metric} points={points} forecast={forecast} numberStyle={numberStyle} yearStart={yearStart} /></div>}
        </Card>
      )}
      {rest.length > 0 && <div className="grid gap-4 md:grid-cols-2">{rest.map((c) => <Card key={c.entry} card={c} />)}</div>}
    </div>
  );
}
