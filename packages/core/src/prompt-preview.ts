// Where each submitter's next Prompt will go and why (GLOSSARY: Prompt, Delivery Preference): for a Metric's page.
// Only the Metric's owner and Editors see it for everyone; anyone else who submits sees their own line.
import { db } from "./db";
import type { Actor } from "./actor";
import { editableMetric } from "./metrics";
import { feedIdsAmong } from "./feed-people";
import { waysFor } from "./deliveries";
import { mailRepliesReturn, openWays, reachOf, stoppedWays } from "./prompt-reach";
import { allowedWays, describeWithStops, PROMPT_WAYS, routePrompts, type PromptWay, type RouteView } from "./prompt-route";
import { assertSeesMetrics } from "./sharing";
import { openNames } from "./sealed-columns";
import { mailOn } from "./mail";
import { RESUME_AGAIN_DAYS } from "./email-resume";
import { DEMO_WORKSPACE_ID } from "./team";
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
  const [mailReplies, stops] = await Promise.all([mailRepliesReturn(actor.workspaceId), stoppedWays(actor.workspaceId, ids)]);
  const out: Record<string, RouteView> = {};
  for (const id of ids.filter((i) => !feeds.has(i))) {
    const [chosen, reach] = await Promise.all([waysFor(actor.workspaceId, id, "prompt"), reachOf(actor.workspaceId, id)]);
    const input = { chosen, accepts: m.sources as SourceId[], mailReplies, reach };
    const view = describeWithStops(input, routePrompts(input), stops.get(id) ?? new Set());
    // The way to fix it is the person's own to take: for anyone else the line only says what is wrong.
    out[id] = id === actor.personId ? view : { ...view, fix: null };
  }
  return out;
}

/** A Submitter who stopped requests by a way the Metric would use. `askAgain` is for the Metric's owner alone: that
 * they may have the question sent whether the emails are wanted again, and when it was last asked, if lately. */
export type StoppedSubmitter = { id: string; name: string; ways: PromptWay[]; askAgain: { askedAt: string | null; everyDays: number } | null };

/** What a Metric's page says about stopped requests: the ways the actor stopped for a Metric they send values for;
 * for its owner and Editors, who stopped, and whether that leaves nobody to ask. */
export type AskingStops = { mine: PromptWay[]; people: StoppedSubmitter[]; nobody: boolean };

/** The stops the actor may know of on this Metric: the same audience as the next request's line (`nextPromptWays`),
 * so who unsubscribed is told to the owner, Editors and the person themselves, and to nobody else (rule 3). */
export async function askingStops(actor: Actor, metricId: number): Promise<AskingStops> {
  const none: AskingStops = { mine: [], people: [], nobody: false };
  if (actor.key || !Number.isInteger(metricId)) return none;
  const ws = actor.workspaceId;
  const { data: m } = await db().from("metrics").select("id, owner_id, sources, formula, archived_at").eq("id", metricId).eq("workspace_id", ws).maybeSingle();
  if (!m || m.formula || m.archived_at || !(await assertSeesMetrics(actor, [metricId]).then(() => true, () => false))) return none;
  const everyone = actor.role !== "guest" && await editableMetric(actor, metricId).then(() => true, () => false);
  const { data: tokens } = await db().from("tokens").select("submitter_id, stands_in_for").eq("metric_id", metricId).eq("workspace_id", ws);
  const mailReplies = await mailRepliesReturn(ws);
  const allowed = allowedWays(m.sources as SourceId[], mailReplies);
  const among = (set: ReadonlySet<PromptWay> | undefined) => PROMPT_WAYS.filter((w) => set?.has(w) && allowed[w]);
  const submits = (tokens ?? []).some((t) => t.submitter_id === actor.personId);
  const mine = submits ? among((await stoppedWays(ws, [actor.personId])).get(actor.personId)) : [];
  if (!everyone) return { ...none, mine };
  const submitters = [...new Set((tokens ?? []).filter((t) => !t.stands_in_for).map((t) => t.submitter_id as string))];
  const feeds = await feedIdsAmong(submitters);
  const asked = await Promise.all(submitters.filter((id) => !feeds.has(id)).map(async (id) => ({ id, ...(await openWays(ws, id, m.sources as SourceId[], await waysFor(ws, id, "prompt"))) })));
  const stopped = asked.filter((p) => among(p.stopped).length);
  if (!stopped.length) return { ...none, mine };
  // The question whether the emails are wanted again is the owner's to send, never for themselves, and only where email leaves.
  const offers = m.owner_id === actor.personId && ws !== DEMO_WORKSPACE_ID && await mailOn();
  const ids = stopped.map((p) => p.id);
  const [{ data: profiles }, { data: earlier }] = await Promise.all([
    db().from("profiles").select("id, name").in("id", ids),
    db().from("email_opt_out_notices").select("person_id, resume_asked_at").eq("workspace_id", ws).in("person_id", ids).gt("resume_asked_at", new Date(Date.now() - RESUME_AGAIN_DAYS * 86_400_000).toISOString()),
  ]);
  const names = await openNames(ws, profiles);
  const people = stopped.map((p) => ({
    id: p.id,
    name: String(names?.find((n) => n.id === p.id)?.name ?? "Someone"),
    ways: among(p.stopped),
    askAgain: offers && p.id !== actor.personId && among(p.stopped).includes("email") ? { askedAt: (earlier?.find((e) => e.person_id === p.id)?.resume_asked_at as string | undefined) ?? null, everyDays: RESUME_AGAIN_DAYS } : null,
  }));
  return { mine, people, nobody: !feeds.size && asked.every((p) => !p.open.length) };
}
