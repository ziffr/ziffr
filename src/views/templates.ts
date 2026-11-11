// PROTOTYPE: built-in Widget Templates. In the real product each one maps onto a pluggable View,
// so others can add templates (GLOSSARY: View, Widget Template).
import type { TemplateId, WidgetSettings } from "@/lib/types";

export type TemplateDef = {
  id: TemplateId;
  label: string;
  blurb: string;
  kind: "metric" | "analysis";
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
};

export const DEFAULT_TEMPLATE: TemplateId = "number";
export const METRIC_TEMPLATES = Object.values(TEMPLATES).filter((t) => t.kind === "metric");
