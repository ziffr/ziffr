export type Period = "day" | "week" | "month";
export type SubmissionRule = "reject" | "overwrite" | "add" | "keep_both";
export type Polarity = "higher" | "lower" | "target";
export type Format = "number" | "currency" | "percent";
export type SourceId = "slack" | "mail" | "web_form";

export type Profile = {
  id: string;
  name: string;
  role: string;
  color: string;
  slack_handle: string;
  email: string;
};

export type Aggregation = "sum" | "average" | "last" | "none";

export type MetricDescription = {
  name: string;
  aggregation: Aggregation;
  description: string;
  unit: string;
  format: Format;
  decimals: number;
  period: Period;
  submission_rule: SubmissionRule;
  polarity: Polarity;
  target_min: number | null;
  target_max: number | null;
  sources: SourceId[];
};

export type Metric = MetricDescription & {
  id: number;
  slug: string;
  owner_id: string;
  formula: string | null;
  from_catalog_id: number | null;
  created_at: string;
};

export type CatalogMetric = MetricDescription & { id: number; category: string };

export type Observation = {
  id: number;
  metric_id: number;
  period_start: string;
  value: number;
  submitter_id: string | null;
  source: string;
  original_value: number | null;
  created_at: string;
};

/** One plotted value per period (latest wins when a rule keeps both). */
export type Point = { period: string; value: number };

export type Token = { id: number; code: string; metric_id: number; submitter_id: string };

export type Prompt = {
  id: number;
  metric_id: number;
  submitter_id: string;
  source: SourceId;
  text: string;
  period_start: string;
  sent_at: string;
  answered_at: string | null;
};

export type IntakeEntry = {
  id: number;
  at: string;
  source: SourceId;
  sender: string;
  sender_id: string | null;
  raw: string;
  metric_id: number | null;
  token_code: string | null;
  outcome: string;
  detail: string;
};

export type ActionStatus = "open" | "answered" | "closed";
export type ActionKind = "question" | "task";
export type Action = {
  breakdown_label: string | null;
  kind: ActionKind;
  due_date: string | null;
  id: number;
  metric_id: number;
  period_start: string;
  observation_id: number | null;
  asker_id: string;
  assignee_id: string;
  question: string;
  status: ActionStatus;
  created_at: string;
  updated_at: string;
};

export type ThreadMessage = {
  id: number;
  action_id: number;
  author_id: string;
  body: string;
  correction_value: number | null;
  correction_status: "proposed" | "accepted" | "declined" | null;
  created_at: string;
};

export type Dashboard = { id: number; name: string; owner_id: string };

export type TemplateId = "number" | "line" | "bars" | "gauge" | "table" | "forecast" | "correlation" | "matrix" | "drivers" | "ranked" | "share" | "pictogram" | "story-line" | "story" | "canvas";

/** A callout sits at one period, or (in templates) at whatever period a rule picks. */
export type Callout = { period: string; text: string; rule?: AnchorRule };

/** GLOSSARY: Panel, Measure, Bridge. */
export type PanelType = "period-bars" | "line" | "bridge" | "ranked" | "share" | "pictogram";
export type MeasureId = "value" | "pct-prev" | "pct-yoy" | "attainment";
/** What an annotation is attached to (GLOSSARY: Annotation): a rule, a period or a breakdown row, never a position. */
export type AnchorRule = "max" | "min" | "last" | "first" | "largest-step";
export type Anchor =
  | { type: "rule"; rule: AnchorRule }
  | { type: "period"; period: string }
  | { type: "row"; label: string };
export type Annotation = { kind: "callout" | "ring" | "note"; anchor: Anchor; text?: string; arrow?: boolean };

export type Panel = {
  annotations?: Annotation[];
  type: PanelType;
  /** Several metrics are drawn side by side as small multiples. */
  metricIds: number[];
  /** In a team template: which Slot fills this panel's metrics (GLOSSARY: Slot). */
  slot?: number;
  measure?: MeasureId;
  /** How many periods to show (period bars, line). */
  periods?: number;
  /** Which bars stand out: the last actual period, the projections, or one period. */
  highlight?: "last" | "projection" | string;
  /** Include Projections after the last actual period. */
  projections?: boolean;
  sharedScale?: boolean;
  refLine?: { kind: "target" | "constant" | "average"; value?: number; label?: string } | null;
  /** Bridge: walk one breakdown's rows, or the change between two periods row by row. */
  bridge?: { mode: "rows" | "variance"; period?: string | null; from?: string | null };
  title?: string;
};

export type WidgetSettings = {
  window?: number;
  showTarget?: boolean;
  showForecast?: boolean;
  rows?: number;
  /** Story Widgets (GLOSSARY: Story Widget). Empty fields fall back to text drawn from the data. */
  kicker?: string;
  footnote?: string;
  panels?: Panel[];
  headline?: string;
  subline?: string;
  source?: string;
  /** Label of the highlighted breakdown row. */
  highlight?: string | null;
  callouts?: Callout[];
  /** Period of the breakdown shown; empty means the latest one. */
  period?: string | null;
  /** Comparison strip (GLOSSARY: Comparison); undefined means the default. */
  compare?: import("./compare").CompareKey[];
  fullPeriods?: boolean;
  /** Free layout: a tldraw document with its artboard, and the latest period per metric when it was drawn. */
  canvas?: { document: unknown; stamp: Record<string, string> } | null;
  /** The widget this free layout started from, placed on the artboard the first time it opens. */
  canvasSeed?: { template: TemplateId; metric_ids: number[]; settings: WidgetSettings } | null;
};

export type Widget = {
  id: number;
  owner_id: string;
  dashboard_id: number | null;
  saved: boolean;
  title: string | null;
  template: TemplateId;
  metric_ids: number[];
  settings: WidgetSettings;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ShareRole = "viewer" | "editor";
export type Share = { id: number; object_type: "metric" | "dashboard"; object_id: number; user_id: string; role: ShareRole };

/** Everything a canvas needs to draw widgets client-side. */
export type CanvasData = {
  viewer: string;
  metrics: Metric[];
  series: Record<string, Point[]>;
  people: Profile[];
  openActions: Record<number, number>;
  /** Submitters per metric id (from Tokens). */
  submitters: Record<number, string[]>;
  /** Target Series and Projections per metric id (GLOSSARY). */
  targets: Record<number, Point[]>;
  projections: Record<number, Point[]>;
  /** Breakdowns per metric id, then per period (GLOSSARY: Breakdown). */
  breakdowns: Record<number, Record<string, BreakdownRow[]>>;
  /** The team's Widget Templates (GLOSSARY: Widget Template). */
  templates: TeamTemplate[];
};

/** GLOSSARY: Slot. One metric, or one or more for small multiples. */
/** exampleIds: the metrics it was made with; each viewer sees only the names of those they can see. */
export type Slot = { label: string; multiple: boolean; exampleIds?: number[] };
type TemplateBase = { id: number; owner_id: string; name: string; description: string; slots: Slot[]; w: number; h: number; updated_at: string };
/** A widget saved with its metrics left open: settings keep Panel.slot instead of metric ids. */
export type WidgetTemplate = TemplateBase & { kind: "widget"; view: TemplateId; body: { metricSlots: number[]; settings: WidgetSettings; title?: string | null } };
/** One shape on a slide, in slide coordinates. Widget shapes carry their template part instead of metrics. */
export type SlideShape = {
  type: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  props: Record<string, unknown>;
  widget?: { metricSlots: number[]; settings: WidgetSettings; title: string | null };
};
export type SlideBody = { shapes: SlideShape[] };
/** A whole slide saved with its metrics left open (a slide layout). */
export type SlideTemplate = TemplateBase & { kind: "slide"; view: "slide"; body: SlideBody };
export type TeamTemplate = WidgetTemplate | SlideTemplate;

export type BreakdownRow = { label: string; value: number };

export type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type Master = {
  id: number;
  owner_id: string;
  name: string;
  background_color: string;
  background_image: string | null;
  logo: string | null;
  logo_ratio: number;
  logo_position: LogoPosition;
  logo_width: number;
  footer: string;
  show_slide_number: boolean;
  text_color: string;
  title_size: number;
  body_size: number;
  is_default: boolean;
};
