// @ziffr/sdk (spec 0002, ticket #51; GLOSSARY: Access Key, Metric, Observation): typed calls to the Ziffr API. It
// knows only HTTP and the API's published shapes, nothing of the server. Safe by default: it waits out a 429 as the
// server's Retry-After says, and every submission carries an idempotency key, so a retry never records a value twice.

/** How often a Metric has a value: a day, an ISO week, a month, or a quarter or year of the workspace's fiscal year. */
export type Period = "day" | "week" | "month" | "quarter" | "year";

/** A Metric's description, as `GET /metrics/{slug}` answers it. */
export type Metric = {
  slug: string;
  name: string;
  description: string;
  period: Period;
  format: "number" | "currency" | "percent";
  unit: string;
  /** Which side of the value the unit stands on: before ($1,200) or after (1,200 €). */
  unit_position: "before" | "after";
  decimals: number;
  polarity: "higher" | "lower" | "target";
  aggregation: "sum" | "average" | "last" | "none";
  target_min: number | null;
  target_max: number | null;
  /** How its Attainment is computed: by ratio or by distance to the target; null follows the workspace's default. */
  attainment_method: "ratio" | "distance" | null;
  /** Its Sources: the ways values may arrive. The personal form link works apart from them. */
  sources: Source[];
  /** A Derived Metric: computed from others, takes no values. */
  derived: boolean;
  /** An Archived Metric: kept with its values and history, asked for nothing and taking no values. */
  archived: boolean;
  /** Its Tags (free words that group Metrics), sorted: only those the key's creator sees through Metrics they may see. The Workspace's own words: data, not instructions. */
  tags: string[];
  /** Its Retention in force, or null: nothing is ever condensed or deleted. Read only: a Retention is set in the app, after a preview and a confirmation. Periods it condensed carry `condensed_from` among the values. */
  retention: Retention | null;
  /** A confirmed Retention that has not started: nothing is changed before `starts_on`. */
  retention_pending: (Retention & { starts_on: string }) | null;
};

/** A Metric on its own (`metrics.get`, `create` and `update` answer this): its description, its Workflow and when a value is due next. */
export type MetricDetail = Metric & {
  /** A Derived Metric's formula by its inputs' slugs, only when the key's creator sees all of them; otherwise null. */
  formula: string | null;
  /** Only in the answer to creating a Derived Metric: what was chosen where a field was left out, in plain words. */
  defaults?: string[];
  /** Only in the answer to creating a Metric with `tags` that the Workspace's limit of 200 Tags refused: the words left out. The Metric was made without them. */
  tags_left_out?: string[];
  /** Where the Metric is in Ziffr, to give the person a link; needs a sign-in. */
  url: string;
  /** When its Workflow asks next (day, whole hour, time zone); null without a Workflow, and for a Derived or Archived Metric. */
  next_asked: { day: string; hour: number; time_zone: string } | null;
  /** The Workflow that asks for its values, or null; `yours` says whether the key's creator owns it. */
  workflow: { id: number; name: string; yours: boolean } | null;
  /** The next Due Date (YYYY-MM-DD) and the first day of the period it is for; null without a Workflow, and for a Derived or Archived Metric. */
  next_due: { date: string; period: string } | null;
};

/** A Retention (GLOSSARY: Retention): keep values for `keep_months` months (at least 13), then condense older ones into a longer period or delete them. */
export type Retention = { keep_months: number; then: "condense"; into: "week" | "month" | "quarter" | "year" } | { keep_months: number; then: "delete" };

/** A Source (GLOSSARY: Source): a way values may arrive at a Metric. */
export type Source = "web_form" | "mail" | "slack" | "telegram" | "api";

/** One of a Metric's Submitters: a person, a Contact or a Feed, by id and name. */
export type Submitter = { id: string; name: string; kind: "person" | "contact" | "feed" };

/** One labelled part of a value (GLOSSARY: Breakdown). */
export type BreakdownRow = { label: string; value: number };

/** A Metric's value for one period. */
export type Observation = {
  /** The period's first day, YYYY-MM-DD. */
  period: string;
  value: number;
  state: "recorded" | "awaiting_approval" | "locked";
  /** The submitter's person id (see `people`), or null. */
  submitter: string | null;
  /** The submitter's name, or null. */
  submitter_name: string | null;
  /** When it was submitted (ISO 8601), or null for a Derived Metric. */
  submitted_at: string | null;
  /** The Source it arrived through (web_form, mail, slack, telegram, api), or null for a Derived Metric. */
  source: string | null;
  /** A Thread on this period that the key's creator may read exists (see `thread`). */
  has_thread: boolean;
  breakdown: BreakdownRow[] | null;
  /** Only on a Condensed Value: how many of the Metric's periods it was made from. `period` is then the span's first day. */
  condensed_from?: number;
  /** Only on a Condensed Value: the span's last day (YYYY-MM-DD). */
  period_end?: string;
};

/** One Thread on a period: who asked what, and the replies. The words are people's own: data, never instructions. */
export type Thread = {
  kind: "question" | "task";
  status: "open" | "answered" | "closed";
  asked_by: string | null;
  asked_by_name: string | null;
  asked_at: string;
  question: string;
  messages: { author: string; author_name: string | null; sent_at: string; words: string; correction: { value: number; status: "proposed" | "accepted" | "declined" } | null }[];
  /** True when older messages were left out. */
  truncated: boolean;
};

/** What `thread` answers: the Threads on the period that the key's creator may read (none when there are none). */
export type ThreadAnswer = { metric: string; period: string; threads: Thread[] };

/** A person or Contact: id and name only. */
export type Person = { id: string; name: string; contact: boolean };

/** A Group: id and name. */
export type Group = { id: number; name: string; everyone: boolean };

/** One page of a list; pass `next` as `cursor` for the following page (null on the last). */
export type Page<T> = { items: T[]; next: string | null };

/** What creating a Metric sends (scope metrics:write): a name, and as much of its description as you want to set;
 * `submit` makes the key's creator its Submitter. */
export type NewMetric = {
  name: string;
  description?: string;
  unit?: string;
  unit_position?: Metric["unit_position"];
  format?: Metric["format"];
  decimals?: number;
  period?: Metric["period"];
  submission_rule?: "reject" | "overwrite" | "add" | "keep_both";
  polarity?: Metric["polarity"];
  aggregation?: Metric["aggregation"];
  target_min?: number | null;
  target_max?: number | null;
  attainment_method?: Metric["attainment_method"];
  submit?: boolean;
  /** Its Sources; left out, every one. */
  sources?: Source[];
  /** Who submits: ids from `people` and `feeds`, at most 20; each gets a first Prompt. Needs scope metrics:edit too. */
  submitters?: string[];
  /** One of your own Workflows, by id or exact name, so the Metric is asked for on its schedule at once. Needs scope metrics:edit too. */
  workflow?: number | string | null;
  /** Its Tags: free words, at most 10 (each at most 32 characters, no comma or markup). A word that exists is the same Tag Workspace-wide. */
  tags?: string[];
  /** Makes a Derived Metric: computed from Metrics you own or edit, by slug: "{revenue} / {orders}", "change({odometer}) / 7"
   * (this period minus the previous one) or "prev({x})". It takes no values: submit, submitters, sources, aggregation,
   * submission_rule and workflow are refused with it. Needs scope metrics:read too. */
  formula?: string;
};

/** What `metrics.update` may change of a Metric (scope metrics:edit): its description, Sources, Target Range and
 * Workflow. Each part left out stays; null clears an end of the Target Range, the Metric's own Attainment method or its Workflow. */
export type MetricPatch = {
  name?: string;
  description?: string;
  unit?: string;
  format?: Metric["format"];
  /** Only while the Metric has no values and no targets or projections by period. */
  period?: Metric["period"];
  submission_rule?: "reject" | "overwrite" | "add" | "keep_both";
  /** One of your own Workflows, by id or exact name, or null for none; only the Metric's owner. */
  workflow?: number | string | null;
  /** Its Sources, all of them: the ones left out are turned off. */
  sources?: Source[];
  polarity?: "higher" | "lower" | "target";
  target_min?: number | null;
  target_max?: number | null;
  attainment_method?: "ratio" | "distance" | null;
  /** A Derived Metric's new formula (scope metrics:read too); only its owner and Editors. */
  formula?: string;
  /** All its Tags (at most 10): it carries exactly these afterwards; [] takes them all off. Only its owner and Editors. */
  tags?: string[];
};

/** A Tag the key's creator sees, and on how many Metrics they see it: in use and archived. */
export type Tag = { name: string; metrics: number; archived: number };

/** A Metric's Unusual Value check: the check step of its Workflow, which several Metrics may share. */
export type UnusualValueCheck = {
  workflow: { name: string; yours: boolean; metrics: number } | null;
  check: { change_pct: number; outside_target: boolean } | null;
};

/** One period's value of a Target Series or a Projection: the period's first day and the value. */
export type SeriesValue = { period: string; value: number };

/** One period to set in a Target Series or Projections: a number sets it, null removes it. */
export type SeriesItem = { period: string; value: number | null };

/** Most periods one call sets or removes in a Target Series or Projections. */
export const SERIES_ITEMS_MAX = 500;

/** What a submission sends. */
export type SubmitValue = { value: number; period?: string; breakdown?: BreakdownRow[] };

/** What became of a value that was taken. */
export type Submission = { status: "recorded" | "awaiting_approval"; period: string; value: number; detail: string; replayed: boolean; unusual?: { reasons: string[]; expected: string } };

/** A Metric as its Feed sees it (spec 0012): what to fetch and which periods already have a value, never a value. */
export type FeedMetric = {
  slug: string; name: string; period: Period; unit: string; format: "number" | "currency" | "percent"; decimals: number;
  /** The current period's first day as Ziffr counts it. */
  current: string;
  /** Working days after a period ends by which its value is due, if its Workflow sets one. */
  due_working_days: number | null;
  /** First days of the periods that already have a value, oldest first. */
  filled: string[];
};

/** The Feed a Feed Key acts for, the month the workspace's year starts in, and its Metrics. */
export type FeedOverview = { name: string; year_start_month: number; metrics: Page<FeedMetric> };

/** What GET /workspace answers: the month the workspace's fiscal year starts in, 1 (January) to 12, and how it writes numbers. */
export type Workspace = {
  year_start_month: number; number_style: "1,234.5" | "1.234,5" | "1 234,5" | "1'234.5";
  /** The workspace's time zone (IANA name), which days, hours and Due Dates are in. */
  time_zone: string;
  /** The whole hour Workflows ask at unless they have an Asking Schedule of their own. */
  run_hour: number;
  week_start: "monday" | "sunday";
  /** The ways Ziffr can reach the key's creator to ask for a value now. */
  reached_by: ("email" | "slack" | "telegram")[];
};

/** One thing `find` found: a Metric, or its value for one period (`period` is the period's first day, null for the Metric alone; `matched_by` is "tag" when a Tag of the Metric fit the words, not its name). */
export type Found = { slug: string; name: string; archived: boolean; period: string | null; period_label: string | null; matched_by?: "tag" };

/** One duty in a Schedule: a value to submit, an Approval waiting, or a Task or Question assigned to the person. */
export type ScheduleEntry = {
  kind: "value_due" | "approval" | "task" | "question";
  /** The day it falls on (YYYY-MM-DD); null for an undated Task or Question. */
  date: string | null;
  overdue: boolean;
  /** Working days (Saturdays and Sundays skipped) it is late; 0 when it is not. */
  overdue_working_days: number;
  /** The Metric it is about; null for a checklist Task, which is about its Workflow (`workflow`) and period. */
  metric: { slug: string; name: string } | null;
  /** The Workflow a checklist Task is about; null for every other entry. */
  workflow: { id: number; name: string } | null;
  period: { start: string; name: string };
  /** The Approval's, Task's or Question's id; null for a value due. */
  action_id: number | null;
  /** A Task's or Question's words; null for a value due and an Approval. */
  text: string | null;
  /** A Question the Workflow asked because a value is missing. */
  escalation: boolean;
  /** The name of the colleague the person stands in for while they are Away. */
  standing_in_for: string | null;
  /** A value of a Metric without a Workflow, dated the first working day after its period ends. */
  no_due_date: boolean;
  /** How many days before the Due Date Ziffr reminds, or null. */
  remind_days_before: number | null;
  /** Where it is done in Ziffr; needs a sign-in. */
  url: string;
};

/** What GET /schedule answers: overdue first (the last 90 days, whatever the span), the span's days that have
 * entries, and the undated Tasks and Questions. */
export type Schedule = { today: string; /** Whose Schedule it is. */ person_id: string; overdue: ScheduleEntry[]; days: { date: string; entries: ScheduleEntry[] }[]; undated: ScheduleEntry[] };

/** A Workflow: id and name. */
export type WorkflowName = { id: number; name: string };

/** A step of a Workflow, in the order they run. A Tell step's `id` is left out for a new step and sent back as read for an existing one. */
export type WorkflowStep =
  | { type: "remind"; days_before: number }
  | { type: "escalate"; to: "stand-in" | "owner"; days_after: number }
  | { type: "check"; change_pct: number; outside_target: boolean }
  | { type: "approve"; approvers: string[]; values: "unusual" | "every"; nobody_else: "self-check" | "count" }
  | { type: "publish"; lock: boolean }
  | { type: "tell"; id?: string; condition: { kind: "share_of_target" | "changed_more"; share: string } | { kind: "at_or_above" | "below"; value: string }; people: string[]; groups: number[] }
  /** A Checklist Item: `kind` "info" goes to `people` and `groups` on its `day` (working days after the period ends); "tick" is a Task for `assignee`. Names people, so without workflows:people send it back as read. */
  | { type: "checklist"; id?: string; kind: "info" | "tick"; text: string; day?: number; people?: string[]; groups?: number[]; assignee?: string | null; stand_in?: string | null; due_working_days?: number; read_group?: number | null };

/** When a Workflow runs on its own (the Asking Schedule): a whole hour in the Workspace's time zone (null: the Workspace's run hour) and the days. */
export type AskingSchedule = { hour: number | null; days: { kind: "every_day" } | { kind: "weekdays" } | { kind: "chosen_weekdays"; days: number[] } | { kind: "every_n_days"; n: number; from: string } | { kind: "month_day"; day: number | "last" } };

/** A Workflow of the key's creator with its steps. */
export type WorkflowDetail = { id: number; name: string; due_working_days: number; lock_summary: boolean; steps: WorkflowStep[]; asking: AskingSchedule | null; metrics: number; /** The Metrics that use it which the key's creator sees (at most 50). */ used_by: { slug: string; name: string }[]; updated_at: string };
/** What to say to make a Workflow. */
export type NewWorkflow = { name: string; due_working_days?: number; lock_summary?: boolean; steps?: WorkflowStep[]; asking?: AskingSchedule | null };
/** What to change in one; each part left out stays, `steps` replaces all of them. */
export type WorkflowPatch = Partial<NewWorkflow>;

/** One line of a period's timeline: one event, or several of one kind close together. */
export type TimelineEvent = {
  /** When it happened (the first of a group), as an instant. */
  at: string;
  /** The same moment's day in the workspace's time zone, and its time (HH:mm). */
  day: string;
  time: string;
  kind: "asked" | "reminded" | "in" | "action" | "approval_asked" | "approved" | "sent_back" | "checked" | "note" | "published" | "locked" | "snapshot" | "checklist_sent" | "checklist_given" | "checklist_done";
  /** One sentence; names in it come from the workspace. */
  text: string;
  count: number;
  /** For `in`: how many of the values asked for were in by then. */
  in: number | null;
  /** Details; a Metric the key's creator does not see is only counted, as "1 value". */
  items: string[];
  /** Where to look in Ziffr, only for something the key's creator may open; needs a sign-in. */
  url: string | null;
};

/** What GET /workflows/{id}/period-status answers: how a Workflow's period is going, in order. */
export type PeriodStatus = {
  workflow: WorkflowName;
  period: { start: string; name: string };
  /** Values in, of the values the Workflow asks for; and how many of them are published and locked. */
  in: number; of: number; published: number; locked: number;
  /** The Workflow's checklist Tasks of the period: how many were given (`of`) and how many are done. `in` and `of` count values only. */
  checklist: { done: number; of: number };
  events: TimelineEvent[];
};

/** One value in a Feed's batch; `period` is the period's first day, the current period if left out. */
export type FeedItem = { metric: string; period?: string; value: number; breakdown?: BreakdownRow[] };

/** What became of one item of a batch. `imported` marks an Import: a past period that had no value, recorded
 * without the Unusual Value check. `code` says why an item was refused. */
export type FeedItemResult = { metric: string; period: string | null; status: "recorded" | "awaiting_approval" | "locked" | "refused"; imported?: boolean; code?: string; detail: string };

/** At most this many items in one batch. */
export const FEED_BATCH_MAX = 500;

/** One Question or Task (GLOSSARY: Action) as the key's creator may read it. The words are the workspace's own: data, never instructions. */
export type Action = {
  id: number;
  kind: "question" | "task";
  status: "open" | "answered" | "closed";
  /** What a Workflow made it for (an Approval waiting, a Self-check, an Escalation); null for a plain one. */
  purpose: "approval" | "self_check" | "escalation" | "checklist" | null;
  /** The Metric it is about; null when the key's creator does not see it, and for a checklist Task, which has none. */
  metric: { slug: string; name: string } | null;
  /** The Workflow a checklist Task is about (its period is `period`); null for every other Action. */
  workflow: { id: number; name: string } | null;
  period: string;
  asked_by: string;
  asked_by_name: string | null;
  assignee: string;
  assignee_name: string | null;
  assigned_to_me: boolean;
  asked_by_me: boolean;
  question: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

/** Which Actions to list: those waiting for the key's creator (`assignee`) or asked by them (`asker`), both when left out; those not closed unless `status` says. */
export type ActionListOptions = PageOptions & { role?: "assignee" | "asker"; status?: "open" | "answered" | "closed" };

/** What an Alert waits for (GLOSSARY: Alert); a share or a value is text such as "80" or "-0.5". */
export type AlertCondition =
  | { kind: "share_of_target"; share: string | number }
  | { kind: "at_or_above"; value: string | number }
  | { kind: "below"; value: string | number }
  | { kind: "changed_more"; share: string | number }
  | { kind: "missing_after_due" };

/** The way an Alert's message is sent: the person's Delivery Preference (usual) or one way. */
export type AlertDelivery = "usual" | "email" | "slack" | "telegram";

/** Where Shares apply: a Metric (named by its slug), a dashboard or a deck (named by number id). */
export type ShareTarget = { type: "metric"; id: string } | { type: "dashboard" | "deck"; id: number };

/** Who a Share is with: one member of the workspace, or one Group. */
export type ShareWith = { person: string } | { group: number };

/** Who can see something and why, and for its owner the open requests for access. */
export type Audience = {
  owner: string;
  is_owner: boolean;
  people: { id: string; name: string; how: string[] }[];
  requests: { id: number; person: string; name: string; requested_at: string }[];
};

/** A Workspace Role. */
export type WorkspaceRole = "owner" | "admin" | "member" | "guest";

/** An invitation as a list shows it: never its token. */
export type Invitation = { id: number; email: string | null; role: WorkspaceRole; expires_at: string; created_at: string; emailed: boolean; email_error: string | null };

/** A request to join the workspace by its domain, with the address the person proved. */
export type JoinRequest = { id: number; requested_at: string; person: { id: string; name: string; email: string | null } };

/** One of the key's creator's own Alerts: its Metric, condition, state and when it last fired; never a value. */
export type Alert = {
  id: number;
  metric: { slug: string; name: string };
  condition: AlertCondition;
  delivery: AlertDelivery;
  include_unapproved: boolean;
  paused_by_person: boolean;
  /** Why Ziffr does not let it fire, or null. */
  paused: "no_access" | "archived" | "no_target" | "no_workflow" | null;
  state: "armed" | "fired";
  fired_at: string | null;
  created_at: string;
};

/** What a Share Proposal asks for: with `email` and `ends`, a View Link; with `person` or `group`, a Share as Viewer. */
export type NewShareProposal = { dashboard: number; snapshot?: number | null; live?: boolean; email?: string; ends?: string; message?: string | null; person?: string; group?: number };
/** A Share Proposal as made: open, with the page where the person confirms it. */
export type ShareProposal = {
  id: number; status: "open"; how: "view_link" | "share"; dashboard: { id: number; name: string }; recipient: string; ends: string | null; message: string | null;
  live: boolean; expires: string; url: string; preview: Dashboard;
};
/** What to say to make an Alert. */
export type NewAlert = { metric: string; condition: AlertCondition; delivery?: AlertDelivery; include_unapproved?: boolean };

/** What to say to change one; each part left out stays. */
export type AlertPatch = { condition?: AlertCondition; delivery?: AlertDelivery; include_unapproved?: boolean; paused?: boolean };

/** A dashboard in a list (spec 0014): the key's creator's role on it and where to open it. */
export type DashboardSummary = { id: number; name: string; role: "owner" | "editor" | "viewer"; url: string };

/** A Finding's words; Placeholders such as {metric} or {change yoy} are filled in when it is drawn. */
export type FindingWords = { kicker?: string; headline?: string; subline?: string; footnote?: string; source?: string };

/** One widget: its view, the slugs of the Metrics it draws and where it sits; a Finding has its words too. */
export type Widget = { id: number; view: string; title: string | null; metrics: string[]; x: number; y: number; w: number; h: number; words?: FindingWords; display?: DisplayPeriod };

/** A dashboard with its introduction and its widgets in reading order. */
export type Dashboard = DashboardSummary & { intro: string; widgets: Widget[] };

/** The periods a Snapshot can be of. */
export type SnapshotKind = "week" | "month" | "quarter" | "half" | "year";

/** A Snapshot in a list (ticket #435): `shown` is false while it is a draft for the dashboard's owner and Editors. */
export type SnapshotSummary = { id: number; dashboard: number; kind: SnapshotKind; start: string; end: string; label: string; takenAt: string; automatic: boolean; shown: boolean; url: string };

/** One Snapshot read: only the Metrics the key's creator sees now, at most the latest 240 values of each. */
export type Snapshot = SnapshotSummary & {
  name: string;
  intro: string;
  /** Widgets left out because they draw a Metric the creator does not see. */
  hiddenWidgets: number;
  widgets: SnapshotWidget[];
  metrics: SnapshotMetric[];
  /** Kept values that differ from the ones recorded now; `now` is null when removed. */
  corrections: { metric: string; period: string; was: number; now: number | null }[];
};

/** A widget of a Snapshot: a Finding carries its words. */
export type SnapshotWidget = { id: number; view: string; title: string | null; metrics: string[]; words?: Record<string, string> };

/** A Metric of a Snapshot with the values it kept. */
export type SnapshotMetric = { slug: string; name: string; unit: string; values: { period: string; value: number }[] };

/** A View Link as listed: never its token or address. */
export type ViewLink = { id: number; dashboard: number; label: string; expires: string; revoked: boolean; created: string; frozen: boolean; snapshot: number | null };

/** A View Link just made: `token` and `url` are shown this once. */
export type MadeViewLink = ViewLink & { token: string; url: string };

/** The built-in views a key may place. */
export type View = "number" | "line" | "bars" | "gauge" | "table" | "forecast" | "correlation" | "matrix" | "drivers" | "scoreboard" | "ranked" | "share" | "pictogram" | "story-line";

/** The few widget settings a key may set. */
export type WidgetSettings = {
  window?: number; showTarget?: boolean; showForecast?: boolean; rows?: number;
  /** Show by: a period longer than the Metric's own, its values combined by its Aggregation; null for its own. */
  display?: DisplayPeriod | null;
};

/** A period a widget can show a Metric by (GLOSSARY: Display Period). */
export type DisplayPeriod = "week" | "month" | "quarter" | "half" | "year";

/** What adding a widget sends: a view with Metrics, or a team Widget Template with Metric slugs per Slot. */
export type NewWidget =
  | { view?: View; metrics: string[]; title?: string; settings?: WidgetSettings }
  | { template: number; fills: string[][]; title?: string };

/** A template to build with: a built-in view, a team Widget Template or a Dashboard Template, with its Slots. */
export type Template = { id: string | number; kind: "view" | "widget" | "dashboard"; name: string; description: string; slots: { label: string; multiple: boolean; suggested: string[] }[] };

/** Paging options of every list. */
export type PageOptions = { limit?: number; cursor?: string };

/** Options of the Metrics list: with `archived`, only the Archived Metrics instead of those in use. */
/** `tag` keeps only Metrics that carry every one of these Tags (at most 10). */
export type MetricListOptions = PageOptions & { archived?: boolean; tag?: string[] };

/** Options of a Metric's values: the periods from `from` to `to` (first days, YYYY-MM-DD, both included). */
export type ObservationOptions = PageOptions & { from?: string; to?: string };

/** Settings of a client. */
export type ZiffrOptions = {
  /** Where Ziffr runs, such as https://ziffr.example.com (the API is under /api/v1). */
  url: string;
  /** An Access Key, made in Settings, or a Feed Key, made for a Feed (then use `feed` only). */
  accessKey: string;
  /** How often to retry a 429 before giving up (default 3). */
  maxRetries?: number;
  /** Longest wait for one retry, in seconds (default 60); a longer Retry-After fails at once. */
  maxRetryWait?: number;
  /** A fetch to use instead of the global one. */
  fetch?: typeof fetch;
};

/** An error answer of the API, or a failure to reach it (status 0). `code` is stable; handle errors by it. */
export class ZiffrError extends Error {
  /** The HTTP status; 0 when Ziffr could not be reached. */
  readonly status: number;
  /** The API's stable error code. */
  readonly code: string;
  /** Seconds the server asked to wait, for `rate_limited`. */
  readonly retryAfter: number | null;

  // Plain fields, not parameter properties, so Node can run this file with its built-in type stripping.
  constructor(status: number, code: string, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "ZiffrError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const newIdempotencyKey = () => globalThis.crypto.randomUUID();

/** A client for one Ziffr and one Access Key. */
export class Ziffr {
  private readonly base: string;
  private readonly key: string;
  private readonly maxRetries: number;
  private readonly maxRetryWait: number;
  private readonly fetcher: typeof fetch;

  constructor(options: ZiffrOptions) {
    if (!options?.url) throw new Error("Ziffr needs the url where it runs.");
    if (!options.accessKey) throw new Error("Ziffr needs an Access Key.");
    this.base = `${options.url.replace(/\/+$/, "")}/api/v1`;
    this.key = options.accessKey;
    this.maxRetries = options.maxRetries ?? 3;
    this.maxRetryWait = options.maxRetryWait ?? 60;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** The Metrics the key's creator sees. */
  readonly metrics = {
    /** One page of Metrics: those in use, or with `archived` only the Archived Metrics. */
    list: ({ archived, ...options }: MetricListOptions = {}) => this.get<Page<Metric>>("/metrics", { ...options, archived: archived ? "true" : undefined }),
    /** Every Metric in use, or with `archived` every Archived Metric, page by page; with `tag`, only those carrying all of them. */
    all: (options: { archived?: boolean; tag?: string[] } = {}) => this.every<Metric>((cursor) => this.metrics.list({ cursor, limit: 100, archived: options.archived, tag: options.tag })),
    /** One Metric's description. */
    get: (slug: string) => this.get<MetricDetail>(`/metrics/${encodeURIComponent(slug)}`),
    /** Creates a Metric owned by the key's creator (scope metrics:write). A fresh idempotency key is sent unless one is
     * given; pass your own to make retries across runs of your program safe too. */
    create: async (metric: NewMetric, options: { idempotencyKey?: string } = {}): Promise<MetricDetail & { replayed: boolean }> => {
      const { body, headers } = await this.request<MetricDetail>("POST", "/metrics", undefined, metric, options.idempotencyKey ?? newIdempotencyKey());
      return { ...body, replayed: headers.get("idempotent-replayed") === "true" };
    },
    /** Deletes a Metric the key's creator owns (scope metrics:write), repeating its exact name to confirm. Refused
     * (ZiffrError 422) while another Metric's formula, a widget, a deck or a working View Link uses it. */
    delete: async (slug: string, confirmName: string): Promise<{ deleted: string; values: number }> =>
      (await this.request<{ deleted: string; values: number }>("DELETE", `/metrics/${encodeURIComponent(slug)}`, { confirm: confirmName })).body,
    /** Archives a Metric (scope metrics:write), when the key's creator is an Owner or Admin or owns it: its values and
     * history stay, it is asked for nothing and takes no values. Answers the Metric as it is now. */
    archive: async (slug: string): Promise<Metric> => (await this.request<Metric>("POST", `/metrics/${encodeURIComponent(slug)}/archive`)).body,
    /** Brings an Archived Metric back (scope metrics:write), under the same rule. Answers the Metric as it is now. */
    restore: async (slug: string): Promise<Metric> => (await this.request<Metric>("POST", `/metrics/${encodeURIComponent(slug)}/restore`)).body,
    /** Changes a Metric's description, Sources, Target Range or Workflow (scope metrics:edit), when the key's creator
     * owns it or is its Editor (its Workflow: its owner). Answers the Metric as it is now. */
    update: async (slug: string, patch: MetricPatch): Promise<MetricDetail> => (await this.request<MetricDetail>("PATCH", `/metrics/${encodeURIComponent(slug)}`, undefined, patch)).body,
    /** Who submits to a Metric (scope metrics:read). */
    submitters: async (slug: string): Promise<Submitter[]> => (await this.get<{ items: Submitter[] }>(`/metrics/${encodeURIComponent(slug)}/submitters`)).items,
    /** Adds and removes up to 20 Submitters each (scope metrics:edit), when the key's creator owns the Metric or is its
     * Editor. Each person added gets a first Prompt. Answers who submits now. */
    setSubmitters: async (slug: string, change: { add?: string[]; remove?: string[] }): Promise<{ items: Submitter[]; added: number; removed: number }> =>
      (await this.request<{ items: Submitter[]; added: number; removed: number }>("POST", `/metrics/${encodeURIComponent(slug)}/submitters`, undefined, change)).body,
    /** What makes a value unusual in the Metric's Workflow (scope metrics:read). */
    unusualValueCheck: (slug: string) => this.get<UnusualValueCheck>(`/metrics/${encodeURIComponent(slug)}/unusual-value-check`),
    /** Changes the check step of the Metric's Workflow, and so of every Metric sharing it (scope metrics:edit); only
     * when the key's creator owns the Workflow. */
    setUnusualValueCheck: async (slug: string, change: { change_pct?: number; outside_target?: boolean }): Promise<UnusualValueCheck> =>
      (await this.request<UnusualValueCheck>("PATCH", `/metrics/${encodeURIComponent(slug)}/unusual-value-check`, undefined, change)).body,
  };

  /** A Metric's Target Series: target values for single periods, such as a monthly budget. Where a period has none,
   * the Metric's Target Range applies. */
  readonly targetSeries = this.series("target-series");

  /** A Metric's Projections: values for the current period or later ones, from an outside forecast, always shown as
   * projections. */
  readonly projections = this.series("projections");

  /** A Metric's values. */
  readonly observations = {
    /** One page of a Metric's values, oldest first. */
    list: (slug: string, options: ObservationOptions = {}) => this.get<Page<Observation>>(`/metrics/${encodeURIComponent(slug)}/observations`, options),
    /** All of a Metric's values in a range, page by page. */
    all: (slug: string, options: Omit<ObservationOptions, "cursor" | "limit"> = {}) =>
      this.every<Observation>((cursor) => this.observations.list(slug, { ...options, cursor, limit: 100 })),
    /** Submits a value. A fresh idempotency key is sent unless one is given; pass your own to make retries across
     * runs of your program safe too. A locked period, or one a rule refuses, throws a ZiffrError (422). */
    submit: async (slug: string, value: SubmitValue, options: { idempotencyKey?: string } = {}): Promise<Submission> => {
      const { body, headers } = await this.request<Omit<Submission, "replayed">>("POST", `/metrics/${encodeURIComponent(slug)}/observations`, undefined, value, options.idempotencyKey ?? newIdempotencyKey());
      return { ...body, replayed: headers.get("idempotent-replayed") === "true" };
    },
  };

  /** The Threads on one period of a Metric that the key's creator may read, with authors, times and words (scope
   * metrics:read). `period` is the period's first day, YYYY-MM-DD. A period with none, and one whose Threads the creator
   * may not read, answer the same: an empty list. */
  thread = (slug: string, period: string): Promise<ThreadAnswer> => this.get<ThreadAnswer>(`/metrics/${encodeURIComponent(slug)}/thread`, { period });

  /** The month the workspace's fiscal year starts in (1 is January): where quarterly and yearly Metrics' periods start. */
  workspace = (): Promise<Workspace> => this.get<Workspace>("/workspace");

  /** What the key's creator has to do, by day (scope metrics:read). `from` and `to` are days, YYYY-MM-DD, at most 90
   * days apart; this week when left out. An Owner or Admin may name a teammate with `person_id` (from `people`). */
  schedule = (span: { from?: string; to?: string; person_id?: string } = {}): Promise<Schedule> => this.get<Schedule>("/schedule", span);

  /** Finds Metrics by name, and "Metric + period" for words such as "churn march 2026" (scope metrics:read). Period
   * results come first; `slug` and `period` are what `metrics.get` and `observations` take. */
  find = async (words: string): Promise<Found[]> => (await this.get<{ items: Found[] }>("/find", { q: words })).items;

  /** The workspace's Workflows, to find the one to ask about (scope metrics:read). */
  readonly workflows = {
    /** One page of Workflows. */
    list: (options: PageOptions = {}) => this.get<Page<WorkflowName>>("/workflows", options),
    /** Every Workflow, page by page. */
    all: () => this.every<WorkflowName>((cursor) => this.workflows.list({ cursor, limit: 100 })),
    /** A Workflow the key's creator owns, with its steps (scope metrics:read). */
    get: (id: number): Promise<WorkflowDetail> => this.get<WorkflowDetail>(`/workflows/${id}`),
    /** Makes a Workflow (scope workflows:write). An Approve or Tell step also needs workflows:people, which only a program's key can hold. */
    create: async (input: NewWorkflow): Promise<WorkflowDetail> => (await this.request<WorkflowDetail>("POST", "/workflows", undefined, input)).body,
    /** Changes a Workflow the key's creator owns (scope workflows:write). Without workflows:people, send Approve and Tell steps back as read. */
    update: async (id: number, patch: WorkflowPatch): Promise<WorkflowDetail> => (await this.request<WorkflowDetail>("PATCH", `/workflows/${id}`, undefined, patch)).body,
    /** Deletes a Workflow the key's creator owns (scope workflows:write). */
    remove: async (id: number): Promise<{ removed: number }> => (await this.request<{ removed: number }>("DELETE", `/workflows/${id}`)).body,
    /** How a Workflow's period is going, as the key's creator may see it (scope metrics:read): `period` is a period's
     * first day, the newest one that has anything when left out. */
    periodStatus: (id: number, period?: string): Promise<PeriodStatus> => this.get<PeriodStatus>(`/workflows/${id}/period-status`, period ? { period } : {}),
  };

  /** The workspace's people and Contacts. */
  readonly people = {
    /** One page of people. */
    list: (options: PageOptions = {}) => this.get<Page<Person>>("/people", options),
    /** Everyone, page by page. */
    all: () => this.every<Person>((cursor) => this.people.list({ cursor, limit: 100 })),
    /** Adds a Contact: a person without a sign-in who only submits values (scope people:write; Owners and Admins).
     * Answers with their id and name, never the details. */
    addContact: async (input: { name: string; email?: string; slack_handle?: string; phone?: string }): Promise<{ id: string; name: string; contact: true }> =>
      (await this.request<{ id: string; name: string; contact: true }>("POST", "/people", undefined, input)).body,
    /** Changes a member's Workspace Role (scope people:write); only Owners make or change Owners. */
    setRole: async (id: string, role: WorkspaceRole): Promise<{ id: string; role: WorkspaceRole }> =>
      (await this.request<{ id: string; role: WorkspaceRole }>("PATCH", `/people/${encodeURIComponent(id)}`, undefined, { role })).body,
    /** Removes a Contact, or a member whose things go to `successor` (another member, not a Guest). Scope people:write. */
    remove: async (id: string, options: { successor?: string } = {}): Promise<{ removed: string }> =>
      (await this.request<{ removed: string }>("DELETE", `/people/${encodeURIComponent(id)}`, options.successor ? { successor: options.successor } : undefined)).body,
  };

  /** Inviting people (scope people:write, Owners and Admins; only a program's own key, never an assistant's). */
  readonly invitations = {
    /** The open invitations, never with their secret links. */
    list: async (): Promise<Invitation[]> => (await this.get<{ items: Invitation[] }>("/invitations")).items,
    /** Invites an address with a role and emails it the link. */
    invite: async (input: { email: string; role: WorkspaceRole; contact?: string }): Promise<Invitation> => (await this.request<Invitation>("POST", "/invitations", undefined, input)).body,
    /** Makes a link anyone can join by, as Member or Guest, for 7 days. Keep it as you would a password. */
    link: async (role: "member" | "guest"): Promise<{ url: string; role: "member" | "guest" }> => (await this.request<{ url: string; role: "member" | "guest" }>("POST", "/invitations/links", undefined, { role })).body,
    /** Revokes an invitation or invite link. */
    revoke: async (id: number): Promise<{ removed: number }> => (await this.request<{ removed: number }>("DELETE", `/invitations/${id}`)).body,
    /** Emails an open invitation again. */
    resend: async (id: number): Promise<{ id: number }> => (await this.request<{ id: number }>("POST", `/invitations/${id}/resend`)).body,
  };

  /** Requests to join the workspace by its domain (scope people:write, Owners and Admins). */
  readonly joinRequests = {
    /** The open requests. */
    list: async (): Promise<JoinRequest[]> => (await this.get<{ items: JoinRequest[] }>("/join-requests")).items,
    /** Lets the person in as a Member (true) or declines (false). */
    decide: async (id: number, approve: boolean): Promise<{ id: number; approved: boolean }> => (await this.request<{ id: number; approved: boolean }>("POST", `/join-requests/${id}`, undefined, { approve })).body,
  };

  /** Shares (scope shares:write; only a program's own key, never an assistant's). Only the owner shares. */
  readonly shares = {
    /** Who can see a Metric, dashboard or deck the key's creator sees, and why. */
    who: (target: ShareTarget): Promise<Audience> => this.get<Audience>("/shares", { type: target.type, id: String(target.id) }),
    /** Shares it with a member or a Group as viewer or editor; a null role takes the Share away. */
    set: async (target: ShareTarget, to: ShareWith, role: "viewer" | "editor" | null): Promise<{ type: string; id: string | number; person: string | null; group: number | null; role: "viewer" | "editor" | null }> =>
      (await this.request<{ type: string; id: string | number; person: string | null; group: number | null; role: "viewer" | "editor" | null }>("POST", "/shares", undefined, { ...target, ...to, role })).body,
    /** The owner grants Viewer access to a request listed by `who` (true) or declines it (false). */
    decide: async (requestId: number, grant: boolean): Promise<{ id: number; granted: boolean }> => (await this.request<{ id: number; granted: boolean }>("POST", `/shares/requests/${requestId}`, undefined, { grant })).body,
  };

  /** The workspace's live Feeds by id and name, to name one as a Submitter (scope metrics:edit). */
  feeds = async (): Promise<{ id: string; name: string }[]> => (await this.get<{ items: { id: string; name: string }[] }>("/feeds")).items;

  /** The Tags the key's creator sees, by name, each with how many Metrics they see it on (scope metrics:read). Renaming,
   * merging and deleting Tags is done in Ziffr by an Owner or Admin, not through the API. */
  tags = async (): Promise<Tag[]> => (await this.get<{ items: Tag[] }>("/tags")).items;

  /** The workspace's Groups. */
  readonly groups = {
    /** One page of Groups. */
    list: (options: PageOptions = {}) => this.get<Page<Group>>("/groups", options),
    /** Every Group, page by page. */
    all: () => this.every<Group>((cursor) => this.groups.list({ cursor, limit: 100 })),
    /** Makes a Group (scope groups:write; Owners and Admins; only a program's own key, never an assistant's). */
    create: async (name: string): Promise<Group> => (await this.request<Group>("POST", "/groups", undefined, { name })).body,
    /** Renames a Group; never Everyone. */
    rename: async (id: number, name: string): Promise<Group> => (await this.request<Group>("PATCH", `/groups/${id}`, undefined, { name })).body,
    /** Deletes a Group; what was shared with it stops being shared. */
    remove: async (id: number): Promise<{ removed: number }> => (await this.request<{ removed: number }>("DELETE", `/groups/${id}`)).body,
    /** Puts a member of the workspace into a Group. */
    addMember: async (id: number, person: string): Promise<{ group: number; person: string; member: boolean }> => (await this.request<{ group: number; person: string; member: boolean }>("POST", `/groups/${id}/members`, undefined, { person })).body,
    /** Takes a member out of a Group. */
    removeMember: async (id: number, person: string): Promise<{ group: number; person: string; member: boolean }> => (await this.request<{ group: number; person: string; member: boolean }>("DELETE", `/groups/${id}/members/${encodeURIComponent(person)}`)).body,
  };

  /** For a Feed Key (spec 0012): the Feed's Metrics, and recording values for them in batches. */
  readonly feed = {
    /** The Feed's name and one page of its Metrics. */
    get: (options: PageOptions = {}) => this.get<FeedOverview>("/feed", options),
    /** Every Metric of the Feed, page by page. */
    metrics: () => this.every<FeedMetric>(async (cursor) => (await this.feed.get({ cursor, limit: 100 })).metrics),
    /** Records up to FEED_BATCH_MAX values, with one result per item in order. A fresh idempotency key is sent unless
     * one is given; pass your own (made from the values) to make a repeated run record nothing twice. */
    submit: async (items: FeedItem[], options: { idempotencyKey?: string } = {}): Promise<{ results: FeedItemResult[]; replayed: boolean }> => {
      if (!items.length || items.length > FEED_BATCH_MAX) throw new Error(`A batch holds 1 to ${FEED_BATCH_MAX} items.`);
      const { body, headers } = await this.request<{ results: FeedItemResult[] }>("POST", "/feed/observations", undefined, { items }, options.idempotencyKey ?? newIdempotencyKey());
      return { results: body.results, replayed: headers.get("idempotent-replayed") === "true" };
    },
  };

  /** The Questions and Tasks of the key's creator (GLOSSARY: Action): listing needs actions:read, replying, closing,
   * reopening and marking done actions:write, confirming or correcting in a Self-check values:submit and approving
   * values:approve, which only a program's key holds. Each acts as the key's creator, on the Actions they may read. */
  readonly actions = {
    /** One page of the Actions waiting for the creator and those they asked. */
    list: (options: ActionListOptions = {}) => this.get<Page<Action>>("/actions", options),
    /** Every one of them, page by page. */
    all: (options: Omit<ActionListOptions, "cursor" | "limit"> = {}) => this.every<Action>((cursor) => this.actions.list({ ...options, cursor, limit: 100 })),
    /** Replies in an Action's Thread, with a Correction (a value) when given. Only words: never decides a Self-check or an Approval. */
    reply: async (id: number, body: string, correction?: number): Promise<Action> => (await this.request<Action>("POST", `/actions/${id}/replies`, undefined, correction === undefined ? { body } : { body, correction })).body,
    /** Closes an Action the creator asked. */
    close: async (id: number): Promise<Action> => (await this.request<Action>("PATCH", `/actions/${id}`, undefined, { status: "closed" })).body,
    /** Reopens one the creator asked. */
    reopen: async (id: number): Promise<Action> => (await this.request<Action>("PATCH", `/actions/${id}`, undefined, { status: "open" })).body,
    /** Marks the creator's own open Task done, with an optional note (at most 2,000 characters) kept as the Thread's last reply. */
    done: async (id: number, note?: string): Promise<Action> => (await this.request<Action>("POST", `/actions/${id}/done`, undefined, note === undefined ? undefined : { note })).body,
    /** Confirms the creator's own value in a Self-check. */
    confirm: async (id: number): Promise<Action> => (await this.request<Action>("POST", `/actions/${id}/self-check`, undefined, { decision: "confirm" })).body,
    /** Corrects the creator's own value in a Self-check. */
    correct: async (id: number, value: number): Promise<Action> => (await this.request<Action>("POST", `/actions/${id}/self-check`, undefined, { decision: "correct", value })).body,
    /** Approves a value waiting for the creator (scope values:approve, a program's key only). Refused for their own value. */
    approve: async (id: number): Promise<Action> => (await this.request<Action>("POST", `/actions/${id}/approval`, undefined, { decision: "approve" })).body,
    /** Sends a value back with what to check (scope values:approve, a program's key only). */
    sendBack: async (id: number, comment: string): Promise<Action> => (await this.request<Action>("POST", `/actions/${id}/approval`, undefined, { decision: "send_back", comment })).body,
  };

  /** The key's creator's own Alerts (GLOSSARY: Alert): never anyone else's. Reading needs metrics:read, the rest the
   * scope alerts:write. */
  readonly alerts = {
    /** Their Alerts on Metrics they still see, newest first; of one Metric when its slug is given. At most 20. */
    list: async (options: { metric?: string } = {}): Promise<Alert[]> => (await this.get<{ items: Alert[] }>("/alerts", options)).items,
    /** Makes one for the key's creator. Refused (ZiffrError 422) at a limit or for a condition the Metric cannot give. */
    create: async (input: NewAlert): Promise<Alert> => (await this.request<Alert>("POST", "/alerts", undefined, input)).body,
    /** Changes one of theirs: condition, way of delivery, option or pause. */
    update: async (id: number, patch: AlertPatch): Promise<Alert> => (await this.request<Alert>("PATCH", `/alerts/${id}`, undefined, patch)).body,
    /** Removes one of theirs. */
    remove: async (id: number): Promise<{ removed: number }> => (await this.request<{ removed: number }>("DELETE", `/alerts/${id}`)).body,
  };

  /** Share Proposals (GLOSSARY: Share Proposal): prepares a share for the key's creator to confirm in Ziffr. It shares and sends
   * nothing; there is no call to confirm it, because only the person can, with their own sign-in. Needs shares:propose and dashboards:read. */
  readonly shareProposals = {
    /** Proposes a View Link (an address, an end date, a message) or a Share (a person or a Group) of a dashboard the creator owns. */
    create: async (input: NewShareProposal): Promise<ShareProposal> => (await this.request<ShareProposal>("POST", "/share-proposals", undefined, input)).body,
  };

  /** The dashboards the key's creator sees (scope dashboards:read), and building them as the creator (scope
   * dashboards:write). A key changes only what its creator may change, and never shares or deletes. */
  readonly dashboards = {
    /** One page of dashboards. */
    list: (options: PageOptions = {}) => this.get<Page<DashboardSummary>>("/dashboards", options),
    /** Every dashboard, page by page. */
    all: () => this.every<DashboardSummary>((cursor) => this.dashboards.list({ cursor, limit: 100 })),
    /** One dashboard with its introduction and widgets. */
    get: (id: number) => this.get<Dashboard>(`/dashboards/${id}`),
    /** Creates an empty dashboard, with an introduction if given. A fresh idempotency key is sent unless one is given. */
    create: async (input: { name: string; intro?: string }, options: { idempotencyKey?: string } = {}): Promise<Dashboard & { replayed: boolean }> => {
      const { body, headers } = await this.request<Dashboard>("POST", "/dashboards", undefined, input, options.idempotencyKey ?? newIdempotencyKey());
      return { ...body, replayed: headers.get("idempotent-replayed") === "true" };
    },
    /** Makes a dashboard from a Dashboard Template, with Metric slugs for each Slot in order. */
    fromTemplate: async (input: { template: string | number; name?: string; fills: string[][] }, options: { idempotencyKey?: string } = {}): Promise<Dashboard & { replayed: boolean }> => {
      const { body, headers } = await this.request<Dashboard>("POST", "/dashboards/from-template", undefined, input, options.idempotencyKey ?? newIdempotencyKey());
      return { ...body, replayed: headers.get("idempotent-replayed") === "true" };
    },
    /** Adds a widget in the first free place. */
    addWidget: async (dashboardId: number, widget: NewWidget): Promise<Widget> => (await this.request<Widget>("POST", `/dashboards/${dashboardId}/widgets`, undefined, widget)).body,
    /** Changes a widget's view, Metrics, title or settings. */
    updateWidget: async (dashboardId: number, widgetId: number, patch: { view?: View; metrics?: string[]; title?: string | null; settings?: WidgetSettings }): Promise<Widget> =>
      (await this.request<Widget>("PATCH", `/dashboards/${dashboardId}/widgets/${widgetId}`, undefined, patch)).body,
    /** Removes a widget or a Finding. */
    removeWidget: async (dashboardId: number, widgetId: number): Promise<{ removed: number }> => (await this.request<{ removed: number }>("DELETE", `/dashboards/${dashboardId}/widgets/${widgetId}`)).body,
    /** Changes a dashboard's name or introduction. */
    update: async (dashboardId: number, patch: { name?: string; intro?: string }): Promise<Dashboard> => (await this.request<Dashboard>("PATCH", `/dashboards/${dashboardId}`, undefined, patch)).body,
    /** Adds a Finding about one Metric below everything on the dashboard, full width. */
    addFinding: async (dashboardId: number, finding: FindingWords & { metric: string }): Promise<Widget> => (await this.request<Widget>("POST", `/dashboards/${dashboardId}/findings`, undefined, finding)).body,
    /** Changes a Finding's words. */
    updateFinding: async (dashboardId: number, findingId: number, words: FindingWords): Promise<Widget> => (await this.request<Widget>("PATCH", `/dashboards/${dashboardId}/findings/${findingId}`, undefined, words)).body,
  };

  /** Snapshots (ticket #435): reading needs dashboards:read, taking one dashboards:write. A key reads only what its
   * creator may open, and never shows, deletes or rewrites a Snapshot. */
  readonly snapshots = {
    /** A dashboard's Snapshots, newest period first (at most 200). */
    list: async (dashboardId: number): Promise<SnapshotSummary[]> => (await this.get<{ items: SnapshotSummary[] }>(`/dashboards/${dashboardId}/snapshots`)).items,
    /** One Snapshot with the values it kept. */
    get: (id: number) => this.get<Snapshot>(`/snapshots/${id}`),
    /** Takes a Snapshot of a period that is over (`start` is its first day, yyyy-mm-dd). A draft until a person shows it;
     * ZiffrError 422 when the period is not over or one exists already. */
    take: async (dashboardId: number, period: { kind: SnapshotKind; start: string }): Promise<SnapshotSummary> => (await this.request<SnapshotSummary>("POST", `/dashboards/${dashboardId}/snapshots`, undefined, period)).body,
  };

  /** View Links to dashboards (ticket #435), all behind the scope view-links:write, which a key is given on purpose and
   * an assistant never is: a View Link publishes data to people outside the workspace. */
  readonly viewLinks = {
    /** A dashboard's View Links without their tokens. */
    list: async (dashboardId: number): Promise<ViewLink[]> => (await this.get<{ items: ViewLink[] }>(`/dashboards/${dashboardId}/view-links`)).items,
    /** Makes one, ending on `expires` (yyyy-mm-dd, within 90 days). Its `token` and `url` are in this answer only. Not
     * idempotent: a repeated call makes another link. */
    create: async (dashboardId: number, input: { expires: string; label?: string; frozen?: boolean; snapshot?: number }): Promise<MadeViewLink> => (await this.request<MadeViewLink>("POST", `/dashboards/${dashboardId}/view-links`, undefined, input)).body,
    /** Revokes one at once and for good. */
    revoke: async (id: number): Promise<{ revoked: number }> => (await this.request<{ revoked: number }>("DELETE", `/view-links/${id}`)).body,
  };

  /** What a key can build with (scope dashboards:read). */
  readonly templates = {
    /** The built-in views, the team's Widget Templates and the Dashboard Templates, or one kind of them. */
    all: async (options: { kind?: Template["kind"] } = {}): Promise<Template[]> => (await this.get<{ items: Template[] }>("/templates", options)).items,
  };

  /** Reading (scope metrics:read) and setting (scope metrics:edit) one kind of series, the same for both. */
  private series(path: "target-series" | "projections") {
    return {
      /** Every period that has a value, oldest first. */
      list: async (slug: string): Promise<SeriesValue[]> => (await this.get<{ items: SeriesValue[] }>(`/metrics/${encodeURIComponent(slug)}/${path}`)).items,
      /** Sets or removes 1 to SERIES_ITEMS_MAX periods (their first days): a number sets one, null removes it. All
       * or nothing: a refused item (ZiffrError 422) writes none. Safe to repeat. */
      set: async (slug: string, items: SeriesItem[]): Promise<{ saved: number; removed: number }> => {
        if (!items.length || items.length > SERIES_ITEMS_MAX) throw new Error(`Send 1 to ${SERIES_ITEMS_MAX} items.`);
        return (await this.request<{ saved: number; removed: number }>("POST", `/metrics/${encodeURIComponent(slug)}/${path}`, undefined, { items })).body;
      },
    };
  }

  private async get<T>(path: string, query: Record<string, string | number | string[] | undefined> = {}): Promise<T> {
    return (await this.request<T>("GET", path, query)).body;
  }

  private async *every<T>(page: (cursor: string | undefined) => Promise<Page<T>>): AsyncGenerator<T> {
    let cursor: string | undefined;
    do {
      const p = await page(cursor);
      yield* p.items;
      cursor = p.next ?? undefined;
    } while (cursor);
  }

  private async request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, query?: Record<string, string | number | string[] | undefined>, body?: unknown, idempotencyKey?: string): Promise<{ body: T; headers: Headers }> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, item);
      else if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { authorization: `Bearer ${this.key}`, accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetcher(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (e) {
        throw new ZiffrError(0, "network", `Could not reach Ziffr: ${(e as Error).message}`);
      }
      if (res.ok) return { body: (await res.json()) as T, headers: res.headers };
      const err = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      const retryAfter = res.headers.has("retry-after") ? Number(res.headers.get("retry-after")) : null;
      const error = new ZiffrError(res.status, err?.error?.code ?? "unknown", err?.error?.message ?? `Ziffr answered ${res.status}.`, retryAfter);
      // Only a 429 is retried, and only GETs or submissions with an idempotency key: both are safe to repeat.
      const wait = retryAfter ?? 1;
      if (res.status !== 429 || attempt >= this.maxRetries || wait > this.maxRetryWait || (method !== "GET" && !idempotencyKey)) throw error;
      await sleep(wait * 1000);
    }
  }
}
