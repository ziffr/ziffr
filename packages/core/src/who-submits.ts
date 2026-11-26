// Who submits, on a Metric's page (GLOSSARY: Submitter, Prompt, Contact, Guest): whom the Metric's owner and Editors
// may add, and adding one person with a sentence that says what really happened. Adding and removing themselves are
// addSubmitters and removeSubmitters in metrics.ts, which hold the rules; nothing is decided a second time here.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { peopleFor } from "./access";
import { addSubmitters, claimFirstPrompt, editableMetric, metricEffects, peopleSeeing, type MetricEffects } from "./metrics";
import { firstAsksMessage } from "./asked-message";
import { CONNECTORS } from "./connectors/index";
import type { PromptOutcome } from "./deliveries";

/** Someone who may be added as a Submitter: their name and whether they are a Member, a Guest or a Contact. */
export type SubmitterChoice = { id: string; name: string; kind: "member" | "guest" | "contact" };

/** No count a person reaches: from the app, only the same person and Metric within a day holds a first Prompt back. */
const NO_DAILY_COUNT = 1_000_000;

/** The people the actor may add to a Metric's Submitters, by name: those who do not submit it yet. Only the Metric's
 * owner and its Editors get any, and only for a Metric that takes values: the owner everyone, an Editor those who see
 * the Metric already, as addSubmitters holds it. */
export async function submitterChoices(actor: Actor, metricId: number): Promise<SubmitterChoice[]> {
  let metric;
  try {
    metric = await editableMetric(actor, metricId, "who submits");
  } catch (e) {
    if (e instanceof Forbidden) return [];
    throw e;
  }
  if (metric.formula) return [];
  const ws = actor.workspaceId;
  // Names and kinds only: no address, handle or number goes to the browser with the list (rule 3).
  const [people, { data: guests }, { data: tokens }] = await Promise.all([
    peopleFor(actor),
    db().from("memberships").select("user_id").eq("workspace_id", ws).eq("role", "guest"),
    db().from("tokens").select("submitter_id").eq("workspace_id", ws).eq("metric_id", metricId).is("stands_in_for", null),
  ]);
  const guest = new Set((guests ?? []).map((g) => g.user_id as string));
  const taken = new Set((tokens ?? []).map((t) => t.submitter_id as string));
  const free = people.filter((p) => !taken.has(p.id));
  const may = metric.owner_id === actor.personId ? null : await peopleSeeing(ws, metricId, free.map((p) => p.id));
  return free.filter((p) => !may || may.has(p.id)).map((p) => ({ id: p.id, name: p.name, kind: p.contact ? "contact" : guest.has(p.id) ? "guest" : "member" }));
}

/** Adds one person as a Submitter from the Metric's page and answers, in one sentence, what was sent to them. With
 * `askNow` false they get their Token and no first Prompt, and so does someone asked for this Metric in the last day.
 * `personId` is untrusted: addSubmitters checks it. */
export async function addSubmitterWithAnswer(actor: Actor, metricId: number, personId: string, askNow: boolean, effects: MetricEffects = metricEffects): Promise<string> {
  const asks: PromptOutcome[] = [];
  let heldBack = false;
  const added = await addSubmitters(actor, metricId, [personId], {
    ...effects,
    promptSubmitter: async (metric, submitter, by) => {
      if (!askNow) return false;
      heldBack = !(await claimFirstPrompt(actor.workspaceId, metric, submitter, NO_DAILY_COUNT));
      if (heldBack) return false;
      const sent = await effects.promptSubmitter(metric, submitter, by);
      if (sent) asks.push(sent);
      return sent;
    },
  });
  if (!added.length) return "They submit it already.";
  if (!askNow) return "Nothing was sent to them now.";
  if (heldBack) return "They were asked for this Metric in the last day, so no new request was made.";
  const [ask] = asks;
  if (!ask) return "No request was sent to them.";
  const name = (await peopleFor(actor)).find((p) => p.id === added[0])?.name ?? "They";
  // No way the Metric accepts reaches them: the reason is one of Ziffr's own sentences, never a provider's words.
  if (ask.notSent) return `${name} was not asked: the request waits in the Outbox. ${ask.notSent}`;
  return firstAsksMessage({ submitters: 1, asked: [{ personId: added[0], name, connector: ask.connector, label: CONNECTORS[ask.connector].label, state: ask.state }] });
}
