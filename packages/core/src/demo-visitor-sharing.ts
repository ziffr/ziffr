// What a Share may show in the demo (GLOSSARY: Demo Mode, Share, Group, Derived Metric; spec 0051, ticket 11), and the demo's own words for a
// refusal the database answers as a fault. A visitor acts as one made-up person who may own Metrics another person is not allowed to see
// (a Guest sees only two). Giving a dashboard, a deck, a calculated Metric or a Group's Share would make those Metrics visible to the
// recipient (access.ts), so in a visit every Metric a Share would put in front of a recipient must be one they see already. Nothing here acts
// outside a demo visit.
import { type Actor } from "./actor";
import { demoData } from "./demo-query";
import { refuseShowcase } from "./demo-seeded-rows";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { DEMO_LIMIT_CODE, DemoLimit, protectedRefusal } from "./demo";
import { DemoTextRefused, inDemoVisit } from "./demo-visitor-words";
import { DEMO_METRIC_WORDS } from "./demo-words";
import { formulaInputs } from "./formula";
import { deckMetricIds } from "./visibility";
import { widgetMetricIds } from "./widget-metrics";
import { getMetrics } from "./workspace-data";

/** The demo's own refusal behind a database error of an operation that answers its error as a fault of its own (a Tag's change is one
 * database function): the seed's words or showcase, or a full cap, as the plain sentence; null for any other error. */
export function demoRefusalOf(e: unknown): Error | null {
  const known = protectedRefusal(e);
  if (known) return known;
  if (typeof e !== "object" || e === null || (e as { code?: unknown }).code !== DEMO_LIMIT_CODE) return null;
  const message = String((e as { message?: unknown }).message ?? "");
  return new DemoLimit(message.startsWith("demo_limit:") ? message.slice("demo_limit:".length).slice(0, 40) : "");
}

type Shared = "metric" | "dashboard" | "deck";

/** How far a calculated Metric's inputs are followed (a calculated Metric may read others): more than the formulas of the demo can nest. */
const INPUT_DEPTH = 6;

/** Adds to the set the Metrics a calculated Metric in it reads, and those they read, to a bounded depth: a calculated Metric shows all of them. */
function withInputs(all: { id: number; slug: string; formula?: string | null }[], set: Set<number>): void {
  let layer = [...set];
  for (let depth = 0; depth < INPUT_DEPTH && layer.length; depth++) {
    const fresh: number[] = [];
    for (const m of layer) {
      const formula = all.find((x) => x.id === m)?.formula;
      if (formula) for (const slug of formulaInputs(formula)) { const input = all.find((x) => x.slug === slug); if (input && !set.has(input.id)) { set.add(input.id); fresh.push(input.id); } }
    }
    layer = fresh;
  }
}

/** In a visit, refuses a new formula for a calculated Metric that is used anywhere: shown by a widget of any dashboard, in a deck, read by another
 * calculated Metric, or shared. Changing it would change what the people those are shown to see, and the walk to find them all is not worth it:
 * a visitor makes a new Metric with the formula they want. An unused one may change. Nothing outside a visit. */
export async function visitorMetricUnused(actor: Pick<Actor, "workspaceId">, metricId: number, slug: string): Promise<void> {
  if (!inDemoVisit(actor)) return;
  const ws = actor.workspaceId;
  const used = new DemoTextRefused(DEMO_METRIC_WORDS.used);
  // Every read fails closed: a query that failed is a refusal, never "nothing uses it".
  const [w, d, s, all] = await Promise.all([
    db().from("widgets").select("metric_ids, settings").eq("workspace_id", ws),
    db().from("decks").select("document").eq("workspace_id", ws),
    db().from("shares").select("id").eq("workspace_id", ws).eq("object_type", "metric").eq("object_id", metricId).limit(1),
    getMetrics(ws),
  ]);
  const widgets = demoData(w), decks = demoData(d), shares = demoData(s);
  if (shares?.length) throw used;
  if ((widgets ?? []).some((w) => widgetMetricIds((w.metric_ids ?? []) as number[], w.settings).includes(metricId))) throw used;
  if ((decks ?? []).some((d) => deckMetricIds(d.document).includes(metricId))) throw used;
  if (all.some((m) => m.id !== metricId && m.formula && formulaInputs(m.formula).includes(slug))) throw used;
}

/** In a visit, refuses (in plain words) a Share that would show a recipient a Metric they do not see: the Metrics the object shows (a
 * dashboard's widgets, a deck's slides, a calculated Metric's inputs) must all be ones each recipient sees already, except the Metric being
 * shared itself, which is what is given. Without it a visitor could make a hidden Metric of the seed visible to another made-up person. */
export async function visitorShowsOnlySeen(actor: Pick<Actor, "workspaceId">, type: Shared, id: number, recipients: string[]): Promise<void> {
  if (!inDemoVisit(actor) || !recipients.length) return;
  const ws = actor.workspaceId;
  const all = await getMetrics(ws);
  const shown = new Set<number>();
  if (type === "metric") shown.add(id);
  else if (type === "dashboard") {
    const data = demoData(await db().from("widgets").select("metric_ids, settings").eq("workspace_id", ws).eq("dashboard_id", id));
    for (const w of data ?? []) for (const m of widgetMetricIds((w.metric_ids ?? []) as number[], w.settings)) shown.add(m);
  } else {
    const data = demoData(await db().from("decks").select("document").eq("workspace_id", ws).eq("id", id).maybeSingle());
    for (const m of deckMetricIds(data?.document)) shown.add(m);
  }
  withInputs(all, shown);
  if (type === "metric") shown.delete(id);
  if (!shown.size) return;
  for (const person of new Set(recipients)) {
    const sees = await visibleMetricIds(ws, person, all);
    if ([...shown].some((m) => !sees.has(m))) throw new DemoTextRefused(DEMO_METRIC_WORDS.hidden);
  }
}

/** The people something is shared with now: each direct Share and every member of each Group it is shared with. */
async function sharedWith(ws: string, type: Shared, id: number): Promise<string[]> {
  const data = demoData(await db().from("shares").select("user_id, group_id").eq("workspace_id", ws).eq("object_type", type).eq("object_id", id));
  const people = new Set<string>();
  for (const s of data ?? []) {
    if (s.user_id) people.add(String(s.user_id));
    if (s.group_id) for (const p of await visitorGroupPeople({ workspaceId: ws }, Number(s.group_id))) people.add(p);
  }
  return [...people];
}

/** THE one place for an object that is ALREADY shared and changes what it shows: every write in a visit that puts Metrics on a dashboard or a
 * deck, or changes a calculated Metric's formula (placing or changing a widget, applying a template, restoring a Version, saving a deck, a new
 * formula), asks it first with the Metrics the object will show after the write (`shown`, a formula's inputs by `formula`). It refuses when any
 * of them is a Metric one of the people it is shared with does not see yet; the Metrics the object shows now were checked when it was
 * shared. Nothing outside a visit, and nothing for an object that is shared with nobody. */
export async function visitorSharedStaysSeen(actor: Pick<Actor, "workspaceId">, type: Shared, id: number | null | undefined, shown: Iterable<number>, formula?: string): Promise<void> {
  if (!inDemoVisit(actor) || id === null || id === undefined) return;
  // What everyone sees as it is is refused in its own words first, as the database would.
  if (type !== "metric") await refuseShowcase(actor, type, id);
  const ws = actor.workspaceId;
  const recipients = await sharedWith(ws, type, id);
  if (!recipients.length) return;
  const all = await getMetrics(ws);
  const next = new Set(shown);
  if (formula) for (const slug of formulaInputs(formula)) { const m = all.find((x) => x.slug === slug); if (m) next.add(m.id); }
  withInputs(all, next);
  if (type === "metric") next.delete(id);
  for (const person of recipients) {
    const sees = await visibleMetricIds(ws, person, all);
    if ([...next].some((m) => !sees.has(m))) throw new DemoTextRefused(DEMO_METRIC_WORDS.hidden);
  }
}

/** In a visit, the people a Group holds now (everyone, for the built-in Group); nobody outside a visit. */
export async function visitorGroupPeople(actor: Pick<Actor, "workspaceId">, groupId: number): Promise<string[]> {
  if (!inDemoVisit(actor)) return [];
  const ws = actor.workspaceId;
  const g = demoData(await db().from("groups").select("everyone").eq("id", groupId).eq("workspace_id", ws).maybeSingle());
  const data = demoData(g?.everyone
    ? await db().from("memberships").select("user_id").eq("workspace_id", ws)
    : await db().from("group_members").select("user_id").eq("workspace_id", ws).eq("group_id", groupId));
  return (data ?? []).map((r) => String(r.user_id));
}

/** In a visit, before a person joins a Group: what the Group has been given must show that person only Metrics they see already. */
export async function visitorJoinShowsOnlySeen(actor: Pick<Actor, "workspaceId">, groupId: number, personId: string): Promise<void> {
  if (!inDemoVisit(actor)) return;
  const data = demoData(await db().from("shares").select("object_type, object_id").eq("workspace_id", actor.workspaceId).eq("group_id", groupId));
  for (const s of data ?? []) await visitorShowsOnlySeen(actor, s.object_type as Shared, Number(s.object_id), [personId]);
}
