// The rules for Webhooks in a Trial Workspace (GLOSSARY: Webhook, Trial Workspace; spec 0037, "Trial Workspaces"; ticket
// #646): a trial may hold Webhooks, within smaller limits, reaching public addresses only, unless the operator turns that
// off (ZIFFR_TRIAL_WEBHOOKS, Installation settings → Trials; the numbers are Trial Limits). One place answers what a Workspace's Webhooks may do, so
// creating, testing and sending (and Personal Webhooks, spec 0037 ticket 1) all apply the same rules.
import { operatorPrivateHosts } from "./outbound-request";
import { heldBack, PRACTICE_REFUSED } from "./practice";
import { sendingLimit } from "./sending-limit";
import { settingsInEffectStrict, type Settings } from "./settings-in-effect";
import { trialEndsAt } from "./trials";
import { trialLimitsFrom } from "./trial-limits";

/** Whether the Installation lets trials have Webhooks: on unless ZIFFR_TRIAL_WEBHOOKS says otherwise. Any value that is
 * set and is not clearly "on" counts as off, so a mistyped value never opens an outbound path to strangers. */
export function trialWebhooksOn(settings: Settings): boolean {
  const raw = settings.ZIFFR_TRIAL_WEBHOOKS?.trim().toLowerCase();
  return !raw || ["true", "1", "on", "yes"].includes(raw);
}

/** What a Workspace's Webhooks may do. `allowed` is false in a trial that has ended or where the operator turned trial
 * Webhooks off; `privateHosts` is the operator's list for ordinary Workspaces and always empty in a trial. */
export type WebhookRules = { trial: boolean; allowed: boolean; why: string | null; maxWebhooks: number; sendsPerDay: number; privateHosts: string[] };

/** The words for a refusal in a trial. */
export const TRIAL_WEBHOOKS_OFF = "Webhooks are switched off for trials on this Ziffr.";
const TRIAL_ENDED = "This trial has ended: nothing is sent any more.";

/** The rules for one Workspace by its trial and the settings in effect unless others are given. Never reads a person's
 * data: a Workspace id and the Installation's settings only. */
export async function webhookRules(workspaceId: string, given?: Settings): Promise<WebhookRules> {
  // Nothing leaves a Practice Workspace (spec 0063): no Webhook there is made, tested or sent to.
  if (await heldBack(workspaceId, "webhook")) return { trial: false, allowed: false, why: PRACTICE_REFUSED, maxWebhooks: 0, sendsPerDay: 0, privateHosts: [] };
  // trialEndsAt turns a trial that has ended into an ordinary Workspace first where trials are kept (spec 0029).
  const [ends, perWorkspace, sendsPerDay] = await Promise.all([trialEndsAt(workspaceId), sendingLimit("webhooksPerWorkspace"), sendingLimit("webhookSendsPerWorkspace")]);
  if (!ends) return { trial: false, allowed: true, why: null, maxWebhooks: perWorkspace, sendsPerDay, privateHosts: operatorPrivateHosts() };
  // Only a trial reads the operator's switch, and it fails closed: settings that cannot be read count as off.
  let on = false;
  let settings: Settings = {};
  try { settings = given ?? (await settingsInEffectStrict()); on = trialWebhooksOn(settings); } catch { on = false; }
  const limits = trialLimitsFrom(settings);
  // A Trial Limit of 0 Webhooks switches them off for trials just as the setting does.
  const why = ends.getTime() <= Date.now() ? TRIAL_ENDED : on && limits.webhooks > 0 ? null : TRIAL_WEBHOOKS_OFF;
  // The operator's private hosts never apply in a trial: a trial reaches public addresses only.
  return { trial: true, allowed: why === null, why, maxWebhooks: Math.min(perWorkspace, limits.webhooks), sendsPerDay: Math.min(sendsPerDay, limits.webhookSendsPerDay), privateHosts: [] };
}
