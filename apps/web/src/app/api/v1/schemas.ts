// The API's shapes (spec 0002): every endpoint's input and output as zod schemas. The server validates with them,
// and the OpenAPI document is generated from them, so the description and the server cannot drift apart.
import { z } from "zod";

/** A Metric as a program sees it (GLOSSARY: Metric, Metric Description). */
export const ApiMetric = z.object({
  slug: z.string().describe("Stable id in paths; survives renames of the name."),
  name: z.string(),
  description: z.string(),
  period: z.enum(["day", "week", "month"]).describe("How often it has a value."),
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
