// /api/v1/metrics/{slug}/unusual-value-check (ticket #211; GLOSSARY: Unusual Value, Workflow). GET: what makes a
// value unusual in the Metric's Workflow (scope metrics:read). PATCH: changes that check (scope metrics:edit), which
// changes the Workflow and so every Metric sharing it: only its owner may, as in the Workflow editor.
import { Forbidden } from "@ziffr/core/actor";
import { MetricChangeRefused, setUnusualValueCheckWithKey, unusualValueCheckWithKey } from "@ziffr/core/api-metrics";
import { apiError, json, jsonBody, keyRoute } from "@/lib/api";
import { slugParam, UnusualValueCheck, UpdateUnusualValueCheck } from "../../../schemas";

type Ctx = { params: Promise<{ slug: string }> };

/** The Metric's Unusual Value check, with the Workflow it belongs to. */
export const GET = keyRoute("metrics:read", async (actor, _req, ctx: Ctx) => {
  const slug = slugParam.parse((await ctx.params).slug);
  return json(UnusualValueCheck.parse(await unusualValueCheckWithKey(actor, slug)));
});

/** Changes the check. 200 with it; 403 when the creator does not own the Workflow, or their role may not create; 422
 * when the Metric has no Workflow or its Workflow no check step. */
export const PATCH = keyRoute("metrics:edit", async (actor, req, ctx: Ctx) => {
  const slug = slugParam.parse((await ctx.params).slug);
  const change = UpdateUnusualValueCheck.parse(await jsonBody(req));
  try {
    return json(UnusualValueCheck.parse(await setUnusualValueCheckWithKey(actor, slug, change)));
  } catch (e) {
    // Without a reason: missing or hidden (404). With one: seen, but not theirs to change.
    if (e instanceof Forbidden) { if (e.message === "Forbidden") throw e; return apiError("forbidden", e.message); }
    if (e instanceof MetricChangeRefused) return apiError("unprocessable", e.message);
    throw e;
  }
});
