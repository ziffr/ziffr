// PROTOTYPE: built-in Widget Templates. In the real product each one maps onto a pluggable View,
// so others can add templates (GLOSSARY: View, Widget Template).
import type { TemplateId, WidgetSettings } from "@ziffr/core/types";

export type TemplateDef = {
  id: TemplateId;
  label: string;
  blurb: string;
  kind: "metric" | "analysis" | "story" | "layout";
  /** Story templates that draw one period's Breakdown. */
  needsBreakdown?: boolean;
  size: { w: number; h: number };
  settings: WidgetSettings;
};

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  number: { id: "number", label: "Number + sparkline", blurb: "Latest value, change and a small trend.", kind: "metric", size: { w: 3, h: 4 }, settings: { window: 12 } },
  line: { id: "line", label: "Line chart", blurb: "Trend with target band and optional forecast.", kind: "metric", size: { w: 6, h: 6 }, settings: { window: 12, showTarget: true, showForecast: false } },
  bars: { id: "bars", label: "Bars per period", blurb: "One bar per period, coloured by target.", kind: "metric", size: { w: 6, h: 6 }, settings: { window: 12, showTarget: true } },
  gauge: { id: "gauge", label: "Gauge vs. target", blurb: "Where the latest value sits against the target.", kind: "metric", size: { w: 3, h: 4 }, settings: {} },
  table: { id: "table", label: "History table", blurb: "The last values as a list.", kind: "metric", size: { w: 3, h: 6 }, settings: { rows: 6 } },
  forecast: { id: "forecast", label: "Forecast", blurb: "Trend projected a few periods ahead.", kind: "analysis", size: { w: 6, h: 7 }, settings: { window: 18 } },
  correlation: { id: "correlation", label: "Correlation", blurb: "Do two metrics move together?", kind: "analysis", size: { w: 6, h: 7 }, settings: {} },
  matrix: { id: "matrix", label: "Correlation matrix", blurb: "Every pair at once.", kind: "analysis", size: { w: 6, h: 7 }, settings: {} },
  drivers: { id: "drivers", label: "Drivers", blurb: "Which metrics move most with this one.", kind: "analysis", size: { w: 6, h: 8 }, settings: {} },
  ranked: { id: "ranked", label: "Story: ranked bars", blurb: "A breakdown, largest first, one row highlighted.", kind: "story", needsBreakdown: true, size: { w: 6, h: 9 }, settings: {} },
  share: { id: "share", label: "Story: part of the whole", blurb: "How a breakdown divides the total.", kind: "story", needsBreakdown: true, size: { w: 6, h: 7 }, settings: {} },
  pictogram: { id: "pictogram", label: "Story: 7 in 10", blurb: "The largest share as ten figures.", kind: "story", needsBreakdown: true, size: { w: 4, h: 8 }, settings: {} },
  story: { id: "story", label: "Story: composed", blurb: "A frame around one or more panels: period bars, bridges, small multiples.", kind: "story", size: { w: 8, h: 10 }, settings: { panels: [] } },
  canvas: { id: "canvas", label: "Free layout", blurb: "Place widgets, text, arrows and shapes freely, like on a slide.", kind: "layout", size: { w: 8, h: 10 }, settings: {} },
  "story-line": { id: "story-line", label: "Story: annotated line", blurb: "The trend with callouts at moments that matter.", kind: "story", size: { w: 8, h: 9 }, settings: { window: 12, callouts: [] } },
};

export const DEFAULT_TEMPLATE: TemplateId = "number";
export const METRIC_TEMPLATES = Object.values(TEMPLATES).filter((t) => t.kind === "metric");
export const STORY_TEMPLATES = Object.values(TEMPLATES).filter((t) => t.kind === "story");
/** Templates one metric can be shown in: story templates that need a breakdown only when it has one. */
export const templatesFor = (hasBreakdown: boolean) => [...METRIC_TEMPLATES, ...STORY_TEMPLATES.filter((t) => !t.needsBreakdown || hasBreakdown), TEMPLATES.canvas];
