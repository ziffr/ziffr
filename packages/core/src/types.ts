/** The shapes of Ziffr's domain objects, shared by the core, the web app, the API and the MCP server (GLOSSARY.md). */
import type { NumberStyle } from "./number-style";
import type { AttainmentMethod } from "./attainment-method";

/** How often a metric has a value: a day, an ISO week, a month, or a quarter or year of the Fiscal Year. */
export type Period = "day" | "week" | "month" | "quarter" | "year";
/** The month a workspace's Fiscal Year starts in, 1 (January) to 12 (December); periods.ts works with it. */
export type YearStart = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
/** What a second value for the same period does (GLOSSARY: Submission Rule). */
export type SubmissionRule = "reject" | "overwrite" | "add" | "keep_both";
/** Whether higher, lower or a range of values is good. */
export type Polarity = "higher" | "lower" | "target";
/** What kind of number a metric counts: `percent` values are stored as 12.5, not 0.125; `currency` picks the money
 * wording. It adds no sign of its own: the unit does (spec 0022). */
export type Format = "number" | "currency" | "percent";
/** Which side of the number a metric's unit stands on: "$1,200" before, "1.200 €" after (GLOSSARY: Metric Description). */
export type UnitPosition = "before" | "after";
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
  unit_position: UnitPosition;
  format: Format;
  decimals: number;
  period: Period;
  submission_rule: SubmissionRule;
  polarity: Polarity;
  target_min: number | null;
  target_max: number | null;
  sources: SourceId[];
  /** How its Attainment is computed (GLOSSARY: Attainment); null follows the Workspace's default. */
  attainment_method: AttainmentMethod | null;
};

/** A metric with its owner and, for a Derived Metric, its formula. */
export type Metric = MetricDescription & {
  id: number;
  slug: string;
  owner_id: string;
  formula: string | null;
  from_catalog_id: number | null;
  created_at: string;
  /** When it was archived (GLOSSARY: Archived Metric); null or missing while it is in use. */
  archived_at?: string | null;
  /** The Retention in force and one confirmed but not yet started, as stored (GLOSSARY: Retention). Only rows read from
   * the database whole carry them; `normalizeMetric` drops them, and `retentionFor` (retention-setting.ts) reads them. */
  retention?: unknown;
  retention_pending?: unknown;
  /** Set by the loader, never stored: a Derived Metric whose owner may no longer share one of its inputs shows no
   * values (derived-owner.ts, ticket #619). */
  inputs_withheld?: boolean;
  /** As stored: made through createDerivedMetric, so calculated only from Metrics its owner may share. The loader
   * reads it and `normalizeMetric` drops it. */
  inputs_checked?: boolean;
};

/** A predefined metric description to copy from (GLOSSARY: Metric Catalog). */
// The catalog has no Attainment method of its own: a Metric made from it follows the Workspace.
export type CatalogMetric = Omit<MetricDescription, "attainment_method"> & {
  id: number;
  category: string;
  /** Kinds of business it suits, as lowercase keys such as "saas" or "manufacturing"; null means any. */
  industries: string[] | null;
  /** Customer segments it suits ("b2b", "b2c"); null means any. */
  segments: string[] | null;
  /** Tags a Metric made from the entry gets (spec 0038): free words, up to 5, from a Pack; null for none. */
  tags?: string[] | null;
};

/** One value of a metric for one period (GLOSSARY: Observation). */
export type Observation = {
  id: number;
  metric_id: number;
  period_start: string;
  value: number;
  submitter_id: string | null;
  /** Who sent an imported value, as the Workspace Export named them (opened); null for a value recorded in the app. */
  submitted_by_name?: string | null;
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
  /** "paste" for a cell of a paste, with "import" beside it when it was recorded as history (spec 0026). */
  marks?: string[];
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
  purpose?: "approval" | "escalation" | "self_check" | null;
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
  /** The name of the Webhook the message came through, when it did (spec 0034). */
  via?: string | null;
};

/** A dashboard and the Theme it uses (null: the team default). */
/** A dashboard, or a story kept as one (kind "story", spec 0010): its widgets are then its Findings, read in order. */
export type Dashboard = {
  id: number; name: string; owner_id: string; theme_id: number | null; intro: string;
  /** Takes a Snapshot of every week, month, quarter, half-year or year by itself (specs 0013, 0020); null for only by hand. */
  snapshot_every?: "week" | "month" | "quarter" | "half" | "year" | null;
  /** Days after a period ends that an automatic Snapshot waits for its Locks at most. */
  snapshot_wait_days?: number;
};

/** The built-in Widget Templates. */
export type TemplateId = "number" | "line" | "bars" | "gauge" | "table" | "forecast" | "correlation" | "matrix" | "drivers" | "ranked" | "share" | "pictogram" | "story-line" | "story" | "canvas" | "design";

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
  /** How many periods it shows: of its Display Period when it has one. */
  window?: number;
  /** Show by (GLOSSARY: Display Period): a period longer than the Metric's own; absent means its own. */
  display?: import("./display-periods").DisplayPeriod;
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
  /** A widget drawn by a View Design of the Workspace (template "design"): which one, and the widget's own checked
   * copy of it, so removing the design from the Workspace changes no widget already placed. */
  design?: { id: number | null; body: import("./view-design").ViewDesign } | null;
  /** "All Metrics tagged X" instead of a fixed list (GLOSSARY: Tag; spec 0038): only for a view whose Metrics are one
   * "one or more" Slot. The widget's own `metric_ids` stay empty; each viewer's Metrics are worked out when it is drawn. */
  tagSource?: { id: string } | null;
  /** Set when a Tag widget is drawn, never stored: the Tag's name, how many more Metrics than drawn the viewer sees, and
   * whether the Tag was removed. Counts only what this viewer sees. */
  tagView?: { name: string | null; more: number; removed: boolean } | null;
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
  /** Condensed Values per metric id (GLOSSARY: Condensed Value); a missing key means none, or not sent. */
  condensed?: Record<number, import("./condensed-parts").CondensedPoint[]>;
  /** Breakdowns per metric id, then per period (GLOSSARY: Breakdown). */
  breakdowns: Record<number, Record<string, BreakdownRow[]>>;
  /** The team's Widget Templates (GLOSSARY: Widget Template). */
  templates: TeamTemplate[];
  /** The Tags this viewer sees, to pick one for a widget (GLOSSARY: Tag); only on pages that place widgets. */
  tags?: { id: string; name: string }[];
  /** The Workspace's View Designs to choose from (GLOSSARY: View Design); left out where nothing is placed, such as a
   * View Link or a Snapshot, whose widgets carry their own copy. */
  designs?: { id: number; name: string; body: import("./view-design").ViewDesign }[];
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
  /** How the workspace writes numbers (GLOSSARY: Number Style). Like `yearStart`, always the workspace's own now, also
   * for a Snapshot or a frozen View Link made before it changed. */
  numberStyle: NumberStyle;
  /** The Workspace's default Attainment method (GLOSSARY: Attainment), for Metrics without one of their own. Unlike
   * `numberStyle`, a Snapshot and a frozen View Link keep the one they were made with, so their numbers stay. */
  attainmentMethod: AttainmentMethod;
  /** The day a widget shown by a Display Period counts "to date" from (yyyy-mm-dd): the day after a Snapshot's
   * period, or the day a frozen View Link was made, so they keep what they showed. Absent: the current day. */
  today?: string;
};

/** GLOSSARY: Slot. One metric, or one or more for small multiples. */
/** exampleIds: the metrics it was made with; each viewer sees only the names of those they can see. */
/** suggests: in a template from a Pack, the key of the Pack's Metric Catalog entry it suggests. */
export type Slot = { label: string; multiple: boolean; exampleIds?: number[]; suggests?: string };
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

/** The slides a Deck Template keeps (GLOSSARY: Deck Template), all sharing the template's Slots, and the Theme a deck
 * made from it starts with, if the Workspace still has it. */
export type DeckTemplateBody = { slides: SlideBody[]; themeId?: number | null };
/** A whole deck saved with its Metrics left open (GLOSSARY: Deck Template). */
export type DeckTemplate = TemplateBase & { kind: "deck"; view: "deck"; body: DeckTemplateBody };
/** A step of a Workflow Template: a Workflow's step with its Approvers left open, only how many to pick. */
export type WorkflowTemplateStep =
  | Exclude<WorkflowStep, { type: "approve" | "tell" | "checklist" | "send_snapshot" }>
  | { type: "approve"; approvers: number; values?: ApprovalScope; nobodyElse?: NobodyElse }
  // Checklist Items and Send Snapshot keep their words and days; who, which Group may read and which dashboard are left open.
  | { type: "checklist"; kind: "info"; text: string; day: number }
  | { type: "checklist"; kind: "tick"; text: string; dueWorkingDays: number }
  | { type: "send_snapshot" };
/** What a Workflow Template keeps (GLOSSARY: Workflow Template): the Due Date and steps, with no person in them. */
export type WorkflowTemplateBody = { dueWorkingDays: number; steps: WorkflowTemplateStep[] };
/** A Workflow saved with its people left open (GLOSSARY: Workflow Template). */
export type WorkflowTemplate = TemplateBase & { kind: "workflow"; view: "workflow"; body: WorkflowTemplateBody };

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
  /** The dark variant (#583): the colours shown to a viewer whose Appearance is dark. Absent: derived from the
   * colours above (theme-dark.ts). Fonts, corners and cards are the same in both. */
  dark?: ThemeDarkColours;
  /** "follow" (the default, also when absent): the Theme goes dark with the viewer's Appearance. "fixed": always as
   * designed, for brand decks and anything that must look the same for everyone. */
  appearance?: "follow" | "fixed";
};
/** The colours of a Theme's dark variant. */
export type ThemeDarkColours = Pick<ThemeTokens, "canvas" | "surface" | "ink" | "muted" | "rule" | "accent" | "data" | "good" | "bad" | "band">;
/** A named look for everything that shows numbers (GLOSSARY: Theme). */
export type Theme = { id: number; owner_id: string; name: string; tokens: ThemeTokens; slides: ThemeSlides; is_default: boolean; updated_at: string };

/** GLOSSARY: Workflow. Steps run in order after the submitter is asked at the end of a period. */
export type WorkflowStep =
  | { type: "remind"; daysBefore: number }
  | { type: "escalate"; to: "stand-in" | "owner"; daysAfter: number }
  | { type: "check"; changePct: number; outsideTarget: boolean }
  // Which values wait for the Approvers: Unusual Values only (the default, also for steps stored before the choice
  // existed) or every value. Imports never wait. What happens when nobody but the submitter could approve: a
  // Self-check (the default, also for steps stored before the choice existed) or counting it without Approval.
  | { type: "approve"; approvers: string[]; values?: ApprovalScope; nobodyElse?: NobodyElse }
  | { type: "publish"; lock: boolean }
  // Tells named people and Groups when a Metric of the Workflow reaches a level (GLOSSARY: Tell). `id` names the step for
  // its memory (once per crossing); a level or a share is plain decimal text. `webhooks` are Webhook ids (spec 0034, ticket
  // #408): named by an Owner or Admin only, and each gets `alert.fired` for a Metric Everyone sees.
  | { type: "tell"; id: string; condition: TellCondition; people: string[]; groups: number[]; webhooks?: string[] }
  // A Checklist Item (GLOSSARY: Checklist Item; spec 0045): a short text of the owner's, once per Workflow and period,
  // either for information (sent to people and Groups `day` working days after the period ends) or to tick off (a Task
  // for `assignee`, due `dueWorkingDays` after it ends; given by ticket #792). `id` names it for its claim and Tasks;
  // `text` is sealed inside the stored config; `readGroup` keeps the item's words to one Group's people (and its owner).
  | ChecklistItem
  // Takes and sends the period's Snapshot of a dashboard once the period is finished (GLOSSARY: Send Snapshot; ticket #793).
  | { type: "send_snapshot"; id: string; dashboardId: number; people: string[]; groups: number[] };
/** A Checklist Item as stored: for information, or to tick off. */
export type ChecklistItem = { type: "checklist"; id: string; text: string; readGroup?: number } & (
  | { kind: "info"; day: number; people: string[]; groups: number[] }
  | { kind: "tick"; assignee: string | null; standIn?: string | null; dueWorkingDays: number }
);
/** What a Tell step waits for: an Alert's conditions without "not in by its Due Date", which is Escalate's. */
export type TellCondition = { kind: "share_of_target" | "changed_more"; share: string } | { kind: "at_or_above" | "below"; value: string };
/** Which values an Approve step holds back for Approval: only Unusual Values, or every value. */
export type ApprovalScope = "unusual" | "every";
/** What an Approve step does with a value nobody but its submitter could approve (GLOSSARY: Self-check). */
export type NobodyElse = "self-check" | "count";
/** Which days a Workflow runs on its own (GLOSSARY: Asking Schedule); weekdays are numbered 1 (Monday) to 7 (Sunday). */
export type AskingDays =
  | { kind: "every_day" }
  | { kind: "weekdays" }
  | { kind: "chosen_weekdays"; days: number[] }
  | { kind: "every_n_days"; n: number; from: string }
  | { kind: "month_day"; day: number | "last" };
/** When a Workflow runs on its own: a whole hour in the Workspace's time zone (null: the Workspace's run hour) and the days. */
export type AskingSchedule = { hour: number | null; days: AskingDays };
/** A Workflow's Due Date and its steps. */
export type WorkflowConfig = { dueWorkingDays: number; steps: WorkflowStep[]; /** Tell the Workflow's owner when a period locks (off when left out). */ lockSummary?: boolean; /** Run on its own days and hour instead of with the Workspace's daily run (GLOSSARY: Asking Schedule). */ asking?: AskingSchedule };
/** A named, reusable path a metric's value takes each period (GLOSSARY: Workflow). */
export type Workflow = { id: number; owner_id: string; name: string; config: WorkflowConfig; updated_at: string };
/** Where a metric's period is in its Workflow. */
export type PeriodStateName = "asked" | "submitted" | "approval" | "published" | "locked";
/** A metric's period in its Workflow, with the steps done and the current approval. */
export type PeriodState = { metric_id: number; period_start: string; state: PeriodStateName; done_steps: number[]; approval_step: number | null; approval_action_id?: number | null; approval_for?: string | null; note: string | null; updated_at: string };
