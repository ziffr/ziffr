// The API's shapes (spec 0002): every endpoint's input and output as zod schemas. The server validates with them,
// and the OpenAPI document is generated from them, so the description and the server cannot drift apart.
import { z } from "zod";

/** A Metric as a program sees it (GLOSSARY: Metric, Metric Description). */
export const ApiMetric = z.object({
  slug: z.string().describe("Stable id in paths; survives renames of the name."),
  name: z.string(),
  description: z.string(),
  period: z.enum(["day", "week", "month", "quarter", "year"]).describe("How often it has a value: a day, an ISO week, a month, or a quarter or year of the workspace's fiscal year (GET /workspace)."),
  format: z.enum(["number", "currency", "percent"]).describe("How its values are written."),
  unit: z.string().describe("Shown after the value, such as orders or EUR."),
  decimals: z.number().int().min(0).max(6).describe("Decimal places to show."),
  polarity: z.enum(["higher", "lower", "target"]).describe("Whether higher or lower values are better, or a range (target)."),
  aggregation: z.enum(["sum", "average", "last", "none"]).describe("How values combine over longer spans."),
  target_min: z.number().nullable().describe("The low end of its target, if any."),
  target_max: z.number().nullable().describe("The high end of its target, if any."),
  derived: z.boolean().describe("A Derived Metric: computed from others, takes no values."),
});

/** One page of a list; `next` is the cursor for the following page, null on the last. */
export const pageOf = <T extends z.ZodType>(item: T) => z.object({
  items: z.array(item).describe("This page, at most `limit` long."),
  next: z.string().nullable().describe("Pass as `cursor` for the next page; null on the last page."),
});

/** GET /api/v1/metrics answers this. */
export const MetricList = pageOf(ApiMetric);

/** GET /api/v1/metrics/{slug} answers this. */
export const MetricDescription = ApiMetric;

/** A Breakdown row (GLOSSARY: Breakdown): one labelled part of a value. */
export const BreakdownRow = z.object({ label: z.string().describe("What the part is, such as a shop or a channel."), value: z.number() });

/** A Metric's value for one period (GLOSSARY: Observation). */
export const ApiObservation = z.object({
  period: z.string().describe("The period's first day, YYYY-MM-DD."),
  value: z.number().describe("The value shown for the period: the latest when the Metric keeps several."),
  state: z.enum(["recorded", "awaiting_approval", "locked"]).describe("recorded, waiting for Approval, or locked (no more values)."),
  submitter: z.string().nullable().describe("The id of the person who submitted it (see /people); null for a Derived Metric or an import."),
  breakdown: z.array(BreakdownRow).nullable().describe("The value's parts (GLOSSARY: Breakdown), or null."),
});

/** GET /api/v1/metrics/{slug}/observations answers this. */
export const ObservationList = pageOf(ApiObservation);

/** POST /api/v1/metrics takes this (spec 0003): a Metric's description, as GET /api/v1/metrics/{slug} shows one. */
export const CreateMetric = z.object({
  name: z.string().trim().min(1).max(120).describe("What it is called; its slug is made from it."),
  description: z.string().max(2000).optional(),
  unit: z.string().max(20).optional().describe("Shown after the value, such as orders or EUR."),
  format: z.enum(["number", "currency", "percent"]).optional().describe("Default number."),
  decimals: z.number().int().min(0).max(6).optional().describe("Default 0."),
  period: z.enum(["day", "week", "month", "quarter", "year"]).optional().describe("Default month. Quarters and years start from the workspace's year start."),
  submission_rule: z.enum(["reject", "overwrite", "add", "keep_both"]).optional().describe("What a second value for a period does. Default overwrite."),
  polarity: z.enum(["higher", "lower", "target"]).optional().describe("Default higher."),
  aggregation: z.enum(["sum", "average", "last", "none"]).optional().describe("Default sum."),
  target_min: z.number().nullable().optional(),
  target_max: z.number().nullable().optional(),
  submit: z.boolean().optional().describe("Make the key's creator its Submitter, so the key can submit values to it at once."),
}).strict();

/** POST /api/v1/metrics/{slug}/observations takes this. */
export const SubmitObservation = z.object({
  value: z.number().describe("The value. With a breakdown, the total; the rows need not add up to it."),
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("The period's first day, YYYY-MM-DD; the current period if left out."),
  breakdown: z.array(z.object({ label: z.string().trim().min(1).max(200).describe("What the part is."), value: z.number() })).max(500).optional().describe("The value's parts, such as per shop."),
}).strict();

/** POST /api/v1/metrics/{slug}/observations answers this when the value was taken. */
export const SubmissionAnswer = z.object({
  status: z.enum(["recorded", "awaiting_approval"]).describe("recorded, or waiting for Approval as an Unusual Value."),
  period: z.string().describe("The period it was recorded for, YYYY-MM-DD."),
  value: z.number().describe("The period's value now: the Submission Rule may have added it to an earlier one. For a key that may not read metrics, the value sent."),
  detail: z.string().describe("What happened, in words. For a key that may not read metrics, without earlier values."),
});

/** A person or Contact (GLOSSARY: Contact): id and name only, never contact details. */
export const ApiPerson = z.object({ id: z.string().describe("Stable id, as in an observation's submitter."), name: z.string(), contact: z.boolean().describe("A Contact: known to the workspace, no sign-in, only submits values.") });

/** GET /api/v1/people answers this. */
export const PersonList = pageOf(ApiPerson);

/** A Group (GLOSSARY: Group): id and name. */
export const ApiGroup = z.object({ id: z.number().int().describe("Stable id."), name: z.string(), everyone: z.boolean().describe("The Group of everyone in the workspace except Guests.") });

/** GET /api/v1/groups answers this. */
export const GroupList = pageOf(ApiGroup);

// What programs send. A cursor is opaque to programs: the base64url of where the page before ended (see toCursor).
/** A cursor parameter whose inside must match `pattern` (one capture group), or the request is invalid. */
const cursorOf = (pattern: RegExp) => z.string().max(128).optional().transform((c, ctx) => {
  if (c === undefined) return null;
  const m = pattern.exec(Buffer.from(c, "base64url").toString());
  if (!m) { ctx.addIssue({ code: "custom", message: "Not a cursor from this API." }); return z.NEVER; }
  return m[1];
});

const limit = z.coerce.number().int().min(1).max(100).default(50);

/** Paging parameters of lists ordered by a number id. */
export const pageQuery = z.object({ limit, cursor: cursorOf(/^v1:(\d{1,15})$/).transform((c) => (c === null ? null : Number(c))) });

/** Paging parameters of lists ordered by a text id (people). */
export const textPageQuery = z.object({ limit, cursor: cursorOf(/^v1:([A-Za-z0-9_-]{1,64})$/) });

/** A period's first day, as the API writes periods. */
export const periodDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.").refine((d) => !Number.isNaN(Date.parse(d)), "Not a real date.");

/** Paging and range parameters of a Metric's values. */
export const observationsQuery = z.object({ limit, cursor: cursorOf(/^v1:(\d{4}-\d{2}-\d{2})$/), from: periodDate.optional(), to: periodDate.optional() })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "from must not be after to.", path: ["from"] });

/** A Metric's slug from the path: lower-case letters, digits and dashes, as the app makes them. */
export const slugParam = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/, "Not a Metric slug.");

/** The optional Idempotency-Key header of a submission. */
export const IdempotencyKey = z.string().regex(/^[\x21-\x7e]{1,200}$/, "1 to 200 visible ASCII characters.");

/** Every error answer. */
export const ApiErrorBody = z.object({ error: z.object({ code: z.string().describe("Stable; handle errors by it."), message: z.string().describe("For people; may change.") }) });

/** What DELETE /metrics/{slug} needs: the Metric's exact name, so a wrong slug deletes nothing. */
export const deleteMetricQuery = z.object({ confirm: z.string().min(1).max(200).describe("The Metric's exact name, repeated to confirm.") });

/** What DELETE /metrics/{slug} answers: the slug deleted and how many values went with it. */
export const DeletedMetric = z.object({ deleted: z.string(), values: z.number().int().nonnegative() });

// Feeds (spec 0012, GLOSSARY: Feed, Feed Key, Import): what a Feed Key reads and sends.

/** A Metric as its Feed sees it: what to fetch and which periods already have a value, never a value. */
export const FeedMetric = z.object({
  slug: z.string().describe("Name it in a batch item's `metric`."),
  name: z.string(),
  period: z.enum(["day", "week", "month", "quarter", "year"]).describe("How often it has a value; quarters and years start from `year_start_month`."),
  unit: z.string(),
  format: z.enum(["number", "currency", "percent"]),
  decimals: z.number().int().min(0).max(6),
  current: z.string().describe("The current period's first day as Ziffr counts it; earlier periods are one period apart from it."),
  due_working_days: z.number().int().nullable().describe("Working days after a period ends by which its value is due, if its Workflow sets one."),
  filled: z.array(z.string()).describe("First days of the periods that already have a value, oldest first: at most the latest 1,000."),
});

/** GET /api/v1/feed answers this. */
export const FeedOverview = z.object({
  name: z.string().describe("The Feed's name, as values from it show in Ziffr."),
  year_start_month: z.number().int().min(1).max(12).describe("The month the workspace's fiscal year starts in, 1 (January) to 12: where its Metrics' quarters and years start."),
  metrics: pageOf(FeedMetric).describe("The Metrics it submits to and that take API values."),
});

/** GET /api/v1/workspace answers this. */
export const ApiWorkspace = z.object({
  year_start_month: z.number().int().min(1).max(12).describe("The month the workspace's fiscal year starts in, 1 (January) to 12. Quarters and years, of Metrics and Comparisons, start from it."),
});

/** A batch item: one value for one Metric and period. */
export const FeedItem = z.object({
  metric: slugParam.describe("The Metric's slug, as GET /feed lists it."),
  period: periodDate.optional().describe("The period's first day, YYYY-MM-DD; the current period if left out."),
  value: z.number().describe("The value. With a breakdown, the total; the rows need not add up to it."),
  breakdown: z.array(z.object({ label: z.string().trim().min(1).max(200), value: z.number() })).max(500).optional().describe("The value's parts, such as per region."),
}).strict();

/** POST /api/v1/feed/observations takes this. */
export const FeedBatch = z.object({ items: z.array(FeedItem).min(1).max(500).describe("1 to 500 values; each is taken or refused on its own.") }).strict();

/** What became of one item, in the order sent. Its words never hold an earlier value: a Feed may not read values. */
export const FeedItemResult = z.object({
  metric: z.string(),
  period: z.string().nullable().describe("The period it was meant for, YYYY-MM-DD; null when the Metric was not found."),
  status: z.enum(["recorded", "awaiting_approval", "locked", "refused"]).describe("recorded; waiting for Approval as an Unusual Value; locked (it went to the Metric's owner as a proposed Correction); or refused."),
  imported: z.boolean().optional().describe("An Import: a past period that had no value, recorded without the Unusual Value check."),
  code: z.string().optional().describe("Why it was refused: not_found, duplicate, period, derived, source, no_value, no_token."),
  detail: z.string(),
});

/** POST /api/v1/feed/observations answers this. */
export const FeedBatchAnswer = z.object({ results: z.array(FeedItemResult).describe("One per item, in the order sent.") });

// Dashboards and templates (spec 0014; stories folded into dashboards by spec 0013). Metrics are named by slug, dashboards, widgets and team templates by
// number; nothing a program sends is used before it matches these.

/** The views a key may place (GLOSSARY: View, Widget Template): no Free Layout and no composed Finding. */
export const KeyView = z.enum(["number", "line", "bars", "gauge", "table", "forecast", "correlation", "matrix", "drivers", "ranked", "share", "pictogram", "story-line"]).describe("A built-in view; GET /templates?kind=view lists them with what each is for.");

/** The few settings a key may set on a widget. */
export const KeySettings = z.object({
  window: z.number().int().min(1).max(120).optional().describe("Periods shown."),
  showTarget: z.boolean().optional().describe("Draw the target band."),
  showForecast: z.boolean().optional().describe("Draw a forecast (line)."),
  rows: z.number().int().min(1).max(50).optional().describe("Rows shown (history table)."),
}).strict();

const slugList = z.array(z.string().min(1).max(100)).max(50);

/** A Finding's words (GLOSSARY: Finding, Placeholder): plain text, with Placeholders such as {metric} or {change yoy}. */
export const FindingWords = z.object({
  kicker: z.string().max(200).optional().describe("The small line above the headline."),
  headline: z.string().max(200).optional().describe("States the finding, such as \"Churn doubled after the price change\"."),
  subline: z.string().max(200).optional(),
  footnote: z.string().max(500).optional(),
  source: z.string().max(200).optional(),
});

/** A dashboard in a list. */
export const ApiDashboardSummary = z.object({
  id: z.number().int().describe("Stable id."),
  name: z.string(),
  role: z.enum(["owner", "editor", "viewer"]).describe("The key's creator's role on it; only an owner or editor can change it."),
  url: z.string().describe("Where to open it in Ziffr."),
});

/** One widget; a Finding has its words too. */
export const ApiWidget = z.object({
  id: z.number().int(),
  view: z.string().describe("Its built-in view."),
  title: z.string().nullable(),
  metrics: z.array(z.string()).describe("Slugs of the Metrics it draws."),
  x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int(),
  words: FindingWords.optional().describe("A Finding only: its words."),
});

/** A dashboard with its introduction and its widgets in reading order. */
export const ApiDashboard = ApiDashboardSummary.extend({
  intro: z.string().describe("Its introduction, shown above it and first in its Read view; empty when it has none."),
  widgets: z.array(ApiWidget),
});

/** GET /dashboards answers this. */
export const DashboardList = pageOf(ApiDashboardSummary);

/** Paging of GET /dashboards. */
export const dashboardsQuery = pageQuery;

/** A dashboard's, widget's or Finding's id in the path. */
export const idParam = z.coerce.number().int().positive().max(2 ** 31 - 1);

/** POST /dashboards takes this. */
export const CreateDashboard = z.object({
  name: z.string().trim().min(1).max(120),
  intro: z.string().max(4000).optional().describe("An introduction: what it tells, in a sentence or two."),
}).strict();

/** POST /dashboards/from-template takes this. */
export const CreateFromTemplate = z.object({
  template: z.union([z.string().regex(/^[a-z0-9-]{1,40}$/), z.number().int().positive()]).describe("A Dashboard Template's id from GET /templates?kind=dashboard."),
  name: z.string().trim().max(120).optional().describe("Default: the template's name."),
  fills: z.array(slugList.min(1)).max(50).describe("Metric slugs for each Slot, in the template's order: one each, or one or more for a Slot that takes several."),
}).strict();

/** POST /dashboards/{id}/widgets takes this: a built-in view with Metrics, or a team Widget Template with its Slots. */
export const AddWidget = z.object({
  view: KeyView.optional().describe("Default number. Leave out when using `template`."),
  template: z.number().int().positive().optional().describe("A team Widget Template's id from GET /templates?kind=widget."),
  metrics: slugList.optional().describe("With `view`: the Metrics it draws."),
  fills: z.array(slugList.min(1)).max(50).optional().describe("With `template`: Metric slugs for each Slot, in order."),
  title: z.string().max(200).optional(),
  settings: KeySettings.optional(),
}).strict().refine((b) => (b.template === undefined) !== (b.metrics === undefined), { message: "Send `view` and `metrics`, or `template` and `fills`." });

/** PATCH /dashboards/{id}/widgets/{widgetId} takes this. */
export const UpdateWidget = z.object({
  view: KeyView.optional(),
  metrics: slugList.optional(),
  title: z.string().max(200).nullable().optional().describe("null shows the Metric's name."),
  settings: KeySettings.optional(),
}).strict();

/** PATCH /dashboards/{id} takes this. */
export const UpdateDashboard = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  intro: z.string().max(4000).optional(),
}).strict();

/** POST /dashboards/{id}/findings takes this. */
export const AddFinding = FindingWords.extend({ metric: z.string().min(1).max(100).describe("The slug of the Metric it is about.") }).strict();

/** PATCH /dashboards/{id}/findings/{findingId} takes this. */
export const UpdateFinding = FindingWords.strict();

/** What DELETE /dashboards/{id}/widgets/{widgetId} answers. */
export const RemovedWidget = z.object({ removed: z.number().int() });

/** A template a key can build with. */
export const ApiTemplate = z.object({
  id: z.union([z.string(), z.number().int()]).describe("A view's or built-in Dashboard Template's text id, or a team template's number."),
  kind: z.enum(["view", "widget", "dashboard"]).describe("A built-in view, a team Widget Template, or a Dashboard Template."),
  name: z.string(),
  description: z.string(),
  slots: z.array(z.object({
    label: z.string().describe("What to fill it with."),
    multiple: z.boolean().describe("Takes one or more Metrics instead of one."),
    suggested: z.array(z.string()).describe("Slugs it was made with that the key's creator sees."),
  })).describe("Empty for a view, which takes any Metrics."),
});

/** GET /templates answers this. */
export const TemplateList = z.object({ items: z.array(ApiTemplate) });

/** Which templates GET /templates lists. */
export const templatesQuery = z.object({ kind: z.enum(["view", "widget", "dashboard"]).optional() });
