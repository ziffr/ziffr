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
};

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
  breakdown: BreakdownRow[] | null;
};

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
};

/** What `metrics.update` may change of a Metric (scope metrics:edit): its Polarity, Target Range and Attainment method.
 * Each part left out stays; null clears an end of the Target Range or the Metric's own method. */
export type MetricPatch = {
  /** Its Sources, all of them: the ones left out are turned off. */
  sources?: Source[];
  polarity?: "higher" | "lower" | "target";
  target_min?: number | null;
  target_max?: number | null;
  attainment_method?: "ratio" | "distance" | null;
};

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
export type Submission = { status: "recorded" | "awaiting_approval"; period: string; value: number; detail: string; replayed: boolean };

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

/** What GET /workspace answers: the month the workspace's fiscal year starts in, 1 (January) to 12. */
export type Workspace = { year_start_month: number };

/** One duty in a Schedule: a value to submit, an Approval waiting, or a Task or Question assigned to the person. */
export type ScheduleEntry = {
  kind: "value_due" | "approval" | "task" | "question";
  /** The day it falls on (YYYY-MM-DD); null for an undated Task or Question. */
  date: string | null;
  overdue: boolean;
  /** Working days (Saturdays and Sundays skipped) it is late; 0 when it is not. */
  overdue_working_days: number;
  metric: { slug: string; name: string };
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
export type Schedule = { today: string; overdue: ScheduleEntry[]; days: { date: string; entries: ScheduleEntry[] }[]; undated: ScheduleEntry[] };

/** One value in a Feed's batch; `period` is the period's first day, the current period if left out. */
export type FeedItem = { metric: string; period?: string; value: number; breakdown?: BreakdownRow[] };

/** What became of one item of a batch. `imported` marks an Import: a past period that had no value, recorded
 * without the Unusual Value check. `code` says why an item was refused. */
export type FeedItemResult = { metric: string; period: string | null; status: "recorded" | "awaiting_approval" | "locked" | "refused"; imported?: boolean; code?: string; detail: string };

/** At most this many items in one batch. */
export const FEED_BATCH_MAX = 500;

/** A dashboard in a list (spec 0014): the key's creator's role on it and where to open it. */
export type DashboardSummary = { id: number; name: string; role: "owner" | "editor" | "viewer"; url: string };

/** A Finding's words; Placeholders such as {metric} or {change yoy} are filled in when it is drawn. */
export type FindingWords = { kicker?: string; headline?: string; subline?: string; footnote?: string; source?: string };

/** One widget: its view, the slugs of the Metrics it draws and where it sits; a Finding has its words too. */
export type Widget = { id: number; view: string; title: string | null; metrics: string[]; x: number; y: number; w: number; h: number; words?: FindingWords; display?: DisplayPeriod };

/** A dashboard with its introduction and its widgets in reading order. */
export type Dashboard = DashboardSummary & { intro: string; widgets: Widget[] };

/** The built-in views a key may place. */
export type View = "number" | "line" | "bars" | "gauge" | "table" | "forecast" | "correlation" | "matrix" | "drivers" | "ranked" | "share" | "pictogram" | "story-line";

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
    /** One page of Metrics. */
    list: (options: PageOptions = {}) => this.get<Page<Metric>>("/metrics", options),
    /** Every Metric, page by page. */
    all: () => this.every<Metric>((cursor) => this.metrics.list({ cursor, limit: 100 })),
    /** One Metric's description. */
    get: (slug: string) => this.get<Metric>(`/metrics/${encodeURIComponent(slug)}`),
    /** Creates a Metric owned by the key's creator (scope metrics:write). A fresh idempotency key is sent unless one is
     * given; pass your own to make retries across runs of your program safe too. */
    create: async (metric: NewMetric, options: { idempotencyKey?: string } = {}): Promise<Metric & { replayed: boolean }> => {
      const { body, headers } = await this.request<Metric>("POST", "/metrics", undefined, metric, options.idempotencyKey ?? newIdempotencyKey());
      return { ...body, replayed: headers.get("idempotent-replayed") === "true" };
    },
    /** Deletes a Metric the key's creator owns (scope metrics:write), repeating its exact name to confirm. Refused
     * (ZiffrError 422) while another Metric's formula, a widget, a deck or a working View Link uses it. */
    delete: async (slug: string, confirmName: string): Promise<{ deleted: string; values: number }> =>
      (await this.request<{ deleted: string; values: number }>("DELETE", `/metrics/${encodeURIComponent(slug)}`, { confirm: confirmName })).body,
    /** Changes a Metric's Polarity, Target Range or Attainment method (scope metrics:edit), when
     * the key's creator owns it or is its Editor. Answers the Metric as it is now. */
    update: async (slug: string, patch: MetricPatch): Promise<Metric> => (await this.request<Metric>("PATCH", `/metrics/${encodeURIComponent(slug)}`, undefined, patch)).body,
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

  /** The month the workspace's fiscal year starts in (1 is January): where quarterly and yearly Metrics' periods start. */
  workspace = (): Promise<Workspace> => this.get<Workspace>("/workspace");

  /** What the key's creator has to do, by day (scope metrics:read). `from` and `to` are days, YYYY-MM-DD, at most 90
   * days apart; this week when left out. */
  schedule = (span: { from?: string; to?: string } = {}): Promise<Schedule> => this.get<Schedule>("/schedule", span);

  /** The workspace's people and Contacts. */
  readonly people = {
    /** One page of people. */
    list: (options: PageOptions = {}) => this.get<Page<Person>>("/people", options),
    /** Everyone, page by page. */
    all: () => this.every<Person>((cursor) => this.people.list({ cursor, limit: 100 })),
  };

  /** The workspace's live Feeds by id and name, to name one as a Submitter (scope metrics:edit). */
  feeds = async (): Promise<{ id: string; name: string }[]> => (await this.get<{ items: { id: string; name: string }[] }>("/feeds")).items;

  /** The workspace's Groups. */
  readonly groups = {
    /** One page of Groups. */
    list: (options: PageOptions = {}) => this.get<Page<Group>>("/groups", options),
    /** Every Group, page by page. */
    all: () => this.every<Group>((cursor) => this.groups.list({ cursor, limit: 100 })),
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

  private async get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
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

  private async request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, query?: Record<string, string | number | undefined>, body?: unknown, idempotencyKey?: string): Promise<{ body: T; headers: Headers }> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
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
