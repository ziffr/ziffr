// What works here (spec 0021; GLOSSARY: Connector, Source, Trial Workspace, Demo Mode): for each way in and out of
// Ziffr, whether it is real, simulated or off where the person is, why, and the limit that applies. Built from the
// same settings and checks the delivery queue and the API use (mailEnabled, slackSends, telegramOnIn, the demo and
// trial rules), so the explanation can never say "real" while the queue keeps a message back. Every page that sets
// expectations reads this; none writes its own list. It holds no workspace data beyond whether Slack or Telegram is on.
import type { Actor } from "./actor";
import { inboundEnabled, mailEnabled } from "./mail";
import { slackEnabled } from "./slack-api";
import { slackSends } from "./slack-send";
import { telegramEnabled } from "./telegram-api";
import { telegramOnIn } from "./telegram-connection";
import { DEMO_WORKSPACE_ID } from "./team";
import { TRIAL_DELIVERIES_PER_DAY, TRIAL_KEYS_MAX, trialEndsAt, trialSettings } from "./trials";

/** The ways values and messages travel, in the order pages list them. */
export const WAYS = ["email", "email-replies", "slack", "telegram", "web-form", "api", "mcp", "feeds", "whatsapp", "tickets"] as const;
/** One of those ways. */
export type Way = (typeof WAYS)[number];

/** One way: real (it really goes out or comes in), simulated (shown in the Outbox or the simulator only), or off. */
export type WayState = { way: Way; label: string; state: "real" | "simulated" | "off"; reason: string; limit: string | null };

const LABEL: Record<Way, string> = {
  email: "Email", "email-replies": "Replies by email", slack: "Slack", telegram: "Telegram", "web-form": "Web form",
  api: "API", mcp: "AI assistants (MCP)", feeds: "Feeds", whatsapp: "WhatsApp", tickets: "Ticket system",
};

const way = (w: Way, state: WayState["state"], reason: string, limit: string | null = null): WayState => ({ way: w, label: LABEL[w], state, reason, limit });

/** What works in the actor's workspace: the demo, a Trial Workspace or an ordinary one. */
export async function whatWorksHere(actor: Pick<Actor, "workspaceId">, env: Record<string, string | undefined> = process.env): Promise<WayState[]> {
  if (actor.workspaceId === DEMO_WORKSPACE_ID) {
    const sim = "The demo sends nothing: messages appear in the Outbox, and you answer them in the simulator.";
    return [
      way("email", "simulated", sim), way("email-replies", "simulated", sim), way("slack", "simulated", sim), way("telegram", "simulated", sim),
      way("web-form", "real", "Form links work, for the demo's made-up people."),
      way("api", "off", "The demo has no Access Keys, so programs cannot reach it."), way("mcp", "off", "The demo has no Access Keys, so assistants cannot reach it."),
      way("feeds", "off", "The demo has no Feeds."), way("whatsapp", "simulated", sim), way("tickets", "simulated", sim),
    ];
  }
  const ends = await trialEndsAt(actor.workspaceId);
  const trial = ends !== null;
  const ended = trial && ends!.getTime() <= Date.now();
  if (ended) {
    const gone = "This trial has ended: nothing is sent or taken any more.";
    return WAYS.map((w) => way(w, "off", gone));
  }
  const toOwner = trial ? `To you only, at most ${TRIAL_DELIVERIES_PER_DAY} messages a day over email, Slack and Telegram together.` : null;
  const [slackOn, telegramOn] = await Promise.all([slackSends(actor.workspaceId), telegramOnIn(actor.workspaceId)]);
  return [
    mailEnabled(env) ? way("email", "real", trial ? "Sent to the address you signed in with." : "Sent to each person's own address.", toOwner)
      : way("email", "simulated", "This Ziffr has no mail server, so emails stay in the Outbox."),
    inboundEnabled(env) ? way("email-replies", "real", "Replying to an email with a number records it.")
      : way("email-replies", "off", mailEnabled(env) ? "Replies do not come back on this Ziffr: answer by the form link in the email." : "This Ziffr has no mail server."),
    !slackEnabled(env) ? way("slack", "simulated", "This Ziffr has no Slack app, so Slack messages stay in the Outbox.")
      : slackOn ? way("slack", "real", trial ? "Direct messages to you in your Slack workspace." : "Direct messages in your Slack workspace.", toOwner)
        : way("slack", "off", "Not connected yet: an Owner or Admin connects a Slack workspace on the Connectors page."),
    !telegramEnabled(env) ? way("telegram", "simulated", "This Ziffr has no Telegram bot, so Telegram messages stay in the Outbox.")
      : telegramOn ? way("telegram", "real", "Messages from the bot once you connect your Telegram on the Connectors page.", toOwner)
        : way("telegram", "off", "Turned off: an Owner or Admin turns Telegram on on the Connectors page."),
    way("web-form", "real", "Every request for a value has a personal form link that works without signing in."),
    way("api", "real", "Programs send and read values with an Access Key.", trial ? `At most ${TRIAL_KEYS_MAX} Access Keys, none past the trial's last day.` : null),
    way("mcp", "real", "Claude and other assistants work through the MCP Server with an Access Key.", trial ? `At most ${TRIAL_KEYS_MAX} Access Keys, none past the trial's last day.` : null),
    way("feeds", "real", "Programs such as an n8n automation send values with a Feed Key.", trial ? `At most ${TRIAL_KEYS_MAX} Feeds with ${TRIAL_KEYS_MAX} keys each.` : null),
    way("whatsapp", "simulated", "Not available yet: WhatsApp messages stay in the Outbox."),
    way("tickets", "simulated", "Not available yet: tickets stay in the Outbox."),
  ];
}

/** What this Ziffr offers someone who has not signed in: the demo, and whether trials are offered and what works in
 * one. No workspace data at all, so the login page may show it to anyone. */
export function whatThisZiffrOffers(env: Record<string, string | undefined> = process.env): { demo: boolean; trial: { days: number; ways: WayState[] } | null } {
  let settings: { days: number; max: number } | null = null;
  try { settings = trialSettings(env); } catch { settings = null; }
  const demo = env.ZIFFR_DEMO_ONLY === "1" || env.ZIFFR_DEMO !== "0";
  if (!settings) return { demo, trial: null };
  const toYou = `To you only, at most ${TRIAL_DELIVERIES_PER_DAY} messages a day.`;
  const ways = [
    mailEnabled(env) ? way("email", "real", "Requests for values reach the address you sign in with.", toYou) : way("email", "simulated", "This Ziffr has no mail server."),
    inboundEnabled(env) ? way("email-replies", "real", "Reply with a number to record it.") : way("email-replies", "off", "Answer by the form link instead."),
    slackEnabled(env) ? way("slack", "real", "Connect your own Slack workspace.", toYou) : way("slack", "simulated", "This Ziffr has no Slack app."),
    telegramEnabled(env) ? way("telegram", "real", "Connect your own Telegram.", toYou) : way("telegram", "simulated", "This Ziffr has no Telegram bot."),
    way("api", "real", "Programs with an Access Key.", `At most ${TRIAL_KEYS_MAX} keys.`),
    way("mcp", "real", "Claude and other assistants.", `At most ${TRIAL_KEYS_MAX} keys.`),
    way("feeds", "real", "n8n, scripts and other programs with a Feed Key.", `At most ${TRIAL_KEYS_MAX} Feeds.`),
  ];
  return { demo, trial: { days: settings.days, ways } };
}
