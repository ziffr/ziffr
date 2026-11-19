// The API's description (spec 0002, ticket #50): an OpenAPI 3.1 document built from the same zod schemas the server
// validates with, so the two cannot drift apart. Served at /api/v1/openapi.json and rendered into docs/reference/api.md.
import { z } from "zod";
import type { FEED_SCOPE, Scope } from "@ziffr/core/actor";
import * as S from "./schemas";

type Endpoint = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  description: string;
  scope: Scope | typeof FEED_SCOPE;
  query?: z.ZodObject;
  body?: z.ZodType;
  idempotent?: boolean;
  /** The success answer's status, its schema's name in `components`, and its schema. */
  ok: { status: 200 | 201; name: string; schema: z.ZodType };
  /** Answers this endpoint gives besides the ones every endpoint may give. */
  errors?: { status: number; description: string }[];
};

/** Every version 1 endpoint, in the order the reference lists them. */
const ENDPOINTS: Endpoint[] = [
  {
    method: "get", path: "/metrics", scope: "metrics:read", query: S.pageQuery, ok: { status: 200, name: "MetricList", schema: S.MetricList },
    summary: "List Metrics", description: "The Metrics the key's creator sees, oldest first, a page at a time.",
  },
  {
    method: "post", path: "/metrics", scope: "metrics:write", body: S.CreateMetric, idempotent: true, ok: { status: 201, name: "Metric", schema: S.MetricDescription },
    summary: "Create a Metric",
    description: "Creates a Metric owned by the key's creator, checked like one made in the web form; its history names the key. `sources` sets how values may arrive (every Source when left out); `submitters` names who sends them, people and Contacts from GET /people and Feeds from GET /feeds, each with a first Prompt, and needs the scope metrics:edit as well. Each key may create 50 Metrics in any 24 hours.",
    errors: [
      { status: 403, description: "Or the key's creator's role may not create Metrics (Guests), or `submitters` without the scope metrics:edit." },
      { status: 422, description: "A Source or Submitter that is not one of the workspace's; checked first, so no Metric was created." },
      { status: 409, description: "The Idempotency-Key was used with another body, or its first creation is still running." },
    ],
  },
  {
    method: "get", path: "/metrics/{slug}", scope: "metrics:read", ok: { status: 200, name: "Metric", schema: S.MetricDescription },
    summary: "Describe a Metric", description: "One Metric's description: period, format, unit, Polarity and target. A Metric the key's creator may not see is not found.",
  },
  {
    method: "delete", path: "/metrics/{slug}", scope: "metrics:write", query: S.deleteMetricQuery, ok: { status: 200, name: "DeletedMetric", schema: S.DeletedMetric },
    summary: "Delete a Metric",
    description: "Deletes a Metric the key's creator owns, with its values, targets, questions and form links, as in the app: refused while another Metric's formula, a widget, a deck or a working View Link uses it. The Audit Log names the key.",
    errors: [
      { status: 403, description: "Or the key's creator sees the Metric but does not own it." },
      { status: 422, description: "The name does not match, or something still uses the Metric; nothing was deleted." },
    ],
  },
  {
    method: "patch", path: "/metrics/{slug}", scope: "metrics:edit", body: S.UpdateMetric, ok: { status: 200, name: "Metric", schema: S.MetricDescription },
    summary: "Change a Metric's Target Range or Sources",
    description: "Changes a Metric's Sources (all of them: the ones left out are turned off), Polarity, Target Range or Attainment method as the key's creator, only when they own it or are its Editor, as on its page. Each part left out stays. Its name and description are changed only in Ziffr. The Metric's history keeps the change under the key's name.",
    errors: [
      { status: 403, description: "Or the key's creator sees the Metric but may not change it, or their role may not create (Guests)." },
      { status: 422, description: "The lower target is above the upper one, or Sources for a Derived Metric; nothing was changed." },
    ],
  },
  {
    method: "get", path: "/metrics/{slug}/observations", scope: "metrics:read", query: S.observationsQuery, ok: { status: 200, name: "ObservationList", schema: S.ObservationList },
    summary: "List a Metric's values",
    description: "The Metric's values for the periods from `from` to `to` (first days, both included), oldest first, with state, submitter and Breakdown. A Derived Metric's values are computed.",
  },
  {
    method: "post", path: "/metrics/{slug}/observations", scope: "values:submit", body: S.SubmitObservation, idempotent: true, ok: { status: 201, name: "Submission", schema: S.SubmissionAnswer },
    summary: "Submit a value",
    description: "Records a value for the current period, or the one named, through the Metric's Submission Rule, Locks and Approvals, as the key's creator. Each key may submit 1,000 values in any 24 hours.",
    errors: [
      { status: 403, description: "Or the key's creator does not submit values for this Metric." },
      { status: 409, description: "The Idempotency-Key was used with another body, or its first submission is still running." },
      { status: 422, description: "`locked`: the period is locked, and the value went to the Metric's owner as a proposed Correction. `unprocessable`: the Submission Rule, a Derived Metric or the period refused it." },
    ],
  },
  {
    method: "get", path: "/metrics/{slug}/target-series", scope: "metrics:read", ok: { status: 200, name: "SeriesList", schema: S.SeriesList },
    summary: "List a Metric's Target Series",
    description: "Target values for single periods, such as a monthly budget; where a period has none, the Target Range applies. Every period that has one, oldest first.",
  },
  {
    method: "post", path: "/metrics/{slug}/target-series", scope: "metrics:edit", body: S.SetSeries, ok: { status: 200, name: "SeriesAnswer", schema: S.SeriesAnswer },
    summary: "Set a Metric's Target Series",
    description: "Sets or removes 1 to 500 periods: a number sets the period's value, null removes it. Each period is its first day. Every item is checked before anything is written, as the key's creator, only when they own the Metric or are its Editor.",
    errors: [
      { status: 403, description: "Or the key's creator sees the Metric but may not change it, or their role may not create (Guests)." },
      { status: 422, description: "A period that is not one of the Metric's period starts; nothing was written." },
    ],
  },
  {
    method: "get", path: "/metrics/{slug}/projections", scope: "metrics:read", ok: { status: 200, name: "SeriesList", schema: S.SeriesList },
    summary: "List a Metric's Projections",
    description: "Values for periods not over yet, from an outside forecast, always shown as projections and never as values. Every period that has one, oldest first.",
  },
  {
    method: "post", path: "/metrics/{slug}/projections", scope: "metrics:edit", body: S.SetSeries, ok: { status: 200, name: "SeriesAnswer", schema: S.SeriesAnswer },
    summary: "Set a Metric's Projections",
    description: "Sets or removes 1 to 500 periods of the current period or later: a number sets the period's value, null removes it. Each period is its first day. Every item is checked before anything is written, as the key's creator, only when they own the Metric or are its Editor.",
    errors: [
      { status: 403, description: "Or the key's creator sees the Metric but may not change it, or their role may not create (Guests)." },
      { status: 422, description: "A period that is not one of the Metric's period starts, or one that is over; nothing was written." },
    ],
  },
  {
    method: "get", path: "/metrics/{slug}/submitters", scope: "metrics:read", ok: { status: 200, name: "SubmitterList", schema: S.SubmitterList },
    summary: "List a Metric's Submitters", description: "Who sends in the Metric's values: people, Contacts and Feeds, by id, name and kind. Never contact details, and not their Stand-ins.",
  },
  {
    method: "post", path: "/metrics/{slug}/submitters", scope: "metrics:edit", body: S.ChangeSubmitters, ok: { status: 200, name: "SubmittersChanged", schema: S.SubmittersChanged },
    summary: "Change a Metric's Submitters",
    description: "Adds and removes up to 20 Submitters each, as the key's creator, only when they own the Metric or are its Editor, as on its page. A person or Contact added gets a Token and a first Prompt, unless already asked for this Metric in the last 24 hours or five times that day; a Feed added turns the API Source on. Removing one ends their Token and their Stand-ins' on it; earlier values stay. Everything is checked first.",
    errors: [
      { status: 403, description: "Or the key's creator sees the Metric but may not change it, or their role may not create (Guests)." },
      { status: 422, description: "An id that is not one of the workspace's people, Contacts or Feeds, or a Derived Metric; nothing was changed." },
    ],
  },
  {
    method: "get", path: "/feeds", scope: "metrics:edit", ok: { status: 200, name: "FeedList", schema: S.FeedList },
    summary: "List Feeds", description: "The workspace's live Feeds by id and name, to name one as a Submitter. Not /feed, which a Feed Key uses.",
  },
  {
    method: "get", path: "/metrics/{slug}/unusual-value-check", scope: "metrics:read", ok: { status: 200, name: "UnusualValueCheck", schema: S.UnusualValueCheck },
    summary: "Describe a Metric's Unusual Value check",
    description: "What makes a value unusual in the Metric's Workflow: a change beyond a per cent on the period before, and whether a value outside the Target Range is too. With the Workflow's name, whether the key's creator owns it, and how many Metrics they see share it.",
  },
  {
    method: "patch", path: "/metrics/{slug}/unusual-value-check", scope: "metrics:edit", body: S.UpdateUnusualValueCheck, ok: { status: 200, name: "UnusualValueCheck", schema: S.UnusualValueCheck },
    summary: "Change a Metric's Unusual Value check",
    description: "Changes the check step of the Metric's Workflow. It changes the Workflow, so every Metric that shares it. Only the Workflow's owner may, as in the Workflow editor; its history names the key. Steps are added or removed only in Ziffr.",
    errors: [
      { status: 403, description: "Or the key's creator does not own the Workflow, or their role may not create (Guests)." },
      { status: 422, description: "The Metric has no Workflow, or its Workflow has no check step." },
    ],
  },
  {
    method: "get", path: "/feed", scope: "feed:submit", query: S.pageQuery, ok: { status: 200, name: "FeedOverview", schema: S.FeedOverview },
    summary: "Describe the Feed",
    description: "For a Feed Key only (spec 0012): the Feed's name and the Metrics it submits to that take API values, with the periods that already have a value, so a Feed knows what to fetch and what is missing. Never a value.",
    errors: [{ status: 403, description: "Or the key is a person's Access Key, not a Feed Key." }],
  },
  {
    method: "post", path: "/feed/observations", scope: "feed:submit", body: S.FeedBatch, idempotent: true, ok: { status: 200, name: "FeedBatchAnswer", schema: S.FeedBatchAnswer },
    summary: "Submit a Feed's values",
    description: "For a Feed Key only: 1 to 500 values, each through its Metric's Submission Rule, Locks and Approvals, with one result per item in order, so one refused item does not stop the rest. A value for a past period that has none yet is an Import: it is recorded without the Unusual Value check and marked as imported. The body may be 1 MB. Each Feed may record 10,000 values in any 24 hours over all its keys; a batch that would cross that is refused whole.",
    errors: [
      { status: 403, description: "Or the key is a person's Access Key, not a Feed Key." },
      { status: 409, description: "The Idempotency-Key was used with another body, or its first batch is still running." },
    ],
  },
  {
    method: "get", path: "/workspace", scope: "metrics:read", ok: { status: 200, name: "Workspace", schema: S.ApiWorkspace },
    summary: "Describe the workspace",
    description: "The month the workspace's fiscal year starts in, which every quarterly and yearly Metric's periods start from: with April, a quarterly Metric's periods start on 1 April, 1 July, 1 October and 1 January, and its year is named FY 2026/27.",
  },
  {
    method: "get", path: "/people", scope: "metrics:read", query: S.textPageQuery, ok: { status: 200, name: "PersonList", schema: S.PersonList },
    summary: "List people", description: "The workspace's people and Contacts: id and name only, never contact details.",
  },
  {
    method: "get", path: "/groups", scope: "metrics:read", query: S.pageQuery, ok: { status: 200, name: "GroupList", schema: S.GroupList },
    summary: "List Groups", description: "The workspace's Groups: id and name.",
  },
  {
    method: "get", path: "/dashboards", scope: "dashboards:read", query: S.pageQuery, ok: { status: 200, name: "DashboardList", schema: S.DashboardList },
    summary: "List dashboards", description: "The dashboards the key's creator sees, by id, with their role on each and the link to open it.",
  },
  {
    method: "post", path: "/dashboards", scope: "dashboards:write", body: S.CreateDashboard, idempotent: true, ok: { status: 201, name: "Dashboard", schema: S.ApiDashboard },
    summary: "Create a dashboard",
    description: "Creates an empty dashboard owned by the key's creator, with an introduction if given. The Audit Log names the key. Each key may create 50 dashboards in any 24 hours.",
    errors: [
      { status: 403, description: "Or the key's creator's role may not create (Guests)." },
      { status: 409, description: "The Idempotency-Key was used with another body, or its first creation is still running." },
    ],
  },
  {
    method: "post", path: "/dashboards/from-template", scope: "dashboards:write", body: S.CreateFromTemplate, idempotent: true, ok: { status: 201, name: "Dashboard", schema: S.ApiDashboard },
    summary: "Make a dashboard from a Dashboard Template",
    description: "Makes a whole dashboard owned by the key's creator from a Dashboard Template, with Metrics for each Slot. It is an independent copy. Counts towards the 50 new dashboards a day.",
    errors: [
      { status: 403, description: "Or the key's creator's role may not create (Guests)." },
      { status: 409, description: "The Idempotency-Key was used with another body, or its first creation is still running." },
      { status: 422, description: "No such template, a Slot not filled, or a Metric the key's creator does not see." },
    ],
  },
  {
    method: "get", path: "/dashboards/{id}", scope: "dashboards:read", ok: { status: 200, name: "Dashboard", schema: S.ApiDashboard },
    summary: "Describe a dashboard",
    description: "One dashboard with its introduction and its widgets (Findings with their words) in reading order. Metrics are named by slug; values are read per Metric.",
  },
  {
    method: "patch", path: "/dashboards/{id}", scope: "dashboards:write", body: S.UpdateDashboard, ok: { status: 200, name: "Dashboard", schema: S.ApiDashboard },
    summary: "Change a dashboard's name or introduction", description: "Changes the words above a dashboard: its name, and the introduction shown above it and first in its Read view.",
  },
  {
    method: "post", path: "/dashboards/{id}/widgets", scope: "dashboards:write", body: S.AddWidget, ok: { status: 201, name: "Widget", schema: S.ApiWidget },
    summary: "Add a widget",
    description: "Adds a widget to a dashboard the key's creator may change, in the first free place in reading order: a built-in view with Metrics, or a team Widget Template with its Slots filled. The dashboard's history names the key. Each key may make 500 changes in any 24 hours.",
    errors: [{ status: 422, description: "A view a key may not place (add a Finding with POST /dashboards/{id}/findings), or a Metric the key's creator does not see." }],
  },
  {
    method: "patch", path: "/dashboards/{id}/widgets/{widgetId}", scope: "dashboards:write", body: S.UpdateWidget, ok: { status: 200, name: "Widget", schema: S.ApiWidget },
    summary: "Change a widget",
    description: "Changes a widget's view, Metrics, title or settings. A Free Layout is changed only in Ziffr.",
    errors: [{ status: 422, description: "A view a key may not use, a widget only Ziffr changes, or a Metric the key's creator does not see." }],
  },
  {
    method: "delete", path: "/dashboards/{id}/widgets/{widgetId}", scope: "dashboards:write", ok: { status: 200, name: "RemovedWidget", schema: S.RemovedWidget },
    summary: "Remove a widget or Finding", description: "Removes a widget or a Finding from a dashboard. The history keeps it, so it can be restored.",
  },
  {
    method: "post", path: "/dashboards/{id}/findings", scope: "dashboards:write", body: S.AddFinding, ok: { status: 201, name: "Widget", schema: S.ApiWidget },
    summary: "Add a Finding",
    description: "Adds a Finding about one Metric below everything on a dashboard, full width, with its words. Words may hold Placeholders such as {metric} or {change yoy}; empty ones fall back to words drawn from the data.",
    errors: [{ status: 422, description: "A Metric the key's creator does not see." }],
  },
  {
    method: "patch", path: "/dashboards/{id}/findings/{findingId}", scope: "dashboards:write", body: S.UpdateFinding, ok: { status: 200, name: "Widget", schema: S.ApiWidget },
    summary: "Change a Finding's words", description: "Changes a Finding's kicker, headline, subline, footnote or source. An empty text falls back to words drawn from the data.",
    errors: [{ status: 422, description: "A widget that is not a Finding: only a Finding has words." }],
  },
  {
    method: "get", path: "/templates", scope: "dashboards:read", query: S.templatesQuery, ok: { status: 200, name: "TemplateList", schema: S.TemplateList },
    summary: "List templates",
    description: "What a key can build with: the built-in views, the team's Widget Templates and the Dashboard Templates, with their Slots and the Metrics suggested for each that the key's creator sees.",
  },
];

/** Path parameters by name. */
const PATH_PARAMS: Record<string, { description: string; schema: z.ZodType }> = {
  slug: { description: "The Metric's slug.", schema: S.slugParam },
  id: { description: "The dashboard's id.", schema: S.idParam },
  widgetId: { description: "The widget's or Finding's id.", schema: S.idParam },
  findingId: { description: "The Finding's id.", schema: S.idParam },
};

/** Answers every endpoint may give. */
const COMMON_ERRORS = [
  { status: 400, description: "`invalid_request`: the query, path or body does not match." },
  { status: 401, description: "`unauthorized`: no key, or one that ended, was revoked, or whose creator left." },
  { status: 403, description: "`forbidden`: the key lacks the scope, or a Feed Key called an endpoint for people's keys." },
  { status: 404, description: "`not_found`: nothing here the key's creator may see." },
  { status: 429, description: "`rate_limited`: too many calls; wait for `Retry-After` seconds." },
  { status: 500, description: "`internal`: something went wrong on the server." },
];

const json = (schema: z.ZodType, io: "input" | "output" = "output") => {
  const out = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Record<string, unknown>;
  delete out.$schema; // the document says once which JSON Schema it uses
  return out;
};

/** The OpenAPI 3.1 document of version 1. */
export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  const schemas: Record<string, unknown> = { Error: json(S.ApiErrorBody) };
  for (const e of ENDPOINTS) {
    schemas[e.ok.name] = json(e.ok.schema);
    const parameters: unknown[] = [];
    for (const [, name] of e.path.matchAll(/\{(\w+)\}/g)) parameters.push({ name, in: "path", required: true, description: PATH_PARAMS[name].description, schema: json(PATH_PARAMS[name].schema, "input") });
    if (e.query) {
      const q = json(e.query, "input") as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
      for (const [name, schema] of Object.entries(q.properties ?? {})) {
        const { description, ...rest } = schema;
        parameters.push({ name, in: "query", required: (q.required ?? []).includes(name), description: description ?? QUERY_TEXT[name], schema: rest });
      }
    }
    if (e.idempotent) parameters.push({ name: "Idempotency-Key", in: "header", required: false, description: "A repeat with the same key and body within 24 hours gets the first answer, with `Idempotent-Replayed: true`.", schema: json(S.IdempotencyKey, "input") });
    const responses: Record<string, unknown> = { [e.ok.status]: { description: e.ok.status === 201 ? "Taken." : "OK.", content: { "application/json": { schema: { $ref: `#/components/schemas/${e.ok.name}` } } } } };
    for (const err of [...COMMON_ERRORS, ...(e.errors ?? [])].sort((a, b) => a.status - b.status)) {
      const prev = responses[err.status] as { description: string } | undefined;
      responses[err.status] = {
        description: prev ? `${prev.description} ${err.description}` : err.description,
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        ...(err.status === 429 ? { headers: { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } } } : {}),
      };
    }
    (paths[e.path] ??= {})[e.method] = {
      operationId: `${e.method}${e.path.replace(/\{(\w+)\}/g, "By_$1").split("/").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("")}`,
      summary: e.summary, description: e.description,
      security: [{ accessKey: [] }], "x-scope": e.scope,
      ...(parameters.length ? { parameters } : {}),
      ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: json(e.body, "input") } } } } : {}),
      responses,
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Ziffr API", version: "1",
      description: "Read the Metrics an Access Key's creator sees and submit values, set their targets and Projections, and build dashboards as them, with the key in `Authorization: Bearer <key>`. A Feed Key (spec 0012) uses only the `/feed` endpoints. Version 1 does not change in ways that break a client.",
      license: { name: "BUSL-1.1", identifier: "BUSL-1.1" },
    },
    servers: [{ url: "/api/v1" }],
    paths,
    components: { schemas, securitySchemes: { accessKey: { type: "http", scheme: "bearer", description: "An Access Key, made in Settings, or a Feed Key, made for a Feed on the Team page." } } },
  };
}

const QUERY_TEXT: Record<string, string> = {
  limit: "Items per page, 1 to 100.",
  cursor: "The `next` of the page before. Opaque.",
  from: "The first period, YYYY-MM-DD.",
  to: "The last period, YYYY-MM-DD.",
};
