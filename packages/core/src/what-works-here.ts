// What works here (spec 0021; GLOSSARY: Connector, Source, Trial Workspace, Demo Mode): for each way in and out of
// Ziffr, whether it is real, simulated or off where the person is, why, and the limit that applies. Built from the
// settings in effect and the checks the delivery queue and the API use (mailEnabled, slackSends, telegramOnIn, the
// demo and trial rules), so the explanation can never say "real" while the queue keeps a message back. Every page that sets
// expectations reads this; none writes its own list. It holds no workspace data beyond whether Slack or Telegram is on.
import type { Actor } from "./actor";
import { db } from "./db";
import { inboundEnabled, mailEnabled } from "./mail";
import { settingsInEffect, settingsInEffectStrict, type Settings } from "./settings-in-effect";
import { slackEnabled } from "./slack-api";
import { slackSends } from "./slack-send";
import { telegramEnabled } from "./telegram-api";
import { telegramOnIn } from "./telegram-connection";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialEndsAt, trialSettings } from "./trials";
import { trialLimitsFrom } from "./trial-limits";

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

/** What works in the actor's workspace (the demo, a Trial Workspace or an ordinary one), by the settings in effect
 * unless others are given. */
export async function whatWorksHere(actor: Pick<Actor, "workspaceId">, given?: Settings): Promise<WayState[]> {
  const env = given ?? (await settingsInEffect());
  if (actor.workspaceId === DEMO_WORKSPACE_ID) {
    const sim = "The demo sends nothing: messages appear in the Outbox, and you answer them in the simulator.";
    return [
      way("email", "simulated", sim), way("email-replies", "simulated", sim), way("slack", "simulated", sim), way("telegram", "simulated", sim),
      way("web-form", "simulated", "Form links open, for the demo's made-up people, but nothing sent there is saved."),
      way("api", "off", "The demo has no Access Keys, so programs cannot reach it."), way("mcp", "off", "The demo has no Access Keys, so assistants cannot reach it."),
      way("feeds", "off", "The demo has no Feeds."), way("whatsapp", "simulated", sim), way("tickets", "simulated", sim),
    ];
  }
  const ends = await trialEndsAt(actor.workspaceId);
  const trial = ends !== null;
  const limits = trialLimitsFrom(env);
  const ended = trial && ends!.getTime() <= Date.now();
  if (ended) {
    const gone = "This trial has ended: nothing is sent or taken any more.";
    return WAYS.map((w) => way(w, "off", gone));
  }
  const toOwner = trial ? `To you only, at most ${limits.messagesPerDay} messages a day over email, Slack and Telegram together.` : null;
  const [slackOn, telegramOn] = await Promise.all([slackSends(actor.workspaceId), telegramOnIn(actor.workspaceId)]);
  return [
    mailEnabled(env) ? way("email", "real", trial ? "Sent to the address you signed in with." : "Sent to each person's own address.", toOwner)
      : way("email", "simulated", "This Ziffr has no mail server, so emails stay in the Outbox. Whoever runs it can set one up on its Installation settings page."),
    inboundEnabled(env) ? way("email-replies", "real", "Replying to an email with a number records it.")
      : way("email-replies", "off", mailEnabled(env) ? "Replies do not come back on this Ziffr: answer by the form link in the email." : "This Ziffr has no mail server."),
    !slackEnabled(env) ? way("slack", "simulated", "This Ziffr has no Slack app, so Slack messages stay in the Outbox. Whoever runs it can set one up on its Installation settings page.")
      : slackOn ? way("slack", "real", trial ? "Direct messages to you in your Slack workspace." : "Direct messages in your Slack workspace.", toOwner)
        : way("slack", "off", "Not connected yet: an Owner or Admin connects a Slack workspace on the Connectors page."),
    !telegramEnabled(env) ? way("telegram", "simulated", "This Ziffr has no Telegram bot, so Telegram messages stay in the Outbox. Whoever runs it can add one on its Installation settings page.")
      : telegramOn ? way("telegram", "real", "Messages from the bot once you connect your Telegram on the Connectors page.", toOwner)
        : way("telegram", "off", "Turned off: an Owner or Admin turns Telegram on on the Connectors page."),
    way("web-form", "real", "Every request for a value has a personal form link that works without signing in."),
    way("api", "real", "Programs send and read values with an Access Key.", trial ? `At most ${limits.keys} Access Keys, none past the trial's last day.` : null),
    way("mcp", "real", "Claude and other assistants work through the MCP Server with an Access Key.", trial ? `At most ${limits.assistants} ${limits.assistants === 1 ? "assistant" : "assistants"} at a time, none past the trial's last day.` : null),
    way("feeds", "real", "Programs such as an n8n automation send values with a Feed Key.", trial ? `At most ${limits.feeds} Feeds with ${limits.feeds} keys each.` : null),
    way("whatsapp", "simulated", "Not available yet: WhatsApp messages stay in the Outbox."),
    way("tickets", "simulated", "Not available yet: tickets stay in the Outbox."),
  ];
}

/** What this Ziffr offers someone who has not signed in (the demo, and whether trials are offered and what works in
 * one), by the settings in effect unless others are given. No workspace data, so the login page may show it to anyone. */
export async function whatThisZiffrOffers(given?: Settings): Promise<{ demo: boolean; trial: { days: number; ways: WayState[] } | null }> {
  const env = given ?? (await settingsInEffect());
  // Whether trials are offered comes from the strict read: settings that cannot be read mean none (fail closed).
  const trialEnv = given ?? (await settingsInEffectStrict().catch(() => null));
  let settings: { days: number; max: number } | null = null;
  try { settings = trialEnv ? trialSettings(trialEnv) : null; } catch { settings = null; }
  const demo = env.ZIFFR_DEMO_ONLY === "1" || env.ZIFFR_DEMO !== "0";
  if (!settings) return { demo, trial: null };
  const limits = trialLimitsFrom(env);
  const toYou = `To you only, at most ${limits.messagesPerDay} messages a day.`;
  const ways = [
    mailEnabled(env) ? way("email", "real", "Requests for values reach the address you sign in with.", toYou) : way("email", "simulated", "This Ziffr has no mail server. Whoever runs it can set one up on its Installation settings page."),
    inboundEnabled(env) ? way("email-replies", "real", "Reply with a number to record it.") : way("email-replies", "off", "Answer by the form link instead."),
    slackEnabled(env) ? way("slack", "real", "Connect your own Slack workspace.", toYou) : way("slack", "simulated", "This Ziffr has no Slack app. Whoever runs it can set one up on its Installation settings page."),
    telegramEnabled(env) ? way("telegram", "real", "Connect your own Telegram.", toYou) : way("telegram", "simulated", "This Ziffr has no Telegram bot. Whoever runs it can add one on its Installation settings page."),
    way("api", "real", "Programs with an Access Key.", `At most ${limits.keys} keys.`),
    way("mcp", "real", "Claude and other assistants.", `At most ${limits.assistants} ${limits.assistants === 1 ? "assistant" : "assistants"} at a time.`),
    way("feeds", "real", "n8n, scripts and other programs with a Feed Key.", `At most ${limits.feeds} Feeds.`),
  ];
  return { demo, trial: { days: settings.days, ways } };
}

/** Which ways have worked in the actor's workspace: a value arrived by them. For the Try it page; Owners only, since it looks at every value of the workspace. Counts only. */
export async function waysTried(actor: Pick<Actor, "workspaceId" | "role">): Promise<Record<Way, boolean>> {
  const none = Object.fromEntries(WAYS.map((w) => [w, false])) as Record<Way, boolean>;
  if (actor.role !== "owner") return none;
  const ws = actor.workspaceId;
  const count = async (q: PromiseLike<{ count: number | null }>) => ((await q).count ?? 0) > 0;
  const by = (source: string) => count(db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("source", source));
  const { data: feeds } = await db().from("feeds").select("person_id").eq("workspace_id", ws);
  const feedIds = (feeds ?? []).map((f) => f.person_id as string);
  const [email, slack, telegram, form, keyed, fed, replied] = await Promise.all([
    by("mail"), by("slack"), by("telegram"), by("web_form"),
    // A value sent with a person's Access Key: by a program or an assistant, which look the same to Ziffr.
    count(db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).not("access_key_id", "is", null)),
    feedIds.length ? count(db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).in("submitter_id", feedIds)) : Promise.resolve(false),
    count(db().from("inbound_emails").select("id", { count: "exact", head: true }).eq("workspace_id", ws).in("outcome", ["recorded", "replied", "corrected"])),
  ]);
  return { ...none, email, "email-replies": replied && email, slack, telegram, "web-form": form, api: keyed, mcp: keyed, feeds: fed };
}
