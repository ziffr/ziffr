// The words a Pack's formats use for what Ziffr knows (GLOSSARY: Metric Description, Theme, Widget Template, Workflow):
// periods, aggregations, the fonts Ziffr ships, its Views. Ziffr's own tests hold each list to the app's, so a file
// this kit accepts is one Ziffr accepts.

/** How often a Metric has a value. */
export type Period = "day" | "week" | "month" | "quarter" | "year";
/** How a Metric's values combine over longer periods. */
export type Aggregation = "sum" | "average" | "last" | "none";
/** What kind of number a Metric counts. */
export type Format = "number" | "currency" | "percent";
/** Whether higher, lower or a range of values is good. */
export type Polarity = "higher" | "lower" | "target";
/** Where values may arrive from. */
export type SourceId = "slack" | "mail" | "web_form" | "api" | "telegram";
/** What a second value for the same period does. */
export type SubmissionRule = "reject" | "overwrite" | "add" | "keep_both";
/** Which side of the number a unit stands on. */
export type UnitPosition = "before" | "after";
/** How a Metric's Attainment is computed. */
export const ATTAINMENT_METHODS = ["ratio", "distance"] as const;
/** One of ATTAINMENT_METHODS. */
export type AttainmentMethod = (typeof ATTAINMENT_METHODS)[number];

/** The fonts Ziffr ships, which a Theme may use. */
export const FONT_IDS = ["general-sans", "inter", "ibm-plex-sans", "libre-franklin", "source-serif", "playfair", "georgia", "arial", "geist-mono", "ibm-plex-mono"] as const;
/** One of FONT_IDS. */
export type FontId = (typeof FONT_IDS)[number];
/** Where a Theme puts the logo on a slide. */
export type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** The Views a template's widget may use: every built-in View but the Free Layout, and "design" for a View Design. */
export const TEMPLATE_VIEWS = ["number", "line", "bars", "gauge", "table", "forecast", "correlation", "matrix", "drivers", "scoreboard", "progress", "stacked", "pareto", "slope", "running-total", "bump", "ranked", "share", "pictogram", "story", "design", "story-line"] as const;
/** One of TEMPLATE_VIEWS. */
export type TemplateView = (typeof TEMPLATE_VIEWS)[number];
/** Where a note sits: the highest or lowest value, the latest or first period shown, or the biggest change. */
export type AnchorRule = "max" | "min" | "last" | "first" | "largest-step";
/** What a story's Panel shows of a Metric. */
export type MeasureId = "value" | "pct-prev" | "pct-yoy" | "attainment";
/** The kinds of Panel in a story. */
export type PanelType = "period-bars" | "line" | "bridge" | "ranked" | "share" | "pictogram";
/** A Comparison a widget shows. */
export type CompareKey = "prev" | "dod" | "wow" | "mom" | "qoq" | "hoh" | "yoy";
/** A period longer than a Metric's own that a widget shows it by (Show by). */
export type DisplayPeriod = "week" | "month" | "quarter" | "half" | "year";

/** A step of a Workflow Template, with its Approvers left open (only how many to pick) and the people, Groups and
 * dashboard of its Checklist Items and Send Snapshot step left open too. */
export type WorkflowTemplateStep =
  | { type: "remind"; daysBefore: number }
  | { type: "escalate"; to: "stand-in" | "owner"; daysAfter: number }
  | { type: "check"; changePct: number; outsideTarget: boolean }
  | { type: "approve"; approvers: number; values?: "unusual" | "every"; nobodyElse?: "self-check" | "count" }
  | { type: "checklist"; kind: "info"; text: string; day: number }
  | { type: "checklist"; kind: "tick"; text: string; dueWorkingDays: number }
  | { type: "send_snapshot" }
  | { type: "publish"; lock: boolean };
