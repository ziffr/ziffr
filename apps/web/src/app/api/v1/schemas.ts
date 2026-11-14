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

/** Every error answer. */
export const ApiErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
