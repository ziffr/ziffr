// What a Metric's owner is told when someone stops requests for numbers (GLOSSARY: Prompt, Submitter, Delivery):
// which of the owner's numbers are concerned, who is still asked, and what stays empty. Everyday words, no guessed
// pronoun. Pure: email-opt-out.ts reads the facts, and only ever gives it Metrics the reader owns.
import { listed } from "./pack-places";
import { WAY_LABEL, type PromptWay } from "./prompt-route";

/** One of the owner's Metrics that the person who stopped sends values for. */
export type StoppedMetric = {
  name: string;
  slug: string;
  /** The ways the person is still asked for it. */
  still: PromptWay[];
  /** Others who are still asked for it, by name; "You" for the reader. */
  others: string[];
  /** The Feeds that send it. */
  feeds: string[];
  /** Whether the person's personal form link takes its values. */
  form: boolean;
};

const WHERE: Record<PromptWay, string> = { email: "by email", slack: "on Slack", telegram: "on Telegram" };

/** The Metrics that share an answer to `of`, as pairs of that answer and their names, leaving out empty answers. */
function grouped(metrics: StoppedMetric[], of: (m: StoppedMetric) => string[]): { who: string[]; names: string[] }[] {
  const out = new Map<string, { who: string[]; names: string[] }>();
  for (const m of metrics) {
    const who = of(m);
    if (!who.length) continue;
    const key = JSON.stringify(who);
    if (!out.has(key)) out.set(key, { who, names: [] });
    out.get(key)!.names.push(m.name);
  }
  return [...out.values()];
}

/** Who still brings the numbers in, and which numbers nobody is asked for any more. */
function whatRemains(metrics: StoppedMetric[]): string[] {
  const lines: string[] = [];
  for (const g of grouped(metrics, (m) => m.still.map((w) => WAY_LABEL[w]))) {
    lines.push(`Ziffr still asks them on ${listed(g.who)}${g.names.length === metrics.length ? "" : ` for ${listed(g.names)}`}.`);
  }
  for (const g of grouped(metrics, (m) => m.others)) lines.push(`${listed(g.who)} ${g.who.length === 1 && g.who[0] !== "You" ? "is" : "are"} still asked for ${listed(g.names)}.`);
  for (const g of grouped(metrics, (m) => m.feeds)) lines.push(`The ${g.who.length === 1 ? "Feed" : "Feeds"} ${listed(g.who)} still ${g.who.length === 1 ? "sends" : "send"} ${listed(g.names)}.`);
  const empty = metrics.filter((m) => !m.still.length && !m.others.length && !m.feeds.length);
  if (!empty.length) return lines;
  if (empty.length < metrics.length) lines.push(`Nobody else is asked for ${listed(empty.map((m) => m.name))}, so ${empty.length === 1 ? "it" : "they"} will stay empty.`);
  else lines.push(empty.length === 1 ? "Nobody else is asked for it, so it will stay empty." : "Nobody else is asked for these, so they will stay empty.");
  return lines;
}

/** The notice to one owner: its subject, its words and the path its button opens (Who submits of the first Metric left
 * empty, else of the first). The reader owns every Metric given, and so is no Guest. */
export function stopNotice(name: string, way: PromptWay, metrics: StoppedMetric[]): { subject: string; text: string; link: string } {
  const subject = `${name} is no longer asked for numbers ${WHERE[way]}`;
  const first = way === "email" ? `${name} unsubscribed, so Ziffr can't ask them by email for:` : `${name} stopped requests ${WHERE[way]}, so Ziffr can't ask them there for:`;
  const list = [first, ...metrics.map((m) => `- ${m.name}`)];
  const target = metrics.find((m) => !m.still.length && !m.others.length && !m.feeds.length) ?? metrics[0];
  const page = metrics.length === 1 ? "on the Metric's page" : "on each Metric's page";
  const form = metrics.some((m) => m.form);
  const action = form ? `Choose someone else, or send ${name} a link to enter ${metrics.length === 1 ? "it" : "them"}, ${page}.` : `You can choose someone else ${page}.`;
  return { subject, text: [...list, "", ...whatRemains(metrics), "", action].join("\n"), link: `/metrics/${target.slug}?tab=settings#who-submits` };
}
