// First Steps' first value (spec 0067, ticket 4; GLOSSARY: First Steps, Value, Prompt, Delivery, Held Reply, Submitter,
// Quiet Hours). The Owner of a Workspace First Steps made sends one number in: Ziffr asks by email and they reply, or
// they type it here. Which Metric: one they own that takes values (made by a set, by the clean slate, or by hand), kept
// as the Setup Guide's First Metric, so asking, typing and waiting reuse the First Metric loop and its limits.
// Visibility is the product: only that Owner gets an answer, and it holds their own Metrics, address, Delivery, value and
// what became of their own reply, as fixed words: never a mail's text, a form code or anyone else's address.
import { Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { emailOptedOut, optBackIn } from "./email-opt-out";
import { IN_SOURCES } from "./first-metric-loop";
import type { Check } from "./first-metric-words";
import { ownersFirstSteps } from "./first-steps";
import { PEOPLE_SOURCES, replyWords, sentWords } from "./first-steps-words";
import { combinedListing } from "./internal/combined-delivery";
import { inviteGate } from "./invite-gate";
import { addSubmitters, metricEffects, removeSubmitters, type MetricEffects } from "./metrics";
import { openRows } from "./sealed-columns";
import { askForFirstMetric, askMeForFirstMetric, firstMetricStep, pickFirstMetric, sendFirstMetricValue, setupFirstValue, type FirstMetricAsked } from "./setup-first-metric";
import { setSetupFirstMetric } from "./setup-guide";
import { trialEnded, trialEndsAt } from "./trials";
import type { Period, SourceId } from "./types";
import { whatWorksHere } from "./what-works-here";

/** Adds Submitters without asking anybody: nothing First Steps does by itself sends a request for a value. */
export const ASK_NOBODY: MetricEffects = { ...metricEffects, /**
 *
 */
promptSubmitter: async () => false };

/** Refuses everyone but the Owner of a Workspace First Steps made (so every other role, a key and the demo), and that
 * Owner too once their trial has ended. */
export async function assertFirstSteps(actor: Actor): Promise<void> {
  if (!(await ownersFirstSteps(actor))) throw new Forbidden("First Steps did not make this Workspace.");
  if (await trialEnded(actor.workspaceId)) throw new Forbidden("This trial has ended.");
}

/** A Metric First Steps asks about: the Owner's own, entered rather than computed, not archived. */
export type MadeMetric = { id: number; name: string; unit: string; period: Period; sources: SourceId[]; workflowId: number | null };

/** Whether people send a Metric's values (not programs alone). */
export const sentByPeople = (m: MadeMetric): boolean => m.sources.some((s) => PEOPLE_SOURCES.includes(s));

/** The made Metrics, oldest first: what the person owns that takes values. This is all the sets and the clean slate hand
 * over to the screens after them. `until` leaves out those made later. The caller has checked who asks. */
export async function madeMetrics(actor: Actor, until: string | null = null): Promise<MadeMetric[]> {
  let read = db().from("metrics").select("id, name, unit, period, sources, workflow_id").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).is("formula", null).is("archived_at", null);
  if (until) read = read.lte("created_at", until);
  const { data, error } = await read.order("id");
  if (error) throw new Error("Your metrics could not be read.");
  return (await openRows("metrics", actor.workspaceId, data)).map((m) => ({ id: Number(m.id), name: String(m.name), unit: String(m.unit ?? ""), period: m.period as Period, sources: (m.sources ?? []) as SourceId[], workflowId: (m.workflow_id as number | null) ?? null }));
}

/** The person's guide row: when it began, the Metric being tried and whether it was chosen who sends the values. */
export async function firstStepsGuide(actor: Actor): Promise<{ startedAt: string; firstMetricId: number | null; firstStepsAt: string; chosenAt: string | null }> {
  const { data, error } = await db().from("setup_guides").select("started_at, first_metric_id, first_steps_at, providers_chosen_at").eq("workspace_id", actor.workspaceId).single();
  if (error) throw new Error("First Steps could not be read.");
  return { startedAt: data.started_at as string, firstMetricId: (data.first_metric_id as number | null) ?? null, firstStepsAt: data.first_steps_at as string, chosenAt: (data.providers_chosen_at as string | null) ?? null };
}

// The person's newest value of their own among some Metrics since First Steps began.
async function newestOwn(actor: Actor, ids: number[], since: string): Promise<{ metricId: number; period: string } | null> {
  const { data } = await db().from("observations").select("metric_id, period_start").eq("workspace_id", actor.workspaceId).eq("submitter_id", actor.personId).eq("imported", false)
    .in("metric_id", ids).in("source", [...IN_SOURCES]).gte("created_at", since).order("id", { ascending: false }).limit(1).maybeSingle();
  return data ? { metricId: data.metric_id as number, period: data.period_start as string } : null;
}

// The Metric the screens are about, kept as the guide's First Metric. A value of their own for any made Metric wins, so a
// reply to an earlier request still shows after another Metric was chosen.
async function currentMetric(actor: Actor): Promise<{ metric: MadeMetric | null; usable: MadeMetric[] }> {
  const usable = (await madeMetrics(actor)).filter((m) => m.sources.includes("web_form") || m.sources.includes("mail"));
  if (!usable.length) return { metric: null, usable };
  const guide = await firstStepsGuide(actor);
  const sent = await newestOwn(actor, usable.map((m) => m.id), guide.startedAt);
  const metric = usable.find((m) => m.id === (sent?.metricId ?? guide.firstMetricId)) ?? usable[0];
  if (metric.id !== guide.firstMetricId) await setSetupFirstMetric(actor, metric.id);
  return { metric, usable };
}

/** Whether Ziffr can ask the person by email: yes; not on this Ziffr; they stopped these emails; or not for this Metric
 * (or they have no address). `reply` says whether a reply records the number, or only the link in the email does. */
export type FirstEmail = { state: "offered" | "off" | "stopped" | "unavailable"; address: string | null; reply: boolean };

async function emailWay(actor: Actor, metric: MadeMetric): Promise<FirstEmail> {
  const [here, me, stopped] = await Promise.all([whatWorksHere(actor), db().from("profiles").select("email").eq("id", actor.personId).single(), emailOptedOut(actor)]);
  const real = (way: string) => here.find((w) => w.way === way)?.state === "real";
  const address = (me.data?.email as string | null) || null;
  const reply = real("email-replies") && metric.sources.includes("mail");
  const state = !real("email") ? "off" : !address || !(reply || metric.sources.includes("web_form")) ? "unavailable" : stopped ? "stopped" : "offered";
  return { state, address, reply };
}

/** The first value once it is in: what it is, and what it opened. */
export type FirstValueProgress = {
  value: { metric: string; value: string; period: string; byReply: boolean; waitsApproval: boolean } | null;
  /** A trial whose invitations are open now. */
  canInvite: boolean;
  /** What became of a reply to their own newest request, in fixed words, while no value is in. */
  reply: string | null;
};

// What became of the newest reply since the person was last asked for the Metric by email. Only the outcome's name is read,
// and only of replies to their own Deliveries; the words are fixed.
async function replyToOwnRequest(actor: Actor, metricId: number, address: string | null): Promise<string | null> {
  const ws = actor.workspaceId;
  const { data: prompts } = await db().from("prompts").select("id").eq("workspace_id", ws).eq("metric_id", metricId).eq("submitter_id", actor.personId).order("id", { ascending: false }).limit(20);
  const ids = (prompts ?? []).map((p) => p.id as number);
  if (!ids.length) return null;
  const own = () => db().from("deliveries").select("id, created_at").eq("workspace_id", ws).eq("recipient_id", actor.personId).eq("kind", "prompt").eq("connector", "email").order("id", { ascending: false }).limit(20);
  const listed = (await combinedListing(ws, ids)).map((l) => l.deliveryId);
  const [alone, together] = await Promise.all([own().in("prompt_id", ids), listed.length ? own().in("id", listed) : null]);
  const asked = [...(alone.data ?? []), ...(together?.data ?? [])];
  if (!asked.length) return null;
  const since = asked.map((d) => d.created_at as string).sort().at(-1)!;
  const { data } = await db().from("inbound_emails").select("delivery_id, outcome").eq("workspace_id", ws).in("delivery_id", asked.map((d) => d.id as number)).gte("received_at", since).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  // A held reply is worth mentioning only while its link still works.
  if (data.outcome === "held") {
    const { count } = await db().from("held_replies").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("delivery_id", data.delivery_id).gt("expires_at", new Date().toISOString());
    if (!count) return null;
  }
  return replyWords(String(data.outcome), address);
}

async function progressOf(actor: Actor, metric: MadeMetric, address: string | null): Promise<FirstValueProgress> {
  const { value } = await setupFirstValue(actor);
  if (!value) return { value: null, canInvite: false, reply: await replyToOwnRequest(actor, metric.id, address) };
  const sent = await newestOwn(actor, [metric.id], (await firstStepsGuide(actor)).startedAt);
  const { data: state } = sent ? await db().from("period_states").select("state").eq("metric_id", metric.id).eq("period_start", sent.period).maybeSingle() : { data: null };
  const canInvite = Boolean(await trialEndsAt(actor.workspaceId)) && (await inviteGate(actor)).state === "open";
  return {
    value: { metric: metric.name, value: value.value, period: value.period, byReply: ["mail", "slack", "telegram"].includes(value.source), waitsApproval: state?.state === "approval" },
    canInvite, reply: null,
  };
}

/** What became of the person's request, for the screen to look again while it waits. */
export async function firstStepsProgress(actor: Actor): Promise<FirstValueProgress> {
  await assertFirstSteps(actor);
  const { metric } = await currentMetric(actor);
  if (!metric) return { value: null, canInvite: false, reply: null };
  const { data: me } = await db().from("profiles").select("email").eq("id", actor.personId).single();
  return progressOf(actor, metric, (me?.email as string | null) || null);
}

/** The request that went by email, if one did. */
export type FirstRequest = { state: "sent" | "queued" | "held" | "outbox" | "failed"; words: string };

function requestWords(asked: FirstMetricAsked | undefined, metric: string, email: FirstEmail, quiet: string | null): FirstRequest | null {
  if (!asked) return null;
  if (asked.held) return { state: "held", words: quiet ?? "Held by your Quiet Hours. It counts as asked." };
  if (asked.state === "sent" || asked.state === "queued") return { state: asked.state, words: sentWords({ state: asked.state, address: email.address, metric, reply: email.reply }) };
  const why = asked.note ? `: ${asked.note}` : ".";
  return { state: asked.state, words: asked.state === "outbox" ? `The request is kept in the Outbox${why}` : `The request was not sent${why}` };
}

/** What the first value screen shows. */
export type FirstValueView = {
  metric: { id: number; name: string; unit: string; canType: boolean };
  /** The other Metrics that could be chosen instead. */
  others: { id: number; name: string }[];
  /** A trial where invitations wait for this value. */
  invitesWait: boolean;
  /** Whether it was chosen already who sends the values. */
  chosen: boolean;
  email: FirstEmail;
  request: FirstRequest | null;
  /** Said before asking during Quiet Hours. */
  quiet: string | null;
  /** The words while asking again must wait. */
  cooldown: string | null;
  /** What to check when nothing arrived. */
  checks: Check[];
  progress: FirstValueProgress;
};

/** The first value screen, or null while there is no Metric that takes a value. */
export async function firstStepsValue(actor: Actor): Promise<FirstValueView | null> {
  await assertFirstSteps(actor);
  const { metric, usable } = await currentMetric(actor);
  if (!metric) return null;
  const [step, email, gate, guide] = await Promise.all([firstMetricStep(actor), emailWay(actor, metric), inviteGate(actor), firstStepsGuide(actor)]);
  return {
    metric: { id: metric.id, name: metric.name, unit: metric.unit, canType: metric.sources.includes("web_form") },
    others: usable.filter((m) => m.id !== metric.id).map((m) => ({ id: m.id, name: m.name })),
    invitesWait: gate.state === "waiting",
    chosen: Boolean(guide.chosenAt),
    email,
    request: requestWords(step.asked.find((a) => a.connector === "email"), metric.name, email, step.quietBefore),
    quiet: step.quietBefore,
    cooldown: step.cooldown,
    checks: step.checks,
    progress: await progressOf(actor, metric, email.address),
  };
}

/** Chooses another of the made Metrics to send a value for. Untrusted id: it must be one of the person's own. */
export async function pickFirstStepsMetric(actor: Actor, metricId: unknown): Promise<void> {
  await assertFirstSteps(actor);
  await pickFirstMetric(actor, metricId);
}

async function submits(actor: Actor, metricId: number): Promise<boolean> {
  const { data, error } = await db().from("tokens").select("id").eq("workspace_id", actor.workspaceId).eq("metric_id", metricId).eq("submitter_id", actor.personId).is("stands_in_for", null).maybeSingle();
  if (error) throw new Error("Your metric could not be read.");
  return Boolean(data);
}

/** "Ask me by email": one request, by email, to the person themself. Who does not submit the Metric yet is added, which
 * sends it; else it is asked again. The ten minutes between asks and the daily caps are those of the First Metric step.
 * Refused, in words, where email is not really sent or the person stopped these emails. */
export async function askFirstStepsByEmail(actor: Actor): Promise<void> {
  await assertFirstSteps(actor);
  const { metric } = await currentMetric(actor);
  if (!metric) throw new Refused("Add a metric first.");
  const { state } = await emailWay(actor, metric);
  if (state === "stopped") throw new Refused("You stopped emails that ask you for numbers. Switch them on again first.");
  if (state !== "offered") throw new Refused("Ziffr cannot ask you for this by email. Type it in here.");
  if (!(await submits(actor, metric.id))) return askMeForFirstMetric(actor, "email");
  const { results } = await askForFirstMetric(actor, ["email"]);
  const failed = results.find((r) => r.state === "failed");
  if (failed) throw new Refused(failed.note ?? "The request was not sent. Type it in here.");
}

/** Switches the person's own request emails on again, after they stopped them: their choice, for themself only. */
export async function allowFirstStepsEmail(actor: Actor): Promise<void> {
  await assertFirstSteps(actor);
  await optBackIn(actor);
}

/** A value typed on the screen: the person is made a Submitter without any message, and the value goes through the web
 * form's intake. Where somebody else was chosen to provide the numbers, they are not left a Submitter afterwards. */
export async function sendFirstStepsValue(actor: Actor, text: unknown): Promise<{ ok: boolean; detail: string }> {
  await assertFirstSteps(actor);
  const { metric } = await currentMetric(actor);
  if (!metric?.sources.includes("web_form")) throw new Refused("This metric does not take a typed value.");
  const had = await submits(actor, metric.id);
  if (!had) await addSubmitters(actor, metric.id, [actor.personId], ASK_NOBODY);
  try {
    return await sendFirstMetricValue(actor, String(text ?? ""));
  } finally {
    // After a choice, the Owner stays a Submitter under "I will" and "Nobody for now": not being one means a colleague.
    if (!had && (await firstStepsGuide(actor)).chosenAt) await removeSubmitters(actor, metric.id, [actor.personId]);
  }
}
