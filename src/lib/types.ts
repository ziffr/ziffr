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

export type TemplateId = "number" | "line" | "bars" | "gauge" | "table" | "forecast" | "correlation" | "matrix" | "drivers" | "ranked" | "share" | "pictogram" | "story-line";

export type Callout = { period: string; text: string };

export type WidgetSettings = {
  window?: number;
  showTarget?: boolean;
  showForecast?: boolean;
  rows?: number;
  /** Story Widgets (GLOSSARY: Story Widget). Empty fields fall back to text drawn from the data. */
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
};

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
