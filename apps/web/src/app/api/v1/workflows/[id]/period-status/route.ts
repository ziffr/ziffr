// GET /api/v1/workflows/{id}/period-status (ticket #410; GLOSSARY: Period Timeline): how a Workflow's period is going,
// as the key's creator may see it: values in of values asked for, and what happened, in order. Scope metrics:read.
// The core decides what appears: a Metric the creator does not see is a count ("1 value"), and a Thread's words are
// only its first words, only for one they may read. The paths in the answer become links, which need a sign-in.
import { Forbidden } from "@ziffr/core/actor";
import { periodTimeline, workflowPeriods } from "@ziffr/core/period-timeline";
import { ApiError, json, keyRoute, query } from "@/lib/api";
import { idParam, PeriodStatus, periodStatusQuery } from "../../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** The Workflow's period, the newest one that has anything when `period` is left out. 404 for a Workflow that is
 * missing or in another workspace. */
export const GET = keyRoute("metrics:read", async (actor, req, ctx: Ctx) => {
  const id = idParam.parse((await ctx.params).id);
  const { period } = periodStatusQuery.parse(query(req));
  const start = period ?? (await workflowPeriods(actor, id, 1))[0];
  if (!start) throw new ApiError("not_found", "This Workflow has no period yet.");
  let t;
  try {
    t = await periodTimeline(actor, id, start);
  } catch (e) {
    if (e instanceof Forbidden) throw e;
    throw new ApiError("invalid_request", e instanceof Error ? e.message : "Pick a period.");
  }
  return json(PeriodStatus.parse({
    workflow: t.workflow, period: { start: t.period, name: t.label }, in: t.in, of: t.of, published: t.published, locked: t.locked,
    events: t.events.map((e) => ({ at: e.at, day: e.day, time: e.time, kind: e.kind, text: e.text, count: e.count, in: e.in ?? null, items: e.items, url: e.path ? new URL(e.path, req.url).toString() : null })),
  }));
});
