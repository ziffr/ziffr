// The two halves of the First Metric loop (spec 0052; GLOSSARY: Setup Guide, Prompt, Delivery, Source, Quiet Hours),
// read from state: OUT is a Prompt for the guide's Metric that reached the viewer (sent, or held only by their Quiet
// Hours, which still counts as asked), IN is a value of that Metric the viewer submitted themselves through a Source
// after the guide began. Only the viewer's own rows are counted, so nothing of anyone else leaks, and a value someone
// else sent, or one from before the guide began, never counts. The Setup Guide's tick and the step's polling both
// read it here, so the two can never disagree.
import { db } from "./db";
import { combinedListing } from "./internal/combined-delivery";

/** The Sources whose value, entered by the viewer, counts as "in" for the First Metric step. */
export const IN_SOURCES = ["mail", "slack", "telegram", "web_form", "api"] as const;

/** How many of the viewer's newest Prompts for the Metric are looked at (a Prompt is made per way and per press). */
const PROMPTS_LOOKED_AT = 50;

/** Whether the viewer was asked and whether they answered, for one Metric since the guide began. */
export type Loop = { promptOut: boolean; valueIn: boolean };

/** The loop of one Metric for one person: counts only, with the person's own rows. */
export async function loopOf(workspaceId: string, personId: string, metricId: number, since: string): Promise<Loop> {
  const head = { count: "exact" as const, head: true };
  const { data: prompts } = await db().from("prompts").select("id").eq("workspace_id", workspaceId).eq("metric_id", metricId).eq("submitter_id", personId).order("id", { ascending: false }).limit(PROMPTS_LOOKED_AT);
  const ids = (prompts ?? []).map((p) => p.id as number);
  // Sent, or held only by the viewer's Quiet Hours (queued with a time to wait for): either way it was asked.
  const reached = () => db().from("deliveries").select("id", head).eq("workspace_id", workspaceId).eq("recipient_id", personId).eq("kind", "prompt")
    .or("mail_state.eq.sent,and(mail_state.eq.queued,not_before.not.is.null)");
  const listed = (await combinedListing(workspaceId, ids)).map((l) => l.deliveryId);
  const [out, together, inn] = await Promise.all([
    ids.length ? reached().in("prompt_id", ids) : Promise.resolve({ count: 0 }),
    listed.length ? reached().in("id", listed) : Promise.resolve({ count: 0 }),
    db().from("observations").select("id", head).eq("workspace_id", workspaceId).eq("metric_id", metricId).eq("submitter_id", personId).in("source", [...IN_SOURCES]).gte("created_at", since),
  ]);
  return { promptOut: (out.count ?? 0) + (together.count ?? 0) > 0, valueIn: (inn.count ?? 0) > 0 };
}
