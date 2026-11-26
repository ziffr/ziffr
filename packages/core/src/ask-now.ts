// Ask me now (spec 0021; GLOSSARY: Prompt). A Metric's owner who also submits it asks for its current period's
// Prompt at once, on their own Connector, instead of waiting for the Workflow. It is the same Prompt the Workflow
// sends, through the same queue and checks (in a trial, to its Owner only), so it shows how asking works for real.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { CONNECTOR_IDS, CONNECTORS, type ConnectorId } from "./connectors/index";
import { deliverPrompt } from "./deliveries";
import { isNotSentReason } from "./prompt-route";
import { TRIAL_HOLDS_BACK } from "./trials";
import { ARCHIVED_BEFORE_SENT } from "./archived-metrics";
import { NO_WAY_HERE } from "./test-message-words";
import { REMOVED_BEFORE_SENT } from "./asked-message";

/** How long a Metric waits before Ask me now asks again. */
export const ASK_NOW_EVERY_MINUTES = 10;

/** What became of a press: where the Prompt went, and whether it really left Ziffr or stayed in the Outbox and why. */
export type AskNowResult = { connector: ConnectorId; label: string; state: "sent" | "queued" | "outbox" | "failed"; note: string | null; /** Whether it went the way the person chose; else the first way the Metric accepts answers by that reaches them. */ chosen: boolean };

/** Whether the actor may press Ask me now on a Metric: they own it and are one of its Submitters themselves. */
export async function canAskNow(actor: Actor, metricId: number): Promise<boolean> {
  const { data: m } = await db().from("metrics").select("owner_id, formula, archived_at").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.owner_id !== actor.personId || m.formula || m.archived_at) return false;
  const { data: token } = await db().from("tokens").select("id").eq("metric_id", metricId).eq("submitter_id", actor.personId).is("stands_in_for", null).maybeSingle();
  return Boolean(token);
}

/** Why a Prompt did not go out, as it may be shown: only reasons Ziffr wrote itself pass; anything else (a mail
 * server's or a provider's own words) becomes one fixed line, so no provider text reaches a browser. */
const SHOWN_REASONS = new Set<string>([
  ...Object.values(TRIAL_HOLDS_BACK), ARCHIVED_BEFORE_SENT, REMOVED_BEFORE_SENT,
  "Email is not set up.", "No usable email address for this person here.", "They stopped reminders by email.",
  "Slack is not set up.", "Slack is not connected.", "Slack is not connected any more.", "They stopped reminders on Slack.", "Slack asked to wait.",
  ...Object.values(NO_WAY_HERE),
  "Telegram is off in this workspace.", "Not connected to Telegram.", "They stopped reminders on Telegram.", "Telegram asked to wait.", "They blocked Ziffr's bot in Telegram.",
]);
/** The line shown for a reason that is not one of Ziffr's own. */
export const NOT_DELIVERED = "It could not be delivered.";
/** The reason a Prompt could not be made for this way at all. */
export const NOT_ASKED = "It could not be asked for this way.";

/** A Delivery's stored reason as it may be shown, or null when there is none. */
export function shownReason(lastError: string | null | undefined): string | null {
  if (!lastError) return null;
  return SHOWN_REASONS.has(lastError) || isNotSentReason(lastError) ? lastError : NOT_DELIVERED;
}

/** Sends the Metric's current Prompt to the actor now. Refused unless they own and submit the Metric; at most once
 * every ten minutes per Metric (claimed in the database, so two presses at once ask once). */
export async function askMeNow(actor: Actor, metricId: number): Promise<AskNowResult> {
  const [r] = await askMeNowBy(actor, metricId, []);
  if (r.state === "failed" && r.note === NOT_ASKED) throw new Error("This Metric cannot be asked for now.");
  return r;
}

/** Ask me now by the given Connectors, one Prompt each (the Trial Guide's picked ways), or by the actor's own
 * Connector when none is given. The same checks and the same ten-minute claim as askMeNow. One result per way: a way
 * that fails says so with a short reason and does not stop the others. */
export async function askMeNowBy(actor: Actor, metricId: number, via: ConnectorId[]): Promise<AskNowResult[]> {
  const ways = [...new Set(via)];
  if (ways.some((c) => !CONNECTOR_IDS.includes(c)) || ways.length > CONNECTOR_IDS.length) throw new Forbidden();
  if (!Number.isInteger(metricId) || !(await canAskNow(actor, metricId))) throw new Forbidden("Only a Metric's owner who also submits it can ask for it now.");
  const { data: claimed, error } = await db().rpc("claim_ask_now", { p_metric: metricId });
  if (error) throw new Error("Asking did not work. Try again.");
  if (!claimed) throw new Error(`It was asked a moment ago. Ask again in ${ASK_NOW_EVERY_MINUTES} minutes.`);
  const out: AskNowResult[] = [];
  for (const c of ways.length ? ways : [null]) {
    const fallback = c ?? "email";
    const since = new Date().toISOString();
    let asked: Awaited<ReturnType<typeof deliverPrompt>> = false;
    try {
      asked = (await deliverPrompt({ metricId, submitterId: actor.personId, senderId: null, via: c }));
    } catch (e) {
      console.error("Ask me now could not make a Prompt:", (e as Error).message);
    }
    if (!asked) {
      out.push({ connector: fallback, label: CONNECTORS[fallback].label, state: "failed", note: NOT_ASKED, chosen: true });
      continue;
    }
    const { data: d } = await db().from("deliveries").select("connector, mail_state, last_error").eq("workspace_id", actor.workspaceId)
      .eq("recipient_id", actor.personId).eq("kind", "prompt").gte("created_at", since).order("id", { ascending: false }).limit(1).maybeSingle();
    const connector = (d?.connector ?? fallback) as ConnectorId;
    const state = (["sent", "queued", "outbox", "failed"].includes(d?.mail_state) ? d!.mail_state : "outbox") as AskNowResult["state"];
    out.push({ connector, label: CONNECTORS[connector].label, state, note: shownReason(d?.last_error as string | null), chosen: asked.chosen });
  }
  return out;
}
