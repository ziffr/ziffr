// /api/v1/metrics/{slug}/submitters (ticket #217; GLOSSARY: Submitter). GET: who submits to a Metric the key's
// creator sees (scope metrics:read): id, name and kind, never contact details. POST: adds and removes Submitters as the
// key's creator (scope metrics:edit), only when they own the Metric or are its Editor; each person added gets a first
// Prompt, so at most 20 a call.
import { metricRoute } from "@/lib/api-metric-route";
import { Forbidden } from "@ziffr/core/actor";
import { listSubmittersWithKey, MetricChangeRefused, setSubmittersWithKey } from "@ziffr/core/api-metrics";
import { apiError, json, jsonBody } from "@/lib/api";
import { ChangeSubmitters, SubmitterList, SubmittersChanged } from "../../../schemas";

/** Lists the Metric's Submitters. */
export const GET = metricRoute("metrics:read", async (actor, _req, slug) => {
  return json(SubmitterList.parse({ items: await listSubmittersWithKey(actor, slug) }));
});

/** Adds and removes Submitters. 200 with who submits now; 403 when the creator may not change the Metric, or as its
 * Editor names someone who does not see it; 422 when an id is not one of the workspace's people, Contacts or Feeds, or
 * the Metric is Derived. A refused call changes nothing. */
export const POST = metricRoute("metrics:edit", async (actor, req, slug) => {
  const change = ChangeSubmitters.parse(await jsonBody(req));
  try {
    const r = await setSubmittersWithKey(actor, slug, change);
    return json(SubmittersChanged.parse({ items: r.submitters, added: r.added, removed: r.removed }));
  } catch (e) {
    // Without a reason: missing or hidden (404). With one: seen, but not theirs to change.
    if (e instanceof Forbidden) { if (e.message === "Forbidden") throw e; return apiError("forbidden", e.message); }
    if (e instanceof MetricChangeRefused) return apiError("unprocessable", e.message);
    throw e;
  }
});
