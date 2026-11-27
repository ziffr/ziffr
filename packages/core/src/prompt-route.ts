// Where a Prompt goes (GLOSSARY: Prompt, Delivery Preference, Source). One pure decision: the way the person chose in
// "Who gets what, where" counts only if the Metric accepts answers that way; otherwise the first way both allow, in a
// fixed order, where the person can be reached. Pure: no database, so the whole table is unit-tested.
import type { SourceId } from "./types";

/** The ways a Prompt can go: by chat on Slack or Telegram (the answer is a reply), or by email (a reply, a form link). */
export type PromptWay = "slack" | "telegram" | "email";
/** The most ways one person's Prompts go by at once (GLOSSARY: Delivery Preference). */
export const MAX_PROMPT_WAYS = 3;
/** The order tried when the person's own choice is not allowed or cannot reach them. */
export const PROMPT_WAYS: readonly PromptWay[] = ["slack", "telegram", "email"];

/** What the decision needs to know, all of it already read. */
export type RouteInput = {
  /** The Connector the person chose (or their team's, or email) for Prompts; any id, only the three ways count. */
  chosen: string;
  /** The Metric's Sources: how values may arrive. */
  accepts: readonly SourceId[];
  /** Whether a reply by email comes back into Ziffr (inbound mail is set up). */
  mailReplies: boolean;
  /** Where the person can be reached right now. */
  reach: Record<PromptWay, boolean>;
};

/** Whether the Metric lets a Prompt go this way at all, and for email what the message may offer. */
export function allowedWays(accepts: readonly SourceId[], mailReplies: boolean): Record<PromptWay, boolean> {
  return {
    slack: accepts.includes("slack"),
    telegram: accepts.includes("telegram"),
    // An email is useful with a form link (Web form accepted) or as a reply (Mail accepted, and replies come back).
    email: accepts.includes("web_form") || (accepts.includes("mail") && mailReplies),
  };
}

/** The decision for one way: the way, whether it is the person's own choice, and what the message may offer; or no way. */
export type Route =
  | { via: PromptWay; chosen: boolean; answerHere: boolean; formLink: boolean }
  | { via: null };

/** What the decision needs when the person chose several ways, in their order. */
export type RoutesInput = Omit<RouteInput, "chosen"> & { chosen: readonly string[] };

/** How a Prompt goes by one way: whether the answer is a reply there, or a form link in an email. */
function routeVia(way: PromptWay, chosen: boolean, i: Pick<RouteInput, "accepts" | "mailReplies">): Route {
  const replyByMail = way === "email" && i.accepts.includes("mail") && i.mailReplies;
  return { via: way, chosen, answerHere: way !== "email" || replyByMail, formLink: way === "email" && !replyByMail };
}

/** Decides where a Prompt goes when the person chose several ways (GLOSSARY: Delivery Preference): every way of their
 * list, in their order, that the Metric allows and that reaches them, once each. When none of their own works, the first
 * way both allow in the fixed order, as for one way. Never a form link for a Metric that refuses the Web form, never a
 * request to reply by email when Mail is off (or replies do not come back); an empty list when no allowed way reaches
 * the person: nothing is sent elsewhere. */
export function routePrompts(i: RoutesInput): Extract<Route, { via: PromptWay }>[] {
  const allowed = allowedWays(i.accepts, i.mailReplies);
  const usable = (w: PromptWay) => allowed[w] && i.reach[w];
  const own = [...new Set(i.chosen)].filter((c): c is PromptWay => (PROMPT_WAYS as readonly string[]).includes(c) && usable(c as PromptWay));
  const ways = own.length ? own : PROMPT_WAYS.filter(usable).slice(0, 1);
  return ways.map((w) => routeVia(w, own.length > 0, i) as Extract<Route, { via: PromptWay }>);
}

/** Decides where a Prompt goes for one chosen way: the first of `routePrompts`, or no way. */
export function routePrompt(i: RouteInput): Route {
  return routePrompts({ ...i, chosen: [i.chosen] })[0] ?? { via: null };
}

/** Whether a stored reason is one `notSentReason` wrote (and so may be shown as it is). */
export const isNotSentReason = (s: string): boolean => /^Not sent: this Metric takes values (only by [A-Za-z ,]+, and they [A-Za-z ]+|by none of [A-Za-z ,]+)\.$/.test(s) && s.length <= 200;

/** How a stored reason for a Prompt that was not sent begins. */
export const NOT_SENT = "Not sent:";

/** Each way in words. */
export const WAY_LABEL: Record<PromptWay, string> = { slack: "Slack", telegram: "Telegram", email: "email" };
/** Why a way does not reach the person, in words. */
const UNREACHABLE: Record<PromptWay, string> = { slack: "have no linked Slack account", telegram: "have not connected Telegram", email: "have no email address" };

/** The ways the Metric allows, named for a sentence: "Slack", "Slack or Telegram". */
function named(ways: PromptWay[]): string {
  const labels = ways.map((w) => WAY_LABEL[w]);
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}` : labels[0];
}

/** Why a Delivery by a way the person stopped is not sent, as it is stored and shown in the Outbox. */
export const STOPPED_REASON: Record<PromptWay, string> = { email: "They unsubscribed from requests by email.", slack: "They stopped reminders on Slack.", telegram: "They stopped reminders on Telegram." };
/** A way someone stopped, as it stands beside their name under Who submits. */
export const STOPPED_LINE: Record<PromptWay, string> = { email: "Not asked by email (unsubscribed)", slack: "Not asked on Slack (they stopped it)", telegram: "Not asked on Telegram (they stopped it)" };
/** A way someone stopped, said to that person themselves. */
export const STOPPED_SELF: Record<PromptWay, string> = { email: "You stopped requests for numbers by email.", slack: "You stopped requests for numbers on Slack.", telegram: "You stopped requests for numbers on Telegram." };

/** Why no way reaches the person, as a sentence without any names (a stored reason holds none: Metric names are sealed):
 * "Not sent: this Metric takes values only by Slack, and they have no linked Slack account." */
export function notSentReason(accepts: readonly SourceId[], mailReplies: boolean, reach: Record<PromptWay, boolean>): string {
  const allowed = PROMPT_WAYS.filter((w) => allowedWays(accepts, mailReplies)[w]);
  if (!allowed.length) return `${NOT_SENT} this Metric takes values by none of Slack, Telegram, email replies or the Web form.`;
  const why = allowed.filter((w) => !reach[w]).map((w) => UNREACHABLE[w]);
  return `${NOT_SENT} this Metric takes values only by ${named(allowed)}, and they ${why.join(" and ")}.`;
}

/** The place to fix it for a way the person cannot be reached by: where they connect it. */
export const FIX_HREF: Record<PromptWay, string> = { slack: "/connectors", telegram: "/connectors", email: "/settings/profile" };

/** The next Prompt as the Metric page says it, per submitter: where it goes and why, or what to fix. `stopped` names a
 * way they stopped while another way still reaches them. */
export type RouteView = { ok: boolean; text: string; why: string | null; fix: { label: string; href: string } | null; stopped?: string };

const FIX_LABEL: Record<PromptWay, string> = { slack: "Link Slack", telegram: "Connect Telegram", email: "Add an email address" };

/** Words for the decision. `chosen` is the person's own way (any Connector id); `route` is what routePrompt decided from
 * the same input. A way they chose that the Metric refuses, or that cannot reach them, is named with the reason. */
export function describeRoute(i: RouteInput, route: Route): RouteView {
  const allowed = allowedWays(i.accepts, i.mailReplies);
  if (!route.via) {
    const first = PROMPT_WAYS.find((w) => allowed[w]);
    return { ok: false, text: first ? `Can’t reach: ${FIX_LABEL[first][0].toLowerCase()}${FIX_LABEL[first].slice(1)}` : "Can’t ask: no way a request can go by", why: notSentReason(i.accepts, i.mailReplies, i.reach).replace(`${NOT_SENT} `, ""), fix: first ? { label: FIX_LABEL[first], href: FIX_HREF[first] } : null };
  }
  const text = `By ${WAY_LABEL[route.via]}`;
  if (route.chosen) return { ok: true, text, why: null, fix: null };
  const known = (PROMPT_WAYS as readonly string[]).includes(i.chosen);
  const own = known ? WAY_LABEL[i.chosen as PromptWay] : null;
  const why = !own ? null
    : !allowed[i.chosen as PromptWay] ? `They chose ${own}, but this Metric does not take values by ${own}.`
    : `They chose ${own}, but it does not reach them.`;
  return { ok: true, text, why, fix: known && allowed[i.chosen as PromptWay] ? { label: FIX_LABEL[i.chosen as PromptWay], href: FIX_HREF[i.chosen as PromptWay] } : null };
}

/** The next Prompt as the Metric page says it when it goes by several ways at once: "By Slack and Telegram". One way is
 * described as `describeRoute` does; for several, the first way's reason or fix stays, and the text names them all. */
export function describeRoutes(i: RoutesInput, routes: readonly Route[]): RouteView {
  const first = routes[0] ?? { via: null };
  const one = { ...i, chosen: i.chosen[0] ?? "" };
  const view = describeRoute(one, first);
  if (routes.length < 2) return view;
  const labels = routes.map((r) => WAY_LABEL[r.via as PromptWay]);
  return { ...view, text: `By ${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` };
}

/** As `describeRoutes`, with the ways the person stopped taken out: nothing is sent by them (mail.ts, slack-send.ts,
 * telegram-send.ts hold such a message back). A way they stopped is said when the Metric would allow it, also when
 * their own choice does not name it. With every planned way stopped, nothing asks them: `ok` is false. */
export function describeWithStops(i: RoutesInput, routes: readonly Route[], stopped: ReadonlySet<PromptWay>): RouteView {
  const allowed = allowedWays(i.accepts, i.mailReplies);
  const lines = PROMPT_WAYS.filter((w) => stopped.has(w) && allowed[w]).map((w) => STOPPED_LINE[w]).join(". ");
  if (!lines) return describeRoutes(i, routes);
  const open = routes.filter((r) => r.via !== null && !stopped.has(r.via));
  if (!open.length && routes.length) return { ok: false, text: lines, why: null, fix: null };
  return { ...describeRoutes(i, open), stopped: lines };
}
