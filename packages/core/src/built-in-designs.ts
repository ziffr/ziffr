// The built-in Views that are View Designs (GLOSSARY: View Design, Widget Template): each is a file in view-designs/,
// checked like any design a person brings in, and drawn by the same renderer. Findings and the free layout stay
// built in (spec 0024): they are editorial compositions with their own words, Panels and Annotations.
import { checkViewDesignValue, type ViewDesign } from "./view-design";
import type { Slot, WidgetSettings } from "./types";
import number from "./view-designs/number.json";
import line from "./view-designs/line.json";
import bars from "./view-designs/bars.json";
import gauge from "./view-designs/gauge.json";
import table from "./view-designs/table.json";
import forecast from "./view-designs/forecast.json";
import correlation from "./view-designs/correlation.json";
import matrix from "./view-designs/matrix.json";
import drivers from "./view-designs/drivers.json";
import scoreboard from "./view-designs/scoreboard.json";

/** The built-in Views written as View Designs, by their template id. */
export const DESIGNED_VIEWS = ["number", "line", "bars", "gauge", "table", "forecast", "correlation", "matrix", "drivers", "scoreboard"] as const;
/** The id of a built-in View that is a View Design. */
export type DesignedView = (typeof DESIGNED_VIEWS)[number];

const FILES: Record<DesignedView, unknown> = { number, line, bars, gauge, table, forecast, correlation, matrix, drivers, scoreboard };

/** Each built-in View Design, checked as every design is: a file that does not pass stops Ziffr from starting. */
export const BUILT_IN_DESIGNS: Record<DesignedView, ViewDesign> = Object.fromEntries(
  DESIGNED_VIEWS.map((id) => {
    const res = checkViewDesignValue(FILES[id]);
    if (!res.ok) throw new Error(`The built-in View Design ${id} does not pass its checks: ${res.problems.map((p) => `${p.path} ${p.message}`).join("; ")}`);
    return [id, res.design];
  }),
) as Record<DesignedView, ViewDesign>;

/** Whether a template id names a built-in View Design. */
export const isDesignedView = (id: string): id is DesignedView => (DESIGNED_VIEWS as readonly string[]).includes(id);

/** A design's Slots as a Widget Template keeps them (GLOSSARY: Slot). */
export function designSlots(d: ViewDesign): Slot[] {
  return d.slots.map((s) => ({ label: s.label, multiple: s.metrics === "several" }));
}

/** The settings a widget placed with a design starts with: each option's default. */
export function designSettings(d: ViewDesign): WidgetSettings {
  const o = d.options ?? {};
  const out: WidgetSettings = {};
  if (o.window) out.window = o.window.default;
  if (o.rows) out.rows = o.rows.default;
  if (o.showTarget) out.showTarget = o.showTarget.default;
  if (o.showForecast) out.showForecast = o.showForecast.default;
  return out;
}
