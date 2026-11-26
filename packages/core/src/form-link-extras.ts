// What the form link's page adds for its own person once they are signed in (spec 0055, ticket #1134; GLOSSARY: Token,
// Submitter, Schedule): the last value, the period an address may name, and the next value due. It only reads, and adds
// no right: everything comes from the Record a value offer and the person's own Schedule. A link holder who is not that
// signed-in person gets nothing from here.
import type { Actor } from "./actor";
import { db } from "./db";
import { recordingOffer, recordingOffers } from "./record-own-value";
import { schedule } from "./schedule";
import { tokenValid, type TokenRow } from "./tokens";

/** A value the person still owes and can record: no Token code, only what leads to it through a signed-in address. */
export type NextValueDue = { slug: string; name: string; period: string; periodLabel: string };

/** What the page may show the signed-in person whose form link it is. */
export type FormLinkExtras = {
  metricId: number;
  /** An earlier period the address names and the person may record, with the value it holds; null records the current one. */
  named: { start: string; label: string; has: string | null } | null;
  /** The newest value before the period shown, among those the Record a value form offers. */
  last: { value: string; periodLabel: string } | null;
  next: NextValueDue | null;
};

/** For each of these Metrics, whether each of the actor's valid Tokens is for the actor (true) or for someone they
 * stand in for (false). Record a value takes the person's own first; among several Stand-in Tokens it may take any. */
async function tokensHeld(actor: Actor, metricIds: number[]): Promise<(metricId: number) => boolean[]> {
  const { data } = await db().from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("workspace_id", actor.workspaceId).in("metric_id", metricIds);
  const all = (data ?? []) as (TokenRow & { metric_id: number })[];
  return (metricId) => {
    const of = all.filter((t) => t.metric_id === metricId);
    return of.filter((t) => t.submitter_id === actor.personId && tokenValid(t, of)).map((t) => !t.stands_in_for);
  };
}

/** The next value of the person's Schedule that is due and that Record a value takes, other than the one on screen:
 * the most overdue first, then the coming days. */
async function nextValueDue(actor: Actor, metricId: number, shown: string): Promise<NextValueDue | null> {
  const mine = await schedule(actor);
  const due = [...mine.overdue, ...mine.days.flatMap((d) => d.entries)].flatMap((e) => (e.kind === "value_due" && e.metric && !(e.metric.id === metricId && e.period.start === shown) ? [{ metric: e.metric, period: e.period }] : []));
  if (!due.length) return null;
  // The Schedule reaches further back than the form does, and lists Metrics that take no web form value.
  const ids = due.map((d) => d.metric.id);
  const [offers, held] = await Promise.all([recordingOffers(actor, ids), tokensHeld(actor, ids)]);
  // Not a Metric where it is open whose value this would be: standing in for several people, with no Token of their own.
  const certain = (id: number) => held(id).includes(true) || held(id).length === 1;
  const next = due.find((d) => certain(d.metric.id) && offers[d.metric.id]?.periods.some((p) => p.start === d.period.start));
  return next ? { slug: next.metric.slug, name: next.metric.name, period: next.period.start, periodLabel: next.period.label } : null;
}

/** The extras for the form link `code`, only when it is the actor's own Token in the actor's Workspace and they may
 * record the Metric (Record a value's own check: a Metric they see, a valid Token); null for everyone else. `code` and
 * `period` come from the address and are untrusted: a period is taken only when the form offers it. */
export async function formLinkExtras(actor: Actor, code: unknown, period?: unknown): Promise<FormLinkExtras | null> {
  if (actor.key || !actor.personId || typeof code !== "string" || !/^[A-Za-z0-9_-]{4,80}$/.test(code)) return null;
  const { data: token } = await db().from("tokens").select("metric_id, stands_in_for").eq("workspace_id", actor.workspaceId).eq("code", code).eq("submitter_id", actor.personId).maybeSingle();
  if (!token) return null;
  const metricId = token.metric_id as number;
  const offer = await recordingOffer(actor, metricId);
  if (!offer) return null;
  const [current] = offer.periods;
  // Security: a named period is saved by Record a value, which chooses the Token itself. So a Stand-in's link names one
  // only when it is the person's one valid Token here; otherwise the value could go in under another person than the page says.
  const elsewise = Boolean(token.stands_in_for) && (await tokensHeld(actor, [metricId]))(metricId).length > 1;
  const named = elsewise ? null : (offer.periods.find((p) => p.start === period && p.start !== current.start) ?? null);
  const shown = (named ?? current).start;
  const last = offer.periods.find((p) => p.start < shown && p.has !== null);
  return { metricId, named, last: last?.has ? { value: last.has, periodLabel: last.label } : null, next: await nextValueDue(actor, metricId, shown) };
}
