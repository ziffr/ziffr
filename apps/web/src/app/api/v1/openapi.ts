// The API's description (spec 0002, ticket #50): an OpenAPI 3.1 document built from the same zod schemas the server
// validates with, so the two cannot drift apart. Served at /api/v1/openapi.json and rendered into docs/reference/api.md.
import { z } from "zod";
import * as S from "./schemas";

type Endpoint = {
  method: "get" | "post";
  path: string;
  summary: string;
  description: string;
  scope: "metrics:read" | "values:submit" | "metrics:write";
  query?: z.ZodObject;
  body?: z.ZodType;
  idempotent?: boolean;
  /** The success answer's status, its schema's name in `components`, and its schema. */
  ok: { status: 200 | 201; name: string; schema: z.ZodType };
  /** Answers this endpoint gives besides the ones every endpoint may give. */
  errors?: { status: number; description: string }[];
};

/** Every version 1 endpoint, in the order the reference lists them. */
export const ENDPOINTS: Endpoint[] = [
  {
    method: "get", path: "/metrics", scope: "metrics:read", query: S.pageQuery, ok: { status: 200, name: "MetricList", schema: S.MetricList },
    summary: "List Metrics", description: "The Metrics the key's creator sees, oldest first, a page at a time.",
  },
  {
    method: "post", path: "/metrics", scope: "metrics:write", body: S.CreateMetric, idempotent: true, ok: { status: 201, name: "Metric", schema: S.MetricDescription },
    summary: "Create a Metric",
    description: "Creates a Metric owned by the key's creator, checked like one made in the web form; its history names the key. Each key may create 50 Metrics in any 24 hours.",
    errors: [
      { status: 403, description: "Or the key's creator's role may not create Metrics (Guests)." },
      { status: 409, description: "The Idempotency-Key was used with another body, or its first creation is still running." },
    ],
  },
  {
    method: "get", path: "/metrics/{slug}", scope: "metrics:read", ok: { status: 200, name: "Metric", schema: S.MetricDescription },
    summary: "Describe a Metric", description: "One Metric's description: period, format, unit, Polarity and target. A Metric the key's creator may not see is not found.",
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
    method: "get", path: "/people", scope: "metrics:read", query: S.textPageQuery, ok: { status: 200, name: "PersonList", schema: S.PersonList },
    summary: "List people", description: "The workspace's people and Contacts: id and name only, never contact details.",
  },
  {
    method: "get", path: "/groups", scope: "metrics:read", query: S.pageQuery, ok: { status: 200, name: "GroupList", schema: S.GroupList },
    summary: "List Groups", description: "The workspace's Groups: id and name.",
  },
];

/** Answers every endpoint may give. */
const COMMON_ERRORS = [
  { status: 400, description: "`invalid_request`: the query, path or body does not match." },
  { status: 401, description: "`unauthorized`: no key, or one that ended, was revoked, or whose creator left." },
  { status: 403, description: "`forbidden`: the key lacks the scope." },
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
    if (e.path.includes("{slug}")) parameters.push({ name: "slug", in: "path", required: true, description: "The Metric's slug.", schema: json(S.slugParam, "input") });
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
      description: "Read the Metrics an Access Key's creator sees and submit values, with the key in `Authorization: Bearer <key>`. Version 1 does not change in ways that break a client.",
      license: { name: "BUSL-1.1", identifier: "BUSL-1.1" },
    },
    servers: [{ url: "/api/v1" }],
    paths,
    components: { schemas, securitySchemes: { accessKey: { type: "http", scheme: "bearer", description: "An Access Key, made on the Team page." } } },
  };
}

const QUERY_TEXT: Record<string, string> = {
  limit: "Items per page, 1 to 100.",
  cursor: "The `next` of the page before. Opaque.",
  from: "The first period, YYYY-MM-DD.",
  to: "The last period, YYYY-MM-DD.",
};
