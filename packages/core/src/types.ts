/** The shapes of Ziffr's domain objects, shared by the core, the web app, the API and the MCP server (GLOSSARY.md). */
export type Period = "day" | "week" | "month";
/** The month a workspace's Fiscal Year starts in, 1 (January) to 12 (December); periods.ts works with it. */
export type YearStart = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
/** What a second value for the same period does (GLOSSARY: Submission Rule). */
export type SubmissionRule = "reject" | "overwrite" | "add" | "keep_both";
/** Whether higher, lower or a range of values is good. */
export type Polarity = "higher" | "lower" | "target";
/** How a metric's values are written. */
export type Format = "number" | "currency" | "percent";
/** Where values can arrive from (GLOSSARY: Source). "api" is a program with an Access Key; a Metric takes it where it
 * takes its personal form link, since both use the Submitter's own Token. */
export type SourceId = "slack" | "mail" | "web_form" | "api" | "telegram";

/** A person in the workspace, with where Connectors reach them. */
export type Profile = {
  id: string;
  name: string;
  role: string;
  color: string;
  slack_handle: string;
  email: string;
  phone?: string | null;
  /** A Contact (GLOSSARY: Contact): known to the workspace, no login, only submits values. */
  contact?: boolean;
};

/** How a metric's values combine over longer spans (GLOSSARY: Aggregation). */
export type Aggregation = "sum" | "average" | "last" | "none";

/** What defines a metric, apart from who owns it (GLOSSARY: Metric). */
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

/** A metric with its owner and, for a Derived Metric, its formula. */
export type Metric = MetricDescription & {
  id: number;
  slug: string;
  owner_id: string;
  formula: string | null;
  from_catalog_id: number | null;
  created_at: string;
};

/** A predefined metric description to copy from (GLOSSARY: Metric Catalog). */
export type CatalogMetric = MetricDescription & {
  id: number;
  category: string;
  /** Kinds of business it suits, as lowercase keys such as "saas" or "manufacturing"; null means any. */
  industries: string[] | null;
  /** Customer segments it suits ("b2b", "b2c"); null means any. */
  segments: string[] | null;
};

/** One value of a metric for one period (GLOSSARY: Observation). */
export type Observation = {
  id: number;
  metric_id: number;
  period_start: string;
  value: number;
  submitter_id: string | null;
  source: string;
  original_value: number | null;
  /** The Access Key a program submitted it with, if any. */
  access_key_id?: number | null;
  /** An Import (GLOSSARY: Import): a Feed's value for a past period, recorded without the Unusual Value check. */
  imported?: boolean;
  created_at: string;
};

/** One plotted value per period (latest wins when a rule keeps both). */
export type Point = { period: string; value: number };

/** The standing permission that links one submitter to one metric (GLOSSARY: Token). */
export type Token = { id: number; code: string; metric_id: number; submitter_id: string };

/** A message asking a submitter for a value (GLOSSARY: Prompt). */
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

/** One incoming message as it was received, with what intake made of it. */
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

/** Where a question or task stands. */
export type ActionStatus = "open" | "answered" | "closed";
/** A question or a task (GLOSSARY: Action). */
export type ActionKind = "question" | "task";
/** A question or task about a specific value of a metric (GLOSSARY: Action). */
export type Action = {
  breakdown_label: string | null;
  /** null: everyone may read the thread; else only this Group (and the people on it). */
  read_group_id: number | null;
  /** Approval requests and escalations are Actions the Workflow creates. */
  purpose?: "approval" | "escalation" | null;
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

/** One reply in a Thread, possibly proposing a Correction. */
export type ThreadMessage = {
  id: number;
  action_id: number;
  author_id: string;
  body: string;
  correction_value: number | null;
  correction_status: "proposed" | "accepted" | "declined" | null;
  created_at: string;
};

/** A dashboard and the Theme it uses (null: the team default). */
/** A dashboard, or a story kept as one (kind "story", spec 0010): its widgets are then its Findings, read in order. */
export type Dashboard = {
  id: number; name: string; owner_id: string; theme_id: number | null; intro: string;
  /** Takes a Snapshot of every week, month or quarter by itself (spec 0013); null for only by hand. */
  snapshot_every?: "week" | "month" | "quarter" | "half" | "year" | null;
  /** Days after a period ends that an automatic Snapshot waits for its Locks at most. */
  snapshot_wait_days?: number;
};

/** The built-in Widget Templates. */
export type TemplateId = "number" | "line" | "bars" | "gauge" | "table" | "forecast" | "correlation" | "matrix" | "drivers" | "ranked" | "share" | "pictogram" | "story-line" | "story" | "canvas";

/** A callout sits at one period, or (in templates) at whatever period a rule picks. */
export type Callout = { period: string; text: string; rule?: AnchorRule };

/** GLOSSARY: Panel, Measure, Bridge. */
export type PanelType = "period-bars" | "line" | "bridge" | "ranked" | "share" | "pictogram";
/** What a Panel shows of a metric: the value or a change (GLOSSARY: Measure). */
export type MeasureId = "value" | "pct-prev" | "pct-yoy" | "attainment";
/** What an annotation is attached to (GLOSSARY: Annotation): a rule, a period or a breakdown row, never a position. */
export type AnchorRule = "max" | "min" | "last" | "first" | "largest-step";
/** What an Annotation is attached to: a rule, a period or a breakdown row, never a position. */
export type Anchor =
  | { type: "rule"; rule: AnchorRule }
  | { type: "period"; period: string }
  | { type: "row"; label: string };
/** A ring, callout or note on a Panel (GLOSSARY: Annotation). */
export type Annotation = { kind: "callout" | "ring" | "note"; anchor: Anchor; text?: string; arrow?: boolean };

/** One chart inside a story (GLOSSARY: Panel). */
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

/** Everything a widget can be set to; each view uses the parts it needs. */
export type WidgetSettings = {
  window?: number;
  showTarget?: boolean;
  showForecast?: boolean;
  rows?: number;
  /** Findings (GLOSSARY: Finding). Empty fields fall back to text drawn from the data. */
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
  /** Draws only the Metric periods complete by this day (yyyy-mm-dd): a deck made from a Snapshot (spec 0013). */
  asOf?: string | null;
  /** The widget this free layout started from, placed on the artboard the first time it opens. */
  canvasSeed?: { template: TemplateId; metric_ids: number[]; settings: WidgetSettings } | null;
};

/** A widget on a dashboard, or saved to its owner's Pool (GLOSSARY: Widget). */
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

/** The role a Share gives (GLOSSARY: Viewer, Editor). */
export type ShareRole = "viewer" | "editor";
/** A share names a person or a Group; group shares are also handed out per member, with via_group set. */
export type Share = { id: number; object_type: "metric" | "dashboard" | "deck"; object_id: number; user_id: string; role: ShareRole; group_id?: number | null; via_group?: number };
/** GLOSSARY: Group. */
/** A Group; `everyone` marks the built-in "Everyone in the workspace", whose members are the workspace's members. */
export type Group = { id: number; name: string; members: string[]; everyone?: boolean };

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
  /** The team's Themes; one is the default (GLOSSARY: Theme). */
  themes: Theme[];
  /** May change themes (the workspace owner). */
  canEditThemes: boolean;
  /** GLOSSARY: Group. */
  groups: Group[];
  /** Periods per metric id whose value waits for Approval, and periods that are locked (GLOSSARY: Approval, Lock). */
  pending: Record<number, string[]>;
  locked: Record<number, string[]>;
  /** The month the workspace's year starts in (GLOSSARY: Fiscal Year): where every quarter, half-year and year that
   * is drawn or compared begins. Always the workspace's own now, also for a Snapshot taken under another. */
  yearStart: YearStart;
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
/** The shapes a slide layout keeps. */
export type SlideBody = { shapes: SlideShape[] };
/** A whole slide saved with its metrics left open (a slide layout). */
export type SlideTemplate = TemplateBase & { kind: "slide"; view: "slide"; body: SlideBody };
/** A team's Widget Template: for one widget, or a whole slide. */
export type TeamTemplate = WidgetTemplate | SlideTemplate;

/** One widget of a Dashboard Template: its view, its part of the template (slot numbers instead of Metrics) and where
 * it sits on the 12-column grid. */
export type DashboardTemplateWidget = { view: TemplateId; metricSlots: number[]; settings: WidgetSettings; title: string | null; x: number; y: number; w: number; h: number };
/** The widgets a Dashboard Template keeps. */
export type DashboardTemplateBody = { widgets: DashboardTemplateWidget[] };
/** A whole dashboard saved with its Metrics left open (GLOSSARY: Dashboard Template). Built-in ones have a text id,
 * team ones a number and an owner. Kept apart from TeamTemplate: canvases never load them. */
export type DashboardTemplate = Omit<TemplateBase, "id" | "owner_id" | "w" | "h" | "updated_at"> & {
  id: number | string;
  owner_id: string | null;
  kind: "dashboard";
  body: DashboardTemplateBody;
};

/** One row of a Breakdown. */
export type BreakdownRow = { label: string; value: number };

/** Where a Theme puts the logo on a slide. */
export type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
/** What a Theme puts on every slide (GLOSSARY: Theme): logo, footer, slide number, background image, type sizes. */
export type ThemeSlides = {
  background_image: string | null;
  logo: string | null;
  logo_ratio: number;
  logo_position: LogoPosition;
  logo_width: number;
  footer: string;
  show_slide_number: boolean;
  title_size: number;
  body_size: number;
};
/** Everything drawn behind a slide: the theme's slide part in the theme's colours, with the deck's own footer if it has one. */
export type SlideDesign = ThemeSlides & { background_color: string; text_color: string };

/** GLOSSARY: Theme. Colours are hex so the PowerPoint export can use them as they are. */
export type FontId = "general-sans" | "inter" | "ibm-plex-sans" | "libre-franklin" | "source-serif" | "playfair" | "georgia" | "arial" | "geist-mono" | "ibm-plex-mono";
/** The colours, fonts and card style of a Theme. Colours are hex so the PowerPoint export can use them as they are. */
export type ThemeTokens = {
  /** Behind the cards: the dashboard desk. */
  canvas: string;
  /** Cards and slides. */
  surface: string;
  ink: string;
  muted: string;
  rule: string;
  /** What stands out: the highlighted bar, kickers, callouts. */
  accent: string;
  /** Data colours, the first for single series. */
  data: string[];
  good: string;
  bad: string;
  /** The target band. */
  band: string;
  fontHeading: FontId;
  fontBody: FontId;
  fontFigures: FontId;
  radius: number;
  /** paper: textured with a soft shadow; flat: a hairline edge; plain: no edge at all. */
  cards: "paper" | "flat" | "plain";
};
/** A named look for everything that shows numbers (GLOSSARY: Theme). */
export type Theme = { id: number; owner_id: string; name: string; tokens: ThemeTokens; slides: ThemeSlides; is_default: boolean; updated_at: string };

/** GLOSSARY: Workflow. Steps run in order after the submitter is asked at the end of a period. */
export type WorkflowStep =
  | { type: "remind"; daysBefore: number }
  | { type: "escalate"; to: "stand-in" | "owner"; daysAfter: number }
  | { type: "check"; changePct: number; outsideTarget: boolean }
  | { type: "approve"; approvers: string[] }
  | { type: "publish"; lock: boolean };
/** A Workflow's Due Date and its steps. */
export type WorkflowConfig = { dueWorkingDays: number; steps: WorkflowStep[] };
/** A named, reusable path a metric's value takes each period (GLOSSARY: Workflow). */
export type Workflow = { id: number; owner_id: string; name: string; config: WorkflowConfig; updated_at: string };
/** Where a metric's period is in its Workflow. */
export type PeriodStateName = "asked" | "submitted" | "approval" | "published" | "locked";
/** A metric's period in its Workflow, with the steps done and the current approval. */
export type PeriodState = { metric_id: number; period_start: string; state: PeriodStateName; done_steps: number[]; approval_step: number | null; approval_action_id?: number | null; note: string | null; updated_at: string };
