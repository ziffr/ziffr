// /api/v1/metrics/{slug}/thread?period= (ticket #407; GLOSSARY: Thread): GET reads the Threads on one period of a Metric
// (scope metrics:read), only those the key's creator may read, through the same core rules as the app.
import { getThreads } from "@ziffr/core/api";
import { json, keyRoute, query } from "@/lib/api";
import { slugParam, ThreadAnswer, threadQuery } from "../../../schemas";

type Ctx = { params: Promise<{ slug: string }> };

/** The readable Threads on one period of one visible Metric, with authors, times and words. */
export const GET = keyRoute("metrics:read", async (actor, req, ctx: Ctx) => {
  const slug = slugParam.parse((await ctx.params).slug);
  const { period } = threadQuery.parse(query(req));
  return json(ThreadAnswer.parse(await getThreads(actor, slug, period)));
});
