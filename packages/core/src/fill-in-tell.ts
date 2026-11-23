// What follows a Filled-in Value (GLOSSARY: Filled-in Value, Prompt, Audit Log, Delivery, Quiet Hours; spec 0046): the
// open Prompts for its Metric and period close, the Audit Log records who entered it for whom, and the submitter is told,
// once, through their Delivery Preference (waiting out their Quiet Hours). None of it can fail the value, which is
// already recorded. Internal to the core.
// Security (AGENTS.md rule 3): the message carries the value, the Metric's name, the period and, only where the person
// may read names, who entered it. A Guest or a Contact reads "a colleague": a Guest sees only their own name, and a
// Contact has no sign-in and no sight of the Workspace's people. The Audit Log is for Owners and Admins and never holds the value.
import { db } from "./db";
import { visibleMetricIds } from "./access";
import { deliverFilledIn } from "./deliveries";
import { FORM_LINK } from "./mail";
import { openNames } from "./sealed-columns";
import { yearStartFor } from "./fiscal-year";
import { recordAudit } from "./audit-log";
import { DEMO_WORKSPACE_ID } from "./team";
import { periodLabel } from "./periods";
import { closePrompt } from "./prompt-ways";
import { getMetrics } from "./workspace-data";
import type { FillInRole } from "./fill-in-rules";
import type { Metric, Profile, SourceId } from "./types";

/** Whether a person is a Guest of the Workspace. */
export async function isGuest(ws: string, personId: string): Promise<boolean> {
  const { data } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", personId).maybeSingle();
  return data?.role === "guest";
}

/** Who entered a value, in words for its submitter: their name, or "a colleague" where the submitter may not read names
 * (a Guest, who sees only their own, or a Contact, who is no member). */
export async function enteredByWords(ws: string, submitterId: string, enteredBy: string, people: Pick<Profile, "id" | "name">[]): Promise<string> {
  const { data } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", submitterId).maybeSingle();
  if (!data || data.role === "guest") return "a colleague";
  return people.find((p) => p.id === enteredBy)?.name ?? "a former member";
}

/** A Filled-in Value closes every open Prompt for its Metric and period, the submitter's and the Stand-in's, so the first
 * answer by any way counts. `said` names no one: it is edited into messages that other people's chats hold. */
export async function closeFilledInPrompts(ws: string, metricId: number, period: string, source: SourceId, said: string): Promise<void> {
  const { data: open } = await db().from("prompts").select("id").eq("workspace_id", ws).eq("metric_id", metricId).eq("period_start", period).is("answered_at", null);
  for (const p of open ?? []) await closePrompt(ws, p.id as number, source, said);
}

/** Records the Filled-in Value in the Audit Log and tells its submitter. Never throws: the value is already recorded. */
export async function tellFilledIn(ws: string, f: { metric: Metric; period: string; /** The value, written as the Workspace writes it. */ value: string; forId: string; by: string; as: FillInRole }): Promise<void> {
  try {
    // Never the value: the Audit Log holds who, for whom, which period and in which role.
    await recordAudit(ws, f.by, { kind: "value.filled_in", object: { type: "metric", id: f.metric.id, name: f.metric.name }, details: { period: f.period, for: f.forId, as: f.as } });
    if (ws === DEMO_WORKSPACE_ID) return;
    // Only someone who still holds their own Token for the Metric and sees it is told: otherwise it is skipped silently.
    const [{ data: tokens }, { data: membership }] = await Promise.all([
      db().from("tokens").select("id").eq("workspace_id", ws).eq("metric_id", f.metric.id).eq("submitter_id", f.forId).is("stands_in_for", null).limit(1),
      db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", f.forId).maybeSingle(),
    ]);
    const token = tokens?.[0];
    if (!token) return;
    if (membership && !(await visibleMetricIds(ws, f.forId, await getMetrics(ws))).has(f.metric.id)) return;
    const named = membership && membership.role !== "guest";
    const [who] = named ? await openNames(ws, (await db().from("profiles").select("id, name").eq("id", f.by)).data) : [];
    const by = who?.name ? String(who.name) : "A colleague";
    const when = periodLabel(f.period, f.metric.period, await yearStartFor(ws, f.metric.period));
    await deliverFilledIn(ws, {
      recipientId: f.forId,
      subject: `${f.metric.name}: ${named ? by : "a colleague"} entered a value for you`,
      text: `${by} entered ${f.value} for you for ${f.metric.name}, ${when}. You can replace it with your own until the period is locked.`,
      // A Contact signs in nowhere: their personal form link, put in as the message is sent.
      link: membership ? `/metrics/${f.metric.slug}/${f.period}` : FORM_LINK,
      metricId: f.metric.id,
      formTokenId: membership ? null : (token.id as number),
    });
  } catch (e) {
    console.error("A Filled-in Value could not be announced:", e instanceof Error ? e.message : e);
  }
}
