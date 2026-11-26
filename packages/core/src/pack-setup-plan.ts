// Planning a Set up (spec 0058, #1179; GLOSSARY: Pack, Position, Repeat, Share, Submitter, Stand-in, Approver,
// Prompt, Workspace Limit): from the people picked, who may fill each Position, what would be made, who will then see
// what and why, every Share the Pack proposes and who would be messaged at once. Nothing is written.
// Security: Owners and Admins only, never through a key, never in the demo. Who will see what is answered by the same
// visibility rules the app uses, over the rows as they would be. Only Metrics made here and Metrics the actor sees are
// named: no other Metric can be seen through anything a Set up makes.
import type { Actor } from "./actor";
import { visibilityOfMany, type PlannedRows } from "./access";
import { fromDashboardTemplate } from "./team-templates";
import { widgetMetricIds } from "./widget-metrics";
import { listed } from "./pack-places";
import { buildSetup, SETUP_METRICS_MAX, tickedShares, type Blueprint, type PackSetupInput, type PlannedDashboard, type ProposedShare } from "./pack-setup-build";
import { installedForSetup, assertSetsUp, roomNow, type PackSetupRoom } from "./pack-setup-install";
import { PLACE_WORDS, whyNot, type PersonKind } from "./pack-setup-who";
import type { DashboardTemplateBody, Metric, WorkflowStep } from "./types";

/** How many requests for values a person gets. */
export type PlannedMessages = { name: string; count: number };

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
   * without it. `suggested`: whether the form ticks it by itself, which it does only for a Viewer who sees no more. */
  shares: { id: string; person: string; role: "viewer" | "editor"; kind: "Metric" | "dashboard"; item: string; showsMore: boolean; suggested: boolean }[];
  /** Requests for values: those that go out at once, those that wait for the Workflow's next run, and those nobody
   * sends by themselves because the Metric follows no Workflow. */
  messages: { now: PlannedMessages[]; nextRun: PlannedMessages[]; unasked: PlannedMessages[]; /** How many requests go to others than the person setting up, if they are asked now. */ others: number };
  notes: string[];
  problems: string[];
  room: PackSetupRoom | null;
};

/** The widgets a planned dashboard would have. */
const widgetsOf = (d: PlannedDashboard) => fromDashboardTemplate(d.template.body as DashboardTemplateBody, d.fills);
const metricsOn = (d: PlannedDashboard) => [...new Set(widgetsOf(d).flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))];

/** The rows a Set up would write that decide who sees what, with the Shares given. */
function plannedRows(actor: Actor, b: Blueprint, shares: ProposedShare[]): PlannedRows {
  return {
    // All are the actor's, who sees what they own whatever it is computed from, so no formula is needed.
    metrics: b.metrics.map((m) => ({ id: m.plan, name: m.name, slug: `planned-${-m.plan}`, owner_id: actor.personId, formula: null }) as unknown as Metric),
    tokens: b.metrics.flatMap((m) => [...m.submitters, ...(b.feed && !m.entry.formula ? [b.feed] : [])].map((s) => ({ metric_id: m.plan, submitter_id: s }))),
    shares: shares.map((s) => ({ object_type: s.object, object_id: s.plan, user_id: s.person, role: s.role })),
    dashboards: b.dashboards.map((d) => ({ id: d.plan, owner_id: actor.personId })),
    widgets: b.dashboards.flatMap((d) => widgetsOf(d).map((w) => ({ dashboard_id: d.plan, metric_ids: w.metric_ids, settings: w.settings }))),
  };
}

/** Everyone a Set up puts somewhere, the person setting up first. */
function involved(actor: Actor, b: Blueprint): string[] {
  const steps = b.workflows.flatMap((w) => [...w.approvers, ...(w.send?.people ?? []), ...w.config.steps.flatMap((s: WorkflowStep) =>
    s.type === "tell" ? s.people : s.type === "checklist" ? (s.kind === "info" ? s.people : [s.assignee, s.standIn ?? null]) : [])]);
  const all = [actor.personId, ...b.metrics.flatMap((m) => [...m.submitters, m.standIn]), ...b.lines.flatMap((l) => [...l.fills.values()].flat()), ...b.shares.map((s) => s.person), ...steps];
  return [...new Set(all.filter((id): id is string => typeof id === "string" && b.people.has(id)))];
}

const countBy = (b: Blueprint, ids: string[]): PlannedMessages[] => [...b.people.values()].flatMap((p) => {
  const count = ids.filter((id) => id === p.id).length;
  return count ? [{ name: p.name, count }] : [];
});

/** Who is asked for values: the person setting up at once, as ever; others at once only when asked for, else by the
 * Workflow's next run, if the Metric follows one. */
function messagesOf(actor: Actor, b: Blueprint, askNow: boolean): PackSetupPlan["messages"] {
  const now: string[] = [], nextRun: string[] = [], unasked: string[] = [];
  for (const m of b.metrics) for (const s of m.submitters) {
    if (!b.people.has(s)) continue;
    (s === actor.personId || askNow ? now : m.workflow ? nextRun : unasked).push(s);
  }
  const others = b.metrics.flatMap((m) => m.submitters).filter((s) => s !== actor.personId && b.people.has(s)).length;
  return { now: countBy(b, now), nextRun: countBy(b, nextRun), unasked: countBy(b, unasked), others };
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

/** Plans setting up from one of the Workspace's installed Packs (Owners and Admins). Nothing is written. */
export async function planPackSetup(actor: Actor, installId: number, input: PackSetupInput): Promise<PackSetupPlan> {
  assertSetsUp(actor);
  const b = await buildSetup(actor, await installedForSetup(actor, Number(installId)), input);
  const ticked = tickedShares(b, input?.shares);
  const ws = actor.workspaceId;
  const [after, without] = await Promise.all([
    visibilityOfMany(ws, b.existing, plannedRows(actor, b, ticked)),
    visibilityOfMany(ws, b.existing, plannedRows(actor, b, [])),
  ]);
  // What is made, and what a dashboard made here shows besides: the actor sees those, as filling a Slot requires.
  const names = new Map<number, string>([...b.metrics.map((m): [number, string] => [m.plan, m.name]), ...b.existing.map((m): [number, string] => [m.id, m.name])]);
  const onBoards = new Map(b.dashboards.map((d) => [d.plan, metricsOn(d)]));
  const scope = [...new Set([...b.metrics.map((m) => m.plan), ...[...onBoards.values()].flat().filter((id) => id > 0)])];
  const why = (person: string, metric: number): string[] => {
    const planned = b.metrics.find((m) => m.plan === metric);
    const owner = planned ? actor.personId : b.existing.find((m) => m.id === metric)?.owner_id;
    const reasons = [
      ...(owner === person ? ["owns it"] : []),
      ...(planned?.submitters.includes(person) ? ["submits it"] : []),
      ...(ticked.some((s) => s.object === "metric" && s.plan === metric && s.person === person) ? ["shared with them"] : []),
      ...b.dashboards.filter((d) => onBoards.get(d.plan)!.includes(metric) && ticked.some((s) => s.object === "dashboard" && s.plan === d.plan && s.person === person)).map((d) => `on the dashboard ${d.name}`),
    ];
    return reasons.length ? reasons : ["sees it already"];
  };
  const everyone = involved(actor, b);
  const sees = everyone.map((id) => {
    const visible = after(id).metrics;
    return { id, name: b.people.get(id)!.name, metrics: scope.filter((m) => visible.has(m)).map((m) => ({ name: names.get(m) ?? "A Metric", why: why(id, m) })) };
  });
  const shares = b.shares.map((s) => {
    const base = without(s.person).metrics;
    const showsMore = (s.object === "metric" ? [s.plan] : onBoards.get(s.plan) ?? []).some((m) => !base.has(m));
    return { id: s.id, person: b.people.get(s.person)!.name, role: s.role, kind: s.object === "metric" ? ("Metric" as const) : ("dashboard" as const), item: s.item, showsMore, suggested: !showsMore && s.role === "viewer" };
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
    notes: [...b.notes, ...sightNotes(actor, b, (id) => after(id).metrics, ticked)],
    problems: b.problems,
    room: await roomNow(actor, SETUP_METRICS_MAX),
  };
}
