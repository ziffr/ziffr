// Planning a Set up (spec 0058, #1179; GLOSSARY: Pack, Position, Repeat, Share, Submitter, Stand-in, Approver,
// Prompt, Workspace Limit): from the people picked, who may fill each Position, what would be made, who will then see
// what and why, every Share the Pack proposes and who would be asked for values, and when. Nothing is written.
// Security: Owners and Admins only, never through a key, never in the demo. Who will see what is answered by the same
// visibility rules the app uses, over the rows as they would be. Only Metrics made here and Metrics the actor sees are
// named: no other Metric can be seen through anything a Set up makes.
import type { Actor } from "./actor";
import { getGroups, getRawShares, getShares, visibilityOfMany, type PlannedRows } from "./access";
import { expandGroupShares } from "./visibility";
import type { Offer } from "./pack-setup-adding";
import { fromDashboardTemplate } from "./team-templates";
import { widgetMetricIds } from "./widget-metrics";
import { listed } from "./pack-places";
import { buildSetup, SETUP_METRICS_MAX, tickedShares, unsubscribedNote, type Blueprint, type PackSetupInput, type PlannedDashboard, type ProposedShare } from "./pack-setup-build";
import { installedForSetup, assertSetsUp, roomNow, type PackSetupRoom } from "./pack-setup-install";
import { PLACE_WORDS, whyNot, type PersonKind } from "./pack-setup-who";
import { isComputed, plannedSums } from "./pack-setup-totals";
import type { DashboardTemplateBody, Metric, WorkflowStep } from "./types";

/** How many requests for values a person gets. `you`: the person setting up. */
export type PlannedMessages = { name: string; count: number; you: boolean };

/** The plan of a Set up, as the form shows it. */
export type PackSetupPlan = {
  /** Everyone who may be put into a Position, in order of name. */
  people: { id: string; name: string; kind: PersonKind }[];
  /** The Positions that something picked names, with who may not fill each and why. */
  positions: { key: string; name: string; repeat: string | null; several: boolean; places: string; refused: { id: string; why: string }[] }[];
  makes: { metrics: string[]; dashboards: string[]; workflows: string[] };
  /** For the person setting up and everyone picked: the Metrics they will see of those made or shown here, and why. */
  sees: { id: string; name: string; metrics: { name: string; why: string[] }[] }[];
  /** Every Share the Pack proposes among what is made. `showsMore`: it would show the person a Metric they do not see
   * without it. `keeps`: they hold a Position that submits the Metric and are not asked for it. `suggested`: whether
   * the form ticks it by itself, which it does only for a Viewer who sees no more, or whose sight it keeps. */
  shares: { id: string; person: string; role: "viewer" | "editor"; kind: "Metric" | "dashboard"; item: string; showsMore: boolean; keeps: boolean; suggested: boolean }[];
  /** Requests for values: those that go out at once, those that wait for the Workflow's next run, and those nobody
   * sends by themselves because the Metric follows no Workflow. `ifSent`: what goes out at once if sending the first
   * requests is chosen, one message for each Metric and person. */
  messages: { now: PlannedMessages[]; nextRun: PlannedMessages[]; unasked: PlannedMessages[]; ifSent: PlannedMessages[] };
  /** Who would submit a number and is not asked for it, and why, in words. */
  notAsked: string[];
  /** The numbers nobody types that the person setting up would submit: what “Ask me also for …” is about. */
  askMeAlso: string[];
  /** Adding a line: what is set up already that it may be added to, each ticked or not, and what is left to do by
   * hand. `suggested`: whether the form ticks it by itself, which it does not where that shows someone more. */
  offers: (Offer & { suggested: boolean })[];
  byHand: string[];
  notes: string[];
  problems: string[];
  room: PackSetupRoom | null;
};

/** The widgets a planned dashboard would have. */
const widgetsOf = (d: PlannedDashboard) => fromDashboardTemplate(d.template.body as DashboardTemplateBody, d.fills);
const metricsOn = (d: PlannedDashboard) => [...new Set(widgetsOf(d).flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))];

/** The rows a Set up would write that decide who sees what, with the Shares given, and with the widgets there already
 * that `added` says take new Metrics. */
function plannedRows(actor: Actor, b: Blueprint, shares: ProposedShare[], added: Blueprint["additions"]["widgets"] = b.additions.widgets): PlannedRows {
  return {
    // All are the actor's, who sees what they own whatever it is computed from, so no formula is needed.
    metrics: b.metrics.map((m) => ({ id: m.plan, name: m.name, slug: `planned-${-m.plan}`, owner_id: actor.personId, formula: null }) as unknown as Metric),
    tokens: b.metrics.flatMap((m) => [...m.submitters, ...(b.feed && !isComputed(m.entry) ? [b.feed] : [])].map((s) => ({ metric_id: m.plan, submitter_id: s }))),
    shares: shares.map((s) => ({ object_type: s.object, object_id: s.plan, user_id: s.person, role: s.role })),
    dashboards: b.dashboards.map((d) => ({ id: d.plan, owner_id: actor.personId })),
    widgets: [
      ...b.dashboards.flatMap((d) => widgetsOf(d).map((w) => ({ dashboard_id: d.plan, metric_ids: w.metric_ids, settings: w.settings }))),
      // A widget there already that takes the new Metrics shows them to whoever its dashboard is shared with.
      ...added.map((w) => ({ dashboard_id: w.dashboard.id, metric_ids: w.add, settings: {} })),
    ],
  };
}

/** Everyone a Set up puts somewhere, the person setting up first. */
function involved(actor: Actor, b: Blueprint, alsoSee: string[]): string[] {
  const steps = b.workflows.flatMap((w) => [...w.approvers, ...(w.send?.people ?? []), ...w.config.steps.flatMap((s: WorkflowStep) =>
    s.type === "tell" ? s.people : s.type === "checklist" ? (s.kind === "info" ? s.people : [s.assignee, s.standIn ?? null]) : [])]);
  const all = [actor.personId, ...b.metrics.flatMap((m) => [...m.submitters, m.standIn]), ...b.lines.flatMap((l) => [...l.fills.values()].flat()), ...b.shares.map((s) => s.person), ...steps, ...alsoSee];
  return [...new Set(all.filter((id): id is string => typeof id === "string" && b.people.has(id)))];
}

const countBy = (actor: Actor, b: Blueprint, ids: string[]): PlannedMessages[] => [...b.people.values()].flatMap((p) => {
  const count = ids.filter((id) => id === p.id).length;
  return count ? [{ name: p.name, count, you: p.id === actor.personId }] : [];
});

/** Who is asked for values: at once only when sending the first requests was chosen, the person setting up included;
 * else by the Workflow's next run, if the Metric follows one. */
function messagesOf(actor: Actor, b: Blueprint, askNow: boolean): PackSetupPlan["messages"] {
  const all: string[] = [], nextRun: string[] = [], unasked: string[] = [];
  for (const m of b.metrics) for (const s of m.submitters) {
    if (!b.people.has(s)) continue;
    all.push(s);
    (m.workflow || b.additions.join !== null ? nextRun : unasked).push(s);
  }
  const ifSent = countBy(actor, b, all);
  if (askNow) return { ifSent, now: ifSent, nextRun: [], unasked: [] };
  return { ifSent, now: [], nextRun: countBy(actor, b, nextRun), unasked: countBy(actor, b, unasked) };
}

/** What the person should know about places that show or tell something, given who will see what. */
function sightNotes(actor: Actor, b: Blueprint, sees: (person: string) => ReadonlySet<number>, ticked: ProposedShare[]): string[] {
  const name = (id: string) => b.people.get(id)?.name ?? "Someone";
  const notes: string[] = [];
  for (const w of b.workflows) {
    const takes = b.metrics.filter((m) => m.workflow === w).map((m) => m.plan);
    if (w.send) for (const id of w.send.people) {
      const opens = id === actor.personId || ticked.some((s) => s.object === "dashboard" && s.plan === w.send!.dashboard && s.person === id);
      if (!opens) notes.push(`${name(id)} gets no Snapshot from ${w.name}: its dashboard is not shared with them.`);
    }
    const unseen = w.approvers.filter((id) => takes.some((m) => !sees(id).has(m)));
    if (unseen.length) notes.push(`${listed(unseen.map(name))} will read the values to approve in ${w.name}, also of Metrics not listed for them: an Approval shows its value.`);
    const told = w.config.steps.flatMap((s) => (s.type === "tell" ? s.people : []));
    for (const id of new Set(told)) if (takes.length && !takes.some((m) => sees(id).has(m))) notes.push(`${name(id)} is told nothing by ${w.name} while they see none of its Metrics.`);
  }
  if (b.metrics.some((m) => m.standIn)) notes.push("A Stand-in sees a Metric once they are asked in someone's place.");
  return notes;
}

/** Who would submit a number the Pack says nobody types, and is not asked for it. */
function notAskedOf(actor: Actor, b: Blueprint): string[] {
  return [...b.people.values()].flatMap((p) => (["system", "target"] as const).flatMap((by) => {
    const names = b.metrics.filter((m) => m.elsewhere === by && m.left.includes(p.id)).map((m) => m.name);
    if (!names.length) return [];
    const one = names.length === 1;
    const why = by === "system" ? `another system sends ${one ? "it" : "them"}` : `${one ? "it is" : "they are"} set as a target`;
    const unshared = p.kind === "contact" ? " A Contact cannot be shared with." : "";
    return [`${p.id === actor.personId ? "You are" : `${p.name} is`} not asked for ${listed(names)}: the Pack says ${why}.${unshared}`];
  }));
}

/** The most people named as newly seeing the Metrics a widget takes. */
const NAMED_MAX = 10;

/** The offers of adding a line, each widget's with whom it would newly show the new Metrics: whoever its dashboard is
 * shared with and does not see them all without it. One that shows anyone more, now or when they join a Group it is
 * shared with, starts unticked. `without` is what someone sees before any widget takes them. */
async function offersOf(actor: Actor, b: Blueprint, without: (person: string) => ReadonlySet<number>): Promise<PackSetupPlan["offers"]> {
  const ws = actor.workspaceId;
  const [raw, groups] = b.additions.offered.length ? await Promise.all([getRawShares(ws), getGroups(ws)]) : [[], []];
  const shares = expandGroupShares(ws, raw, groups);
  return b.additions.offers.map((o) => {
    const widget = b.additions.offered.find((w) => w.offer === o.id);
    // A Total’s offer says itself whether it starts ticked.
    if (!widget) return { ...o, suggested: o.suggested ?? true };
    const here = (s: { object_type: string; object_id: number }) => s.object_type === "dashboard" && s.object_id === widget.dashboard.id;
    const theirs = [...new Set(shares.filter(here).map((s) => String(s.user_id)))].filter((id) => id !== actor.personId);
    const newly = theirs.filter((id) => widget.add.some((m) => !without(id).has(m))).map((id) => b.people.get(id)?.name ?? "Someone");
    const later = raw.filter(here).flatMap((s) => groups.filter((g) => g.id === s.group_id).map((g) => `the Group ${g.name}`));
    const them = widget.add.length === 1 ? "it" : "them";
    const named = newly.length > NAMED_MAX ? [...newly.slice(0, NAMED_MAX), `${newly.length - NAMED_MAX} more`] : newly;
    const now = named.length ? `${listed(named)} would newly see ${them}.` : `Nobody it is shared with now sees more by it.`;
    const joining = later.length ? ` Whoever joins ${listed(later)} would see ${them} too.` : "";
    return { ...o, words: `${o.words} ${now}${joining}`, suggested: !newly.length && !later.length };
  });
}

/** Plans setting up from one of the Workspace's installed Packs (Owners and Admins). Nothing is written. */
export async function planPackSetup(actor: Actor, installId: number, input: PackSetupInput): Promise<PackSetupPlan> {
  assertSetsUp(actor);
  const b = await buildSetup(actor, await installedForSetup(actor, Number(installId)), input);
  const ticked = tickedShares(b, input?.shares);
  const ws = actor.workspaceId;
  // A ticked Share that keeps the sight a Position gives counts as seen already, when asking what else shows more.
  const kept = ticked.filter((s) => s.keeps);
  const [after, without] = await Promise.all([
    visibilityOfMany(ws, b.existing, plannedRows(actor, b, ticked)),
    visibilityOfMany(ws, b.existing, plannedRows(actor, b, kept)),
  ]);
  // Who sees what before any widget there already takes the new Metrics, where one is offered.
  const before = b.additions.offered.length ? await visibilityOfMany(ws, b.existing, plannedRows(actor, b, kept, [])) : without;
  // What is made, and what a dashboard made here shows besides: the actor sees those, as filling a Slot requires.
  const names = new Map<number, string>([...b.metrics.map((m): [number, string] => [m.plan, m.name]), ...b.existing.map((m): [number, string] => [m.id, m.name])]);
  const onBoards = new Map(b.dashboards.map((d) => [d.plan, metricsOn(d)]));
  const scope = [...new Set([...b.metrics.map((m) => m.plan), ...[...onBoards.values()].flat().filter((id) => id > 0)])];
  // Whoever a dashboard that takes the new Metrics is shared with sees them: they are named with the rest.
  const shown = new Set(b.additions.widgets.map((w) => w.dashboard.id));
  const through = shown.size ? (await getShares(ws)).filter((s) => s.object_type === "dashboard" && shown.has(s.object_id)) : [];
  const joins = (person: string, metric: number) => b.additions.widgets.filter((w) => w.add.includes(metric) && (person === actor.personId || through.some((s) => s.object_id === w.dashboard.id && s.user_id === person))).map((w) => `on the dashboard ${w.dashboard.name}`);
  const why = (person: string, metric: number): string[] => {
    const planned = b.metrics.find((m) => m.plan === metric);
    const owner = planned ? actor.personId : b.existing.find((m) => m.id === metric)?.owner_id;
    const reasons = [
      ...(owner === person ? ["owns it"] : []),
      ...(planned?.submitters.includes(person) ? ["submits it"] : []),
      ...(ticked.some((s) => s.object === "metric" && s.plan === metric && s.person === person) ? ["shared with them"] : []),
      ...b.dashboards.filter((d) => onBoards.get(d.plan)!.includes(metric) && ticked.some((s) => s.object === "dashboard" && s.plan === d.plan && s.person === person)).map((d) => `on the dashboard ${d.name}`),
      ...new Set(joins(person, metric)),
    ];
    // A Total's sums, and what is computed from them, are shown only to who sees every Metric it adds up.
    const sums = planned ? plannedSums(b.metrics, planned, after(person).metrics) : null;
    return [...(reasons.length ? reasons : ["sees it already"]), ...(sums ? [sums] : [])];
  };
  const everyone = involved(actor, b, through.map((s) => s.user_id));
  const sees = everyone.map((id) => {
    const visible = after(id).metrics;
    return { id, name: b.people.get(id)!.name, metrics: scope.filter((m) => visible.has(m)).map((m) => ({ name: names.get(m) ?? "A Metric", why: why(id, m) })) };
  });
  const shares = b.shares.map((s) => {
    const base = without(s.person).metrics;
    // One that keeps sight is itself among what is seen already when ticked, and shows more without it.
    const showsMore = s.keeps || (s.object === "metric" ? [s.plan] : onBoards.get(s.plan) ?? []).some((m) => !base.has(m));
    return { id: s.id, person: b.people.get(s.person)!.name, role: s.role, kind: s.object === "metric" ? ("Metric" as const) : ("dashboard" as const), item: s.item, showsMore, keeps: s.keeps, suggested: s.role === "viewer" && (s.keeps || !showsMore) };
  });
  return {
    people: [...b.people.values()],
    positions: b.positions.map((p) => ({
      key: p.key, name: p.name, repeat: p.repeat, several: p.several, places: listed([...p.places].map((x) => PLACE_WORDS[x])),
      refused: [...b.people.values()].flatMap((x) => { const no = whyNot(x.kind, p.places); return no ? [{ id: x.id, why: no }] : []; }),
    })),
    makes: { metrics: b.metrics.map((m) => m.name), dashboards: b.dashboards.map((d) => d.name), workflows: b.workflows.map((w) => w.name) },
    sees,
    shares,
    messages: messagesOf(actor, b, input?.askNow === true),
    notAsked: notAskedOf(actor, b),
    askMeAlso: [...new Set(b.metrics.filter((m) => m.elsewhere && [...m.left, ...m.submitters].includes(actor.personId)).map((m) => m.entry.name))],
    offers: await offersOf(actor, b, (id) => before(id).metrics),
    byHand: b.additions.byHand,
    notes: [...b.notes, ...[await unsubscribedNote(actor, b)].filter((n) => n !== null), ...sightNotes(actor, b, (id) => after(id).metrics, ticked)],
    problems: b.problems,
    room: await roomNow(actor, SETUP_METRICS_MAX),
  };
}
