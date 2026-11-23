// @ts-nocheck
// Where each submitter's next Prompt will go and why (GLOSSARY: Prompt, Delivery Preference): for a Metric's page.
// Only the Metric's owner and Editors see it for everyone; anyone else who submits sees their own line.
import { db } from "./db";
import type { Actor } from "./actor";
import { editableMetric } from "./metrics";
import { feedIdsAmong } from "./feed-people";
import { waysFor } from "./deliveries";
import { mailRepliesReturn, reachOf } from "./prompt-reach";
import { describeRoutes, routePrompts, type RouteView } from "./prompt-route";
import type { SourceId } from "./types";

/** Per submitter (a person's id): where their next Prompt for the Metric goes. A Feed is never asked, so has none. */
export async function nextPromptWays(actor: Actor, metricId: number): Promise<Record<string, RouteView>> {
  if (actor.key || !Number.isInteger(metricId)) return {};
  const { data: m } = await db().from("metrics").select("id, sources, formula, archived_at").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.formula || m.archived_at) return {};
  // A Guest never sees other people's choices or links, even as the owner of a Metric they were given earlier.
  const everyone = actor.role !== "guest" && await editableMetric(actor, metricId).then(() => true, () => false);
  const { data: tokens } = await db().from("tokens").select("submitter_id").eq("metric_id", metricId).eq("workspace_id", actor.workspaceId).is("stands_in_for", null);
  const ids = [...new Set((tokens ?? []).map((t) => t.submitter_id as string))].filter((id) => everyone || id === actor.personId);
  const feeds = await feedIdsAmong(ids);
  const mailReplies = await mailRepliesReturn(actor.workspaceId);
  const out: Record<string, RouteView> = {};
  for (const id of ids.filter((i) => !feeds.has(i))) {
    const [chosen, reach] = await Promise.all([waysFor(actor.workspaceId, id, "prompt"), reachOf(actor.workspaceId, id)]);
    const input = { chosen, accepts: m.sources as SourceId[], mailReplies, reach };
    const view = describeRoutes(input, routePrompts(input));
    // The way to fix it is the person's own to take: for anyone else the line only says what is wrong.
    out[id] = id === actor.personId ? view : { ...view, fix: null };
  }
  return out;
}
