// @ziffr/sdk (spec 0002, ticket #51; GLOSSARY: Access Key, Metric, Observation): typed calls to the Ziffr API. It
// knows only HTTP and the API's published shapes, nothing of the server. Safe by default: it waits out a 429 as the
// server's Retry-After says, and every submission carries an idempotency key, so a retry never records a value twice.

/** A Metric's description, as `GET /metrics/{slug}` answers it. */
export type Metric = {
  slug: string;
  name: string;
  description: string;
  period: "day" | "week" | "month";
  format: "number" | "currency" | "percent";
  unit: string;
  decimals: number;
  polarity: "higher" | "lower" | "target";
  aggregation: "sum" | "average" | "last" | "none";
  target_min: number | null;
  target_max: number | null;
  /** A Derived Metric: computed from others, takes no values. */
  derived: boolean;
};

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
  format?: Metric["format"];
  decimals?: number;
  period?: Metric["period"];
  submission_rule?: "reject" | "overwrite" | "add" | "keep_both";
  polarity?: Metric["polarity"];
  aggregation?: Metric["aggregation"];
  target_min?: number | null;
  target_max?: number | null;
  submit?: boolean;
};

/** What a submission sends. */
export type SubmitValue = { value: number; period?: string; breakdown?: BreakdownRow[] };

/** What became of a value that was taken. */
export type Submission = { status: "recorded" | "awaiting_approval"; period: string; value: number; detail: string; replayed: boolean };

/** Paging options of every list. */
export type PageOptions = { limit?: number; cursor?: string };

/** Options of a Metric's values: the periods from `from` to `to` (first days, YYYY-MM-DD, both included). */
export type ObservationOptions = PageOptions & { from?: string; to?: string };

/** Settings of a client. */
export type ZiffrOptions = {
  /** Where Ziffr runs, such as https://ziffr.example.com (the API is under /api/v1). */
  url: string;
  /** An Access Key, made on the Team page. */
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
  };

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

  /** The workspace's people and Contacts. */
  readonly people = {
    /** One page of people. */
    list: (options: PageOptions = {}) => this.get<Page<Person>>("/people", options),
    /** Everyone, page by page. */
    all: () => this.every<Person>((cursor) => this.people.list({ cursor, limit: 100 })),
  };

  /** The workspace's Groups. */
  readonly groups = {
    /** One page of Groups. */
    list: (options: PageOptions = {}) => this.get<Page<Group>>("/groups", options),
    /** Every Group, page by page. */
    all: () => this.every<Group>((cursor) => this.groups.list({ cursor, limit: 100 })),
  };

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

  private async request<T>(method: "GET" | "POST", path: string, query?: Record<string, string | number | undefined>, body?: unknown, idempotencyKey?: string): Promise<{ body: T; headers: Headers }> {
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
