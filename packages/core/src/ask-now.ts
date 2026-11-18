// Ask me now (spec 0021; GLOSSARY: Prompt). A Metric's owner who also submits it asks for its current period's
// Prompt at once, on their own Connector, instead of waiting for the Workflow. It is the same Prompt the Workflow
// sends, through the same queue and checks (in a trial, to its Owner only), so it shows how asking works for real.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { CONNECTORS, type ConnectorId } from "./connectors/index";
import { deliverPrompt } from "./deliveries";

/** How long a Metric waits before Ask me now asks again. */
export const ASK_NOW_EVERY_MINUTES = 10;

/** What became of a press: where the Prompt went, and whether it really left Ziffr or stayed in the Outbox and why. */
export type AskNowResult = { connector: ConnectorId; label: string; state: "sent" | "queued" | "outbox" | "failed"; note: string | null };

/** Whether the actor may press Ask me now on a Metric: they own it and are one of its Submitters themselves. */
export async function canAskNow(actor: Actor, metricId: number): Promise<boolean> {
  const { data: m } = await db().from("metrics").select("owner_id, formula").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.owner_id !== actor.personId || m.formula) return false;
  const { data: token } = await db().from("tokens").select("id").eq("metric_id", metricId).eq("submitter_id", actor.personId).is("stands_in_for", null).maybeSingle();
  return Boolean(token);
}

/** Sends the Metric's current Prompt to the actor now. Refused unless they own and submit the Metric; at most once
 * every ten minutes per Metric (claimed in the database, so two presses at once ask once). */
export async function askMeNow(actor: Actor, metricId: number): Promise<AskNowResult> {
  if (!Number.isInteger(metricId) || !(await canAskNow(actor, metricId))) throw new Forbidden("Only a Metric's owner who also submits it can ask for it now.");
  const { data: claimed, error } = await db().rpc("claim_ask_now", { p_metric: metricId });
  if (error) throw new Error("Asking did not work. Try again.");
  if (!claimed) throw new Error(`It was asked a moment ago. Ask again in ${ASK_NOW_EVERY_MINUTES} minutes.`);
  const since = new Date().toISOString();
  if (!(await deliverPrompt({ metricId, submitterId: actor.personId, senderId: null }))) throw new Error("This Metric cannot be asked for now.");
  const { data: d } = await db().from("deliveries").select("connector, mail_state, last_error").eq("workspace_id", actor.workspaceId)
    .eq("recipient_id", actor.personId).eq("kind", "prompt").gte("created_at", since).order("id", { ascending: false }).limit(1).maybeSingle();
  const connector = (d?.connector ?? "email") as ConnectorId;
  const state = (["sent", "queued", "outbox", "failed"].includes(d?.mail_state) ? d!.mail_state : "outbox") as AskNowResult["state"];
  return { connector, label: CONNECTORS[connector].label, state, note: (d?.last_error as string | null) ?? null };
}
