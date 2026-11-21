// Where a Prompt can reach a person (GLOSSARY: Prompt, Connector): reads what the pure decision (prompt-route.ts)
// needs, for the one place a Prompt's Delivery is made (deliveries.ts) and for the Metric page's preview.
import { db } from "./db";
import { addressIn, inboundEnabled, initialMailState } from "./mail";
import { slackSends } from "./slack-send";
import { slackBot } from "./slack-connection";
import { slackUserFor } from "./slack-people";
import { telegramSends } from "./telegram-send";
import { telegramChatOf } from "./telegram-people";
import { settingsInEffect } from "./settings-in-effect";
import { allowedWays, routePrompts, type PromptWay, type Route } from "./prompt-route";
import type { SourceId } from "./types";

/** Whether an email asking for a reply is answered in Ziffr: inbound mail is set up, or mail is only simulated here. */
export async function mailRepliesReturn(workspaceId: string): Promise<boolean> {
  const settings = await settingsInEffect();
  return initialMailState("email", workspaceId, settings) === "outbox" || inboundEnabled(settings);
}

/** Where this person can be reached now: Slack when the workspace sends on Slack and they are linked, Telegram when it
 * is on and they connected, email always (a person without a usable address fails with its own reason when sent). Nothing about the account is returned.
 * With `resolve`, a person not linked yet is looked up on Slack by their address, as sending would (a network call, so
 * only where a Prompt is really being made; a Slack that cannot be asked now counts as reachable, the send retries). */
export async function reachOf(workspaceId: string, personId: string, resolve = false): Promise<Record<PromptWay, boolean>> {
  const [slackOn, telegramOn, address] = await Promise.all([slackSends(workspaceId), telegramSends(workspaceId), addressIn(workspaceId, personId)]);
  const [slackLink, telegramLink] = await Promise.all([
    slackOn ? db().from("slack_links").select("person_id").eq("workspace_id", workspaceId).eq("person_id", personId).maybeSingle().then((r) => Boolean(r.data)) : false,
    telegramOn ? telegramChatOf(workspaceId, personId) : null,
  ]);
  let slack = slackLink;
  if (slackOn && !slack && resolve && address) {
    const bot = await slackBot(workspaceId);
    slack = bot ? await slackUserFor(bot, personId).then((m) => m.userId !== null, () => true) : false;
  }
  return { slack, telegram: Boolean(telegramLink), email: true };
}

/** The decision for one person and Metric: every way the Prompt goes by, in the person's order (`routes`; `route` is the
 * first, or none), with what it was made from (for a stored reason). With `resolve`, Slack is asked about a person not
 * linked yet only when it could change the outcome: the Metric accepts Slack, and the person's own ways did not already
 * decide it (Slack is named in their list, or comes first among the others). */
export async function planPrompt(workspaceId: string, personId: string, accepts: readonly SourceId[], chosen: string | readonly string[], resolve = false): Promise<{ route: Route; routes: Extract<Route, { via: PromptWay }>[]; mailReplies: boolean; reach: Record<PromptWay, boolean> }> {
  const list = typeof chosen === "string" ? [chosen] : chosen;
  const [mailReplies, first] = await Promise.all([mailRepliesReturn(workspaceId), reachOf(workspaceId, personId)]);
  let reach = first;
  let routes = routePrompts({ chosen: list, accepts, mailReplies, reach });
  if (resolve && allowedWays(accepts, mailReplies).slack && !reach.slack && (list.includes("slack") || !routes.some((r) => r.chosen))) {
    reach = await reachOf(workspaceId, personId, true);
    routes = routePrompts({ chosen: list, accepts, mailReplies, reach });
  }
  return { route: routes[0] ?? { via: null }, routes, mailReplies, reach };
}
