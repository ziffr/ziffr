// The Trial Guide (ticket 193; GLOSSARY: Trial Guide, Test Metric, Trial Workspace): the few steps a new trial opens
// on, from where Ziffr should ask its Owner to the first value they answer. Only the Owner of a running Trial
// Workspace has one. Which ways can be picked comes from whatWorksHere, so the guide never offers a way the queue
// keeps back; asking is Ask me now on the Test Metric, through the same queue and checks as anywhere else.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { askMeNowBy, type AskNowResult } from "./ask-now";
import type { ConnectorId } from "./connectors/types";
import { setPreference } from "./questions";
import { myTelegramLink } from "./telegram-people";
import { trialEndsAt } from "./trials";
import { whatWorksHere, type WayState } from "./what-works-here";

/** The guide's steps, in order. */
export const GUIDE_STEPS = ["welcome", "where", "connect", "ask", "done"] as const;
/** One of those steps. */
export type GuideStep = (typeof GUIDE_STEPS)[number];

/** The ways the guide offers for being asked: the ones that bring a Prompt to a person. */
export const GUIDE_WAYS = ["email", "web-form", "slack", "telegram"] as const;
/** One of those ways. */
export type GuideWay = (typeof GUIDE_WAYS)[number];

// The form link has no Connector of its own: it rides in every Prompt, by email when nothing else is picked.
const CONNECTOR: Record<GuideWay, ConnectorId | null> = { email: "email", "web-form": null, slack: "slack", telegram: "telegram" };

/** What the guide page shows. Only the Owner's own details: their sign-in address and their own Test Metric. */
export type TrialGuide = {
  step: GuideStep;
  ways: GuideWay[];
  /** The ways to be asked by, as whatWorksHere says they are here, WhatsApp included so its reason shows. */
  choices: WayState[];
  /** Whether each way needs nothing more from the Owner before it can ask them. */
  ready: Record<GuideWay, boolean>;
  email: string;
  testMetric: { id: number; name: string; unit: string; slug: string } | null;
};

/** The first value recorded for the Test Metric, for the guide to show once it arrives. */
export type GuideValue = { value: number; period: string; source: string; at: string };

// The guide is the Owner's, and only while their trial runs: an ended trial asks nobody.
async function assertGuideOwner(actor: Actor): Promise<void> {
  if (actor.role !== "owner") throw new Forbidden("Only the trial's Owner has the guide.");
  const ends = await trialEndsAt(actor.workspaceId);
  if (!ends || ends.getTime() <= Date.now()) throw new Forbidden("The guide is for a running trial.");
}

const isWay = (w: unknown): w is GuideWay => typeof w === "string" && (GUIDE_WAYS as readonly string[]).includes(w);

/** The guide for the actor, or null when they have none (not the Owner of a running Trial Workspace). */
export async function trialGuide(actor: Actor): Promise<TrialGuide | null> {
  try { await assertGuideOwner(actor); } catch { return null; }
  const [{ data: ws }, { data: me }, here, telegram] = await Promise.all([
    db().from("workspaces").select("trial_guide_step, trial_guide_ways, trial_test_metric_id").eq("id", actor.workspaceId).single(),
    db().from("profiles").select("email").eq("id", actor.personId).single(),
    whatWorksHere(actor),
    myTelegramLink(actor),
  ]);
  const { data: m } = ws?.trial_test_metric_id
    ? await db().from("metrics").select("id, name, unit, slug").eq("id", ws.trial_test_metric_id).eq("workspace_id", actor.workspaceId).maybeSingle()
    : { data: null };
  const state = (w: string) => here.find((x) => x.way === w)?.state;
  const choices = here.filter((w) => isWay(w.way) || w.way === "whatsapp");
  return {
    step: (GUIDE_STEPS as readonly string[]).includes(ws?.trial_guide_step) ? ws!.trial_guide_step as GuideStep : "welcome",
    ways: ((ws?.trial_guide_ways ?? []) as string[]).filter(isWay),
    choices,
    // Slack is real here only once the workspace is connected, and it finds the Owner by their address; Telegram
    // needs the Owner's own chat linked as well.
    ready: { email: state("email") === "real", "web-form": true, slack: state("slack") === "real", telegram: state("telegram") === "real" && Boolean(telegram) },
    email: (me?.email as string | null) ?? "",
    testMetric: m ? { id: m.id as number, name: m.name as string, unit: (m.unit as string | null) ?? "", slug: m.slug as string } : null,
  };
}

/** Moves the guide to a step and, when given, keeps the ways picked. Only real ways can be picked; the first picked
 * of Telegram, Slack and email also becomes where the Owner's own Prompts go from now on. */
export async function saveTrialGuide(actor: Actor, step: GuideStep, ways?: GuideWay[]): Promise<void> {
  await assertGuideOwner(actor);
  if (!(GUIDE_STEPS as readonly string[]).includes(step)) throw new Forbidden();
  const update: { trial_guide_step: GuideStep; trial_guide_ways?: GuideWay[] } = { trial_guide_step: step };
  if (ways !== undefined) {
    if (!Array.isArray(ways) || ways.length > GUIDE_WAYS.length || !ways.every(isWay)) throw new Forbidden();
    const here = await whatWorksHere(actor);
    const picked = GUIDE_WAYS.filter((w) => ways.includes(w));
    if (picked.some((w) => here.find((x) => x.way === w)?.state !== "real")) throw new Error("Only a way that really works here can be picked.");
    update.trial_guide_ways = picked;
    const messenger = (["telegram", "slack", "email"] as const).find((w) => picked.includes(w));
    if (messenger) await setPreference(actor, actor.personId, "reminder", messenger);
  }
  const { error } = await db().from("workspaces").update(update).eq("id", actor.workspaceId);
  if (error) throw new Error("The guide could not be saved.");
}

/** What asking gave: one result per way, and the Owner's own form link code for the Test Metric, the same one every
 * Prompt to them carries. Only given once they asked, so the code reaches the browser at the ask step alone. */
export type GuideAsked = { results: AskNowResult[]; formCode: string | null };

/** Sends the Test Metric's Prompt to the Owner by each way they picked (by email when only the form link was), and
 * moves the guide to its ask step. The ten-minute limit of Ask me now applies. */
export async function askTrialGuide(actor: Actor): Promise<GuideAsked> {
  const guide = await trialGuide(actor);
  if (!guide) throw new Forbidden("Only the trial's Owner has the guide.");
  if (!guide.testMetric) throw new Error("This trial has no Test Metric to ask for.");
  const via = guide.ways.map((w) => CONNECTOR[w]).filter((c): c is ConnectorId => c !== null);
  const results = await askMeNowBy(actor, guide.testMetric.id, via.length ? via : ["email"]);
  await saveTrialGuide(actor, "ask");
  const { data: token } = await db().from("tokens").select("code").eq("metric_id", guide.testMetric.id)
    .eq("submitter_id", actor.personId).is("stands_in_for", null).maybeSingle();
  return { results, formCode: (token?.code as string | undefined) ?? null };
}

/** The latest value recorded for the Test Metric, or null while none has come. The guide polls this while it waits. */
export async function trialGuideValue(actor: Actor): Promise<GuideValue | null> {
  await assertGuideOwner(actor);
  const { data: ws } = await db().from("workspaces").select("trial_test_metric_id").eq("id", actor.workspaceId).single();
  if (!ws?.trial_test_metric_id) return null;
  const { data: o } = await db().from("observations").select("value, period_start, source, created_at")
    .eq("workspace_id", actor.workspaceId).eq("metric_id", ws.trial_test_metric_id).order("id", { ascending: false }).limit(1).maybeSingle();
  return o ? { value: Number(o.value), period: o.period_start as string, source: o.source as string, at: o.created_at as string } : null;
}
