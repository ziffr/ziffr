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

export type MetricDescription = {
  name: string;
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
export type Action = {
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
