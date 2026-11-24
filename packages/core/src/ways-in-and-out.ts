// Ways in and out (spec 0052, ticket 8; GLOSSARY: Setup Guide, Connector, Source, Delivery Preference, Test Message): the
// step of the Setup Guide that says, for each way a number can come in or a person can be asked, whether it works on
// this Ziffr, what to press to make it work and who may press it. `wayCards` is pure: it turns what `whatWorksHere`
// says (the same facts the sending queue obeys, so the guide cannot say "ready" while a message is kept back) and what
// the viewer is into one card per way, with the words for what is missing. `waysInAndOut` reads those facts for the
// viewer, and `setMyPromptWays` saves the viewer's own Delivery Preference for Prompts, only with ways that really work.
// Visibility: a Member gets cards about themselves only (never an action that sets up the Workspace), a Guest and the
// demo get nothing, and no address, token or other person's link is returned, only states and words.
import { Forbidden, type Actor, type WorkspaceRoleName } from "./actor";
import { MAX_PROMPT_WAYS } from "./prompt-route";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { reachOf } from "./prompt-reach";
import { isInstallationAdmin } from "./installation-admins";
import { setPreference } from "./questions";
import { mySlackLink } from "./slack-people";
import { myTelegramLink } from "./telegram-people";
import { trialEndsAt } from "./trials";
import { trialGuide } from "./trial-guide";
import { whatWorksHere, type WayState } from "./what-works-here";

/** The ways the step lists, in the order it lists them. */
export const WAY_CARDS = ["web-form", "email", "slack", "telegram", "paste"] as const;
/** One of those ways. */
export type CardWay = (typeof WAY_CARDS)[number];

/** Where a person is sent for the words and steps of a missing way: the Installation settings page, and the guides. Fixed
 * addresses, never taken from input. */
export const INSTALLATION_PAGE = "/installation";
/** The self-hosting guides on the docs site, by what is missing. */
export const HOW_TO = {
  mail: "https://docs.ziffr.net/self-hosting/email/",
  slack: "https://docs.ziffr.net/self-hosting/slack/",
  telegram: "https://docs.ziffr.net/self-hosting/telegram/",
} as const;

/** What a card offers to press. `link-slack` makes a one-time code, `connect-telegram` a one-time link. */
export type CardAction = "add-slack" | "link-slack" | "turn-on-telegram" | "connect-telegram" | "paste";

/** The state of a card: it works (`ready`), one press makes it work for this viewer (`one-click`), someone else must
 * set it up in the Workspace (`ask-admin`: an Owner or Admin), this Ziffr lacks it (`missing-here`: whoever runs it) or
 * it cannot be used at all now (`unavailable`, a trial that has ended). */
export type CardStatus = "ready" | "one-click" | "ask-admin" | "missing-here" | "unavailable";

/** One way as the step shows it. */
export type WayCard = {
  way: CardWay;
  label: string;
  status: CardStatus;
  /** One line, in words, for the viewer. */
  line: string;
  /** What to press, or null. Never an action the viewer's role may not do. */
  action: CardAction | null;
  /** A second press (linking Slack by a code when the address does not find the person), or null. */
  also: CardAction | null;
  /** Whether "Send me a test" is shown: only for a way that reaches a person and works for them. */
  canTest: boolean;
  /** For a way this Ziffr lacks: where to read how, and, for an Installation Admin, the page that sets it up. */
  help: { guide: string; installationPage: string | null } | null;
  /** The limit that applies here (a trial's messages a day), or null. */
  limit: string | null;
};

/** What the cards are made from. */
export type CardInput = {
  /** What `whatWorksHere` says for the Workspace. */
  ways: readonly WayState[];
  role: WorkspaceRoleName;
  /** The viewer runs this Installation (so the missing way links its settings page). */
  installationAdmin: boolean;
  /** How Slack knows the viewer: by a code they sent, by their address, or not yet. */
  slackLink: "code" | "email" | null;
  /** The viewer connected their Telegram. */
  telegramLinked: boolean;
};

const PICKABLE = ["email", "slack", "telegram"] as const;
const manages = (role: WorkspaceRoleName) => role === "owner" || role === "admin";

/** The cards for one viewer, from `whatWorksHere` and who the viewer is. Pure. */
export function wayCards(i: CardInput): WayCard[] {
  const by = (w: string): WayState | undefined => i.ways.find((x) => x.way === w);
  const admin = manages(i.role);
  const missing = (guide: string): WayCard["help"] => ({ guide, installationPage: i.installationAdmin ? INSTALLATION_PAGE : null });
  // An Installation Admin is told where; anyone else is told whom to ask.
  const whoRuns = (what: string) => `This Ziffr has no ${what} yet. ${i.installationAdmin ? "You can add one on the Installation settings page." : "Whoever runs it adds one on its Installation settings page."}`;
  const card = (c: Partial<WayCard> & Pick<WayCard, "way" | "label" | "status" | "line">): WayCard => ({ action: null, also: null, canTest: false, help: null, limit: null, ...c });
  const ended = i.ways.length > 0 && i.ways.every((w) => w.state === "off" && /trial has ended/i.test(w.reason));
  const gone = (way: CardWay, label: string): WayCard => card({ way, label, status: "unavailable", line: "This trial has ended, so nothing is sent or taken any more." });

  const form = by("web-form");
  const mail = by("email");
  const replies = by("email-replies");
  const slack = by("slack");
  const telegram = by("telegram");
  const cards: WayCard[] = [];

  cards.push(ended || form?.state !== "real"
    ? gone("web-form", "Web form")
    : card({ way: "web-form", label: "Web form", status: "ready", line: "Every request carries a personal link that works without signing in. Nothing to set up." }));

  cards.push(ended ? gone("email", "Email")
    : mail?.state === "real"
      ? card({ way: "email", label: "Email", status: "ready", canTest: true, limit: mail.limit, line: replies?.state === "real" ? "Ziffr writes to the address you signed in with. Reply with the number, or use the link in the email." : "Ziffr writes to the address you signed in with. Answer by the link in the email: replies do not come back on this Ziffr." })
      : card({ way: "email", label: "Email", status: "missing-here", line: whoRuns("mail server"), help: missing(HOW_TO.mail) }));

  if (ended) cards.push(gone("slack", "Slack"));
  else if (slack?.state === "simulated" || !slack) cards.push(card({ way: "slack", label: "Slack", status: "missing-here", line: whoRuns("Slack app"), help: missing(HOW_TO.slack) }));
  else if (slack.state === "off") {
    cards.push(admin
      ? card({ way: "slack", label: "Slack", status: "one-click", action: "add-slack", line: "Not connected yet. Add Ziffr to your Slack workspace, and you come back here." })
      : card({ way: "slack", label: "Slack", status: "ask-admin", line: "Not connected yet. An Owner or Admin connects Slack." }));
  } else {
    cards.push(card({
      way: "slack", label: "Slack", status: "ready", canTest: true, limit: slack.limit,
      line: i.slackLink === "code" ? "Connected, and your Slack account is linked." : i.slackLink === "email" ? "Connected: Slack found you by your email address." : "Connected. Slack finds you by your email address; if your Slack address is another one, link your account.",
      also: i.slackLink ? null : "link-slack",
    }));
  }

  if (ended) cards.push(gone("telegram", "Telegram"));
  else if (telegram?.state === "simulated" || !telegram) cards.push(card({ way: "telegram", label: "Telegram", status: "missing-here", line: whoRuns("Telegram bot"), help: missing(HOW_TO.telegram) }));
  else if (telegram.state === "off") {
    cards.push(admin
      ? card({ way: "telegram", label: "Telegram", status: "one-click", action: "turn-on-telegram", line: "Turned off in this Workspace. Turn it on, then connect your own Telegram." })
      : card({ way: "telegram", label: "Telegram", status: "ask-admin", line: "Turned off in this Workspace. An Owner or Admin turns Telegram on." }));
  } else if (!i.telegramLinked) {
    cards.push(card({ way: "telegram", label: "Telegram", status: "one-click", action: "connect-telegram", limit: telegram.limit, line: "On in this Workspace. Connect your own Telegram to get messages there." }));
  } else {
    cards.push(card({ way: "telegram", label: "Telegram", status: "ready", canTest: true, limit: telegram.limit, line: "Your Telegram is connected: Ziffr messages reach you there." }));
  }

  // Paste records through the web form's Source, so it works wherever the web form does.
  cards.push(ended || form?.state !== "real"
    ? gone("paste", "Paste")
    : card({ way: "paste", label: "Paste", status: "ready", action: "paste", line: "Paste rows from a spreadsheet: the easiest way in when the numbers already sit in one." }));
  return cards;
}

/** The ways the viewer may pick for their Prompts: those that really go out here (not kept in the Outbox). */
export function askableWays(ways: readonly WayState[], reach: Reach = { email: true, slack: true, telegram: true }): ("email" | "slack" | "telegram")[] {
  return PICKABLE.filter((w) => reach[w] && ways.some((x) => x.way === w && x.state === "real"));
}

/** Where the person can be reached now (the delivery code's own `reachOf`): a way not linked to them would leave a Prompt
 * with no way to arrive, so it is not offered until they link it. */
export type Reach = Record<(typeof PICKABLE)[number], boolean>;

/** Ways that work on this Ziffr but that the person has not linked yet: shown disabled, with what to do first. */
export function lockedWays(ways: readonly WayState[], reach: Reach): ("slack" | "telegram")[] {
  return (["slack", "telegram"] as const).filter((w) => !reach[w] && ways.some((x) => x.way === w && x.state === "real"));
}

/** What to do first, in words, for a way the person has not linked. */
export const CONNECT_FIRST = { slack: "Connect your Slack first: link your account on the Ways in and out step.", telegram: "Connect your Telegram first: press Connect my Telegram on the Ways in and out step." } as const;

/** The links of More ways: Access Keys, assistants, Feeds (with the warehouse Feeds), Send values and, in a trial, the
 * guide's key for n8n. Links only, and only to pages the viewer may open. */
export type MoreWay = { label: string; href: string; what: string };

/** What the step shows the viewer. */
export type WaysInAndOut = {
  cards: WayCard[];
  /** The viewer's own Delivery Preference for Prompts, in order (only ways the step offers). */
  askedBy: ("email" | "slack" | "telegram")[];
  /** The ways the viewer may pick for it: those that work here. */
  askable: ("email" | "slack" | "telegram")[];
  /** Ways that work here but are not linked to this person yet: not pickable until they are. */
  locked: ("slack" | "telegram")[];
  more: MoreWay[];
  /** Whether the viewer sees the Workspace-level cards (Owners and Admins) or only their own ways (Members). */
  manages: boolean;
};

/** The step for the actor: the cards, their own Delivery Preference and the links for more ways. Never for a Guest, an
 * Access Key or the demo. */
export async function waysInAndOut(actor: Actor): Promise<WaysInAndOut> {
  if (actor.key) throw new Forbidden();
  refuseInDemo(actor);
  if (actor.role === "guest") throw new Forbidden();
  const [ways, installationAdmin, slackLink, telegramLink, prefs] = await Promise.all([
    whatWorksHere(actor),
    isInstallationAdmin(actor),
    mySlackLink(actor),
    myTelegramLink(actor),
    db().from("delivery_preferences").select("connector").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).eq("kind", "reminder").order("position"),
  ]);
  const reach = await reachOf(actor.workspaceId, actor.personId, true);
  const cards = wayCards({ ways, role: actor.role, installationAdmin, slackLink, telegramLinked: Boolean(telegramLink) });
  const askedBy = (prefs.data ?? []).map((p) => String(p.connector)).filter((c): c is (typeof PICKABLE)[number] => (PICKABLE as readonly string[]).includes(c));
  const owner = manages(actor.role);
  const more: MoreWay[] = [];
  if (owner) {
    more.push(
      { label: "A program", href: "/settings/keys", what: "Access Keys: a script or a system sends values with its own key." },
      { label: "An assistant", href: "/settings/assistants", what: "Claude and other assistants record and read numbers." },
      { label: "A Feed", href: "/settings/feeds", what: "Feeds and Feed Keys, including warehouse Feeds and the n8n templates." },
      { label: "Send values", href: "/connectors/send", what: "A command to copy for one of your Metrics, and n8n." },
    );
    // In a trial the guide's Feed Key for n8n stays one of the more ways (the trial's Owner has it on the Trial Guide).
    if (actor.role === "owner" && (await trialEndsAt(actor.workspaceId)) && (await trialGuide(actor).catch(() => null))) {
      more.push({ label: "A key for n8n", href: "/try/start", what: "Make a Feed Key for n8n and download a ready workflow." });
    }
  } else {
    more.push({ label: "Your own key", href: "/settings/keys", what: "An Access Key sends values as you, for the Metrics you submit to." });
  }
  return { cards, askedBy, askable: askableWays(ways, reach), locked: lockedWays(ways, reach), more, manages: owner };
}

/** Saves the actor's own Delivery Preference for Prompts: up to three ways in order, each once, only ways that really work
 * for them here (an empty list goes back to the team's default). Only their own, whatever their role. Untrusted input:
 * every way is checked against the ones this step offers and against `whatWorksHere`. */
export async function setMyPromptWays(actor: Actor, ways: unknown): Promise<void> {
  if (actor.key) throw new Forbidden();
  refuseInDemo(actor);
  if (actor.role === "guest") throw new Forbidden();
  if (!Array.isArray(ways) || ways.length > MAX_PROMPT_WAYS) throw new Forbidden("Choose up to three ways.");
  const list = ways.map((w) => String(w));
  if (!list.every((w): w is (typeof PICKABLE)[number] => (PICKABLE as readonly string[]).includes(w)) || new Set(list).size !== list.length) throw new Forbidden("Choose email, Slack or Telegram, each once.");
  const here = await whatWorksHere(actor);
  // Only a way that really goes out here: a way kept in the Outbox would leave the person with no request at all.
  if (list.some((w) => here.find((x) => x.way === w)?.state !== "real")) throw new Error("Only a way that works on this Ziffr can be chosen.");
  // A way real here but not linked to this person would leave their Prompts with nowhere to arrive.
  const reach = await reachOf(actor.workspaceId, actor.personId, true);
  for (const w of list as ("email" | "slack" | "telegram")[]) if (w !== "email" && !reach[w]) throw new Error(CONNECT_FIRST[w]);
  await setPreference(actor, actor.personId, "reminder", list.length ? (list as ("email" | "slack" | "telegram")[]) : null);
}
