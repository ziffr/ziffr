// The API's shapes (spec 0002): every endpoint's input and output as zod schemas. The server validates with them,
// and the OpenAPI document is generated from them, so the description and the server cannot drift apart.
import { z } from "zod";

/** A Metric as a program sees it (GLOSSARY: Metric, Metric Description). */
export const ApiMetric = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  period: z.enum(["day", "week", "month"]),
  format: z.string(),
  unit: z.string(),
  decimals: z.number().int(),
  polarity: z.string(),
  aggregation: z.string(),
  target_min: z.number().nullable(),
  target_max: z.number().nullable(),
  derived: z.boolean().describe("A Derived Metric: computed from others, takes no values."),
});

/** One page of a list; `next` is the cursor for the following page, null on the last. */
export const pageOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), next: z.string().nullable() });

/** GET /api/v1/metrics answers this. */
export const MetricList = pageOf(ApiMetric);

/** GET /api/v1/metrics/{slug} answers this. */
export const MetricDescription = ApiMetric;

/** A Breakdown row (GLOSSARY: Breakdown): one labelled part of a value. */
export const BreakdownRow = z.object({ label: z.string(), value: z.number() });

/** A Metric's value for one period (GLOSSARY: Observation). */
export const ApiObservation = z.object({
  period: z.string().describe("The period's first day, YYYY-MM-DD."),
  value: z.number().describe("The value shown for the period: the latest when the Metric keeps several."),
  state: z.enum(["recorded", "awaiting_approval", "locked"]).describe("recorded, waiting for Approval, or locked (no more values)."),
  submitter: z.string().nullable().describe("The id of the person who submitted it (see /people); null for a Derived Metric or an import."),
  breakdown: z.array(BreakdownRow).nullable(),
});

/** GET /api/v1/metrics/{slug}/observations answers this. */
export const ObservationList = pageOf(ApiObservation);

/** A person or Contact (GLOSSARY: Contact): id and name only, never contact details. */
export const ApiPerson = z.object({ id: z.string(), name: z.string(), contact: z.boolean().describe("A Contact: known to the workspace, no sign-in, only submits values.") });

/** GET /api/v1/people answers this. */
export const PersonList = pageOf(ApiPerson);

/** A Group (GLOSSARY: Group): id and name. */
export const ApiGroup = z.object({ id: z.number().int(), name: z.string(), everyone: z.boolean().describe("The Group of everyone in the workspace except Guests.") });

/** GET /api/v1/groups answers this. */
export const GroupList = pageOf(ApiGroup);

/** Every error answer. */
export const ApiErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
