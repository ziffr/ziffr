// What a Set up would make (spec 0030, spec 0058; GLOSSARY: Pack, Metric Catalog, Derived Metric, Slot, Position,
// Repeat, Workflow Template): what a person picked, checked in full and laid out as the Workflows, Metrics, dashboards
// and Shares to be made, with who goes into each place. Nothing is written here; the plan of a Set up and setting up
// itself both start from it, so what is shown is what is made.
// Security: everything asked for comes from a browser. Keys are matched through Maps, never as fields of a plain
// object; every person must be of this Workspace, every Metric picked for a Slot one the actor sees, every Feed a live
// one of the Workspace. Wrong ids and keys are refused at once; what is only unfinished or not allowed is collected as
// a problem, and setting up refuses while there is one.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { liveFeed } from "./feeds";
import { checkFormula, formulaInputs, type FormulaInput } from "./formula";
import { metricChoices } from "./dashboard-templates";
import { fromWorkflowTemplate } from "./team-templates";
import { peopleIn } from "./submissions";
import { getMetrics } from "./workspace-data";
import { itemHash } from "./packs";
import { PLAIN, textPasses } from "./file-text";
import { TELL_PEOPLE_PER_STEP } from "./alert-limits";
import { PACK_POSITION_LIMITS } from "@ziffr/pack/pack-positions";
import { listed, type PackPlaces, type PlacedDashboard, type PlacedMetric, type PlacedStep, type PlacedWorkflow } from "./pack-places";
import { roomFor, type EntryRow, type InstalledForSetup, type TemplateRow } from "./pack-setup-install";
import { addingTo, additionsFor, NO_ADDITIONS, type Additions, type AddingTo } from "./pack-setup-adding";
import { whyNot, type PersonKind, type Place } from "./pack-setup-who";
import type { Metric, ShareRole, WorkflowConfig, WorkflowStep, WorkflowTemplateBody } from "./types";

/** A Dashboard Template to make, with the Metrics picked for the Slots no entry fills, by Slot. */
export type PackDashboardPick = { key: string; name?: string; fills?: (number[] | null)[] };
/** A Workflow Template to make; `approvers` are picked for an Approve step whose Approvers no Position names. */
export type PackWorkflowPick = { key: string; name?: string; approvers?: string[] };
/** The people who fill one Position. */
export type PositionFill = { position: string; people: string[] };
/** One line of a Repeat: its name, such as “Munich”, and the people of the Repeat's Positions. */
export type RepeatLine = { repeat: string; name: string; people?: PositionFill[] };

/** What a person asks to be set up. Slots an entry made here fills are filled with it; `fills` names Metrics they see
 * for the other Slots, by Slot. */
export type PackSetupInput = {
  metrics: string[];
  /** Who submits the Metrics whose entry names no Position for that. */
  submitters?: string[];
  /** The person setting up chooses to be asked also for the numbers the Pack says another system sends or are set as
   * a target, where they would submit them. Without it nobody is asked for those, and nobody else is either way. */
  askElsewhere?: boolean;
  /** One of the Workspace's Feeds, made the Submitter of every Metric that takes values, with its API Source on. */
  feed?: string | null;
  dashboard?: PackDashboardPick | null;
  workflow?: PackWorkflowPick | null;
  /** A dashboard and a Workflow made once for each line of a Repeat, one of each per Repeat. */
  lineDashboards?: PackDashboardPick[];
  lineWorkflows?: PackWorkflowPick[];
  /** Who fills each Position that belongs to no Repeat. */
  people?: PositionFill[];
  /** The lines of the Pack's Repeats, in the order they are made. */
  lines?: RepeatLine[];
  /** The ids of the proposed Shares that are ticked. No other Share is made. */
  shares?: string[];
  /** Ask the others for the current period now, instead of at the Workflow's next run. The person setting up is always
   * asked at once. */
  askNow?: boolean;
  /** Adds one line to what was set up before: only what is made once for each line of its Repeat is made. `ticked` are
   * the offers to add it to what is there; nothing else there is changed. */
  adding?: { ticked?: string[] } | null;
};

/** The most Metrics one Set up makes (spec 0058). */
export const SETUP_METRICS_MAX = 200;
/** The most entries picked at once: a Pack holds at most 50 of a kind. */
export const SETUP_ENTRIES_MAX = 50;
/** The most Submitters picked beside Positions (each gets a first Prompt for every Metric): the page asks only the person. */
const MAX_SUBMITTERS = 5;
/** The most Approvers a Workflow's Approve step takes. */
const MAX_APPROVERS = 3;
/** The longest slug a Metric can get: a name of 120 characters, and a suffix when the slug is taken. */
const LONGEST_SLUG = 130;
const KEY = /^[a-z][a-z0-9-]{0,39}$/;

/** A person who may be put into a place: a member, a Guest or a Contact of the Workspace. */
export type SetupPerson = { id: string; name: string; kind: PersonKind };
/** A line of a Repeat as it is made. */
export type BuiltLine = { repeat: string; name: string; fills: Map<string, string[]> };
/** A Workflow to make. `send` is the dashboard its Send Snapshot step sends (a dashboard's `plan`) and to whom. */
export type PlannedWorkflow = { key: string; line: BuiltLine | null; name: string; templateName: string; config: WorkflowConfig; approvers: string[]; send: { dashboard: number; people: string[] } | null };
/** What a Pack says of a number nobody types: another system sends it, or it is set as a target. */
export type Elsewhere = "system" | "target";
/** A Metric to make. `plan` is a number below 0 that stands for it until it has an id. */
export type PlannedMetric = {
  plan: number; entry: EntryRow; line: BuiltLine | null; name: string; submitters: string[]; standIn: string | null; workflow: PlannedWorkflow | null;
  /** Set when the Pack says nobody types this number; `left` are then the people who would submit it and are not
   * asked. */
  elsewhere: Elsewhere | null; left: string[];
  /** The slug of a Metric that is there already (`plan` is then its id). */
  slug?: string;
};
/** A dashboard to make; each Slot's Metrics are ids, or below 0 for Metrics made here. */
export type PlannedDashboard = { plan: number; key: string; line: BuiltLine | null; name: string; template: TemplateRow; fills: number[][] };
/** A Share the Pack proposes among what is made. `id` is what a person ticks. `keeps`: its person holds a Position
 * that submits the Metric and is not asked for it, so without the Share they would not see it. */
export type ProposedShare = { id: string; object: "metric" | "dashboard"; plan: number; item: string; person: string; role: ShareRole; keeps: boolean };
/** A Position that something picked names, with the places it takes there. */
export type PositionUse = { key: string; name: string; repeat: string | null; several: boolean; places: Set<Place> };

/** Everything a Set up would do. */
export type Blueprint = {
  workflows: PlannedWorkflow[];
  /** In the order they are made: a Metric computed from others after them. */
  metrics: PlannedMetric[];
  dashboards: PlannedDashboard[];
  shares: ProposedShare[];
  /** The person row of the Feed made Submitter, or null. */
  feed: string | null;
  positions: PositionUse[];
  /** Who fills each Position that belongs to no Repeat. */
  fills: Map<string, string[]>;
  lines: BuiltLine[];
  /** Everyone who may be put into a place, by id, in order of name. */
  people: Map<string, SetupPerson>;
  /** The Workspace's Metrics as they are now. */
  existing: Metric[];
  /** The slugs of the Metrics made before that this builds on, by entry. */
  given: Map<string, string>;
  /** What adding a line changes of what is there already. */
  additions: Additions;
  /** What the person should know before they set up. */
  notes: string[];
  /** Why this cannot be set up as asked; empty when it can. */
  problems: string[];
};

/** A formula of a Pack's entries ({key}) with each key replaced by a Metric's slug. */
export function withSlugs(formula: string, slug: (key: string) => string): string {
  return formula.replace(/\{([a-z0-9-]+)\}/g, (_all, k: string) => `{${slug(k)}}`);
}

/** Everyone who may be put into a place. */
async function everyone(actor: Actor): Promise<Map<string, SetupPerson>> {
  const [people, { data: members }] = await Promise.all([peopleIn(actor.workspaceId), db().from("memberships").select("user_id, role").eq("workspace_id", actor.workspaceId)]);
  const roles = new Map((members ?? []).map((m) => [m.user_id as string, m.role as string]));
  return new Map(people.map((p) => [p.id, { id: p.id, name: p.name, kind: !roles.has(p.id) ? "contact" : roles.get(p.id) === "guest" ? "guest" : "member" } satisfies SetupPerson]));
}

const strings = (v: unknown, max: number): string[] => [...new Set((Array.isArray(v) ? v.slice(0, max + 1) : []).map(String))];
const list = <T>(v: T[] | undefined, max: number): T[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max || !v.every((x) => x && typeof x === "object")) throw new Error("This cannot be set up as asked.");
  return v;
};
const suffixed = (name: string, line: BuiltLine | null) => (line ? `${name}, ${line.name}` : name);
const givenName = (pick: { name?: string }, row: TemplateRow) => String(pick.name ?? "").trim().slice(0, 120) || row.name;

/** The places of a Pack's items, by key, of the Workflow Templates only those whose stored steps they were read for. */
export function placeMaps(places: PackPlaces | null, workflows: ReadonlyMap<string, TemplateRow>) {
  const byKey = <T extends { key: string }>(xs: T[] = []) => new Map(xs.map((x) => [x.key, x]));
  // A Workflow Template kept from another version has other steps than those the places were read for.
  const matching = (places?.workflows ?? []).filter((w) => {
    const row = workflows.get(w.key);
    return row && itemHash((row.body as WorkflowTemplateBody).steps) === w.mark;
  });
  return {
    positions: byKey(places?.positions), repeats: byKey(places?.repeats),
    metrics: byKey<PlacedMetric>(places?.metrics), dashboards: byKey<PlacedDashboard>(places?.dashboards), workflows: byKey<PlacedWorkflow>(matching),
  };
}
type Places = ReturnType<typeof placeMaps>;

/** The entries to make: those picked, and every input of a Derived one, in the Pack's order. */
function wantedEntries(p: InstalledForSetup, input: PackSetupInput): EntryRow[] {
  const asked = Array.isArray(input?.metrics) ? input.metrics.slice(0, SETUP_ENTRIES_MAX + 1).map(String) : [];
  if (asked.length > SETUP_ENTRIES_MAX || asked.some((k) => !KEY.test(k) || !p.entries.has(k))) throw new Error("Pick entries of this Pack's Metric Catalog.");
  const wanted = new Set(asked);
  for (const k of asked) {
    const f = p.entries.get(k)!.formula;
    if (!f) continue;
    for (const i of formulaInputs(f)) {
      const entry = p.entries.get(i);
      if (!entry) throw new Error(`“${p.entries.get(k)!.name}” is computed from an entry this Pack does not have.`);
      if (entry.formula) throw new Error(`“${p.entries.get(k)!.name}” is computed from “${entry.name}”, a Derived Metric itself: Ziffr computes from Metrics that take values.`);
      wanted.add(i);
    }
  }
  return [...p.entries.values()].filter((e) => wanted.has(e.pack_key));
}

/** A template picked, with the Repeat it is made once for. */
type Picked<T> = { pick: T; row: TemplateRow; per: string | undefined };

/** The templates picked: at most one outside the Repeats and one for each Repeat. */
function pickedTemplates<T extends { key: string }>(picks: T[], rows: ReadonlyMap<string, TemplateRow>, places: Places, per: (key: string) => string | undefined, what: string): Picked<T>[] {
  const out: Picked<T>[] = [];
  for (const pick of picks) {
    const row = typeof pick?.key === "string" ? rows.get(pick.key) : undefined;
    if (!row) throw new Error(`Pick one of this Pack's ${what} Templates.`);
    const scope = per(row.pack_key);
    if (out.some((x) => x.per === scope)) throw new Error(`Pick one ${what} Template ${scope === undefined ? "for the whole set" : `for each ${places.repeats.get(scope)?.name ?? scope}`}.`);
    out.push({ pick, row, per: scope });
  }
  return out;
}

/** Which Positions what is picked names, and for what, in the Pack's order. */
function positionUses(places: Places, entries: EntryRow[], boards: Picked<PackDashboardPick>[], flows: Picked<PackWorkflowPick>[]): PositionUse[] {
  const uses = new Map<string, Set<Place>>();
  const use = (keys: string | string[] | undefined, place: Place) => {
    for (const key of keys === undefined ? [] : [keys].flat()) uses.set(key, (uses.get(key) ?? new Set()).add(place));
  };
  for (const m of entries.flatMap((e) => places.metrics.get(e.pack_key) ?? [])) { use(m.submitters, "submit"); use(m.standIn, "standIn"); use(m.viewers, "share"); use(m.editors, "share"); }
  for (const d of boards.flatMap((b) => places.dashboards.get(b.row.pack_key) ?? [])) { use(d.viewers, "share"); use(d.editors, "share"); }
  for (const f of flows) {
    const w = places.workflows.get(f.row.pack_key);
    const steps = (f.row.body as WorkflowTemplateBody).steps;
    for (const s of w?.steps ?? []) {
      use(s.by, "approve"); use(s.assignee, "tick"); use(s.standIn, "tickStandIn");
      use(s.to, steps[s.at]?.type === "send_snapshot" ? "snapshot" : "told");
    }
    for (const t of w?.tells ?? []) use(t.to, "told");
  }
  return [...places.positions.values()].flatMap((p) => {
    const used = uses.get(p.key);
    return used ? [{ key: p.key, name: p.name, repeat: p.per ?? null, several: p.people === "several", places: used }] : [];
  });
}

/** Who fills what, as it is being laid out. */
type Filling = { places: Places; uses: ReadonlyMap<string, PositionUse>; people: Map<string, SetupPerson>; problems: string[]; notes: string[]; lines: BuiltLine[]; global: Map<string, string[]> };

/** The people of a Position fill, checked: Positions of this scope, people of this Workspace, as many as the Position
 * takes, each allowed every place the Position has in what is picked. */
function fillsOf(raw: PositionFill[] | undefined, repeat: string | undefined, f: Pick<Filling, "places" | "uses" | "people" | "problems">): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const fill of list(raw, PACK_POSITION_LIMITS.positions)) {
    const position = f.places.positions.get(String(fill.position));
    if (!position || position.per !== repeat || out.has(position.key)) throw new Error("Pick Positions of this Pack, each once.");
    const ids = strings(fill.people, PACK_POSITION_LIMITS.people).filter(Boolean);
    if (ids.length > (position.people === "one" ? 1 : PACK_POSITION_LIMITS.people)) throw new Error(position.people === "one" ? `${position.name} is one person.` : `${position.name} takes at most ${PACK_POSITION_LIMITS.people} people.`);
    if (ids.some((id) => !f.people.has(id))) throw new Forbidden("Pick members or Contacts of this Workspace.");
    const use = f.uses.get(position.key);
    // A Position nothing picked names takes no place: what was chosen for it is left aside.
    if (!use) continue;
    for (const id of ids) {
      const why = whyNot(f.people.get(id)!.kind, use.places);
      if (why) f.problems.push(`${f.people.get(id)!.name} cannot be ${position.name}. ${why}`);
    }
    out.set(position.key, ids);
  }
  return out;
}

/** Two names that read the same are the same line. */
export const sameLine = (name: string) => name.normalize("NFKC").toLowerCase();

/** The lines asked for, each with a name of its own as it may stand in the names of Metrics, which everyone who sees
 * them reads, and no more than its Repeat takes. */
function builtLines(raw: RepeatLine[] | undefined, f: Omit<Filling, "lines" | "global">, taken: { repeat: string; name: string }[]): BuiltLine[] {
  const lines: BuiltLine[] = [];
  for (const l of list(raw, PACK_POSITION_LIMITS.repeats * PACK_POSITION_LIMITS.lines)) {
    const repeat = f.places.repeats.get(String(l.repeat));
    if (!repeat) throw new Error("Add lines to the Repeats of this Pack.");
    const name = String(l.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) throw new Error(`Name each line of ${repeat.name}.`);
    if ([...name].length > PACK_POSITION_LIMITS.name || !textPasses(PLAIN, name)) throw new Error(`A line of ${repeat.name} has a name of at most ${PACK_POSITION_LIMITS.name} characters of plain text: no web or email address, markup or brackets.`);
    if (lines.some((x) => x.repeat === repeat.key && sameLine(x.name) === sameLine(name))) f.problems.push(`Two lines of ${repeat.name} are called “${name}”: give each its own name.`);
    if (taken.some((x) => x.repeat === repeat.key && sameLine(x.name) === sameLine(name))) f.problems.push(`There is a ${repeat.name} called “${name}” already: give this one another name.`);
    lines.push({ repeat: repeat.key, name, fills: fillsOf(l.people, repeat.key, f) });
  }
  for (const r of f.places.repeats.values()) {
    const n = lines.filter((l) => l.repeat === r.key).length && [...lines, ...taken].filter((l) => l.repeat === r.key).length;
    const max = Math.min(r.max ?? PACK_POSITION_LIMITS.lines, PACK_POSITION_LIMITS.lines);
    if (n > max) f.problems.push(`${r.name} takes at most ${max} lines; ${n} are listed.`);
  }
  return lines;
}

/** The people of a Position as an item sees it: its own line's, or, from outside the Repeat, every line's. */
function holders(f: Filling, keys: string | string[] | undefined, line: BuiltLine | null): string[] {
  return [...new Set((keys === undefined ? [] : [keys].flat()).flatMap((key) => {
    const position = f.places.positions.get(key);
    if (!position) return [];
    if (position.per === undefined) return f.global.get(key) ?? [];
    const from = line?.repeat === position.per ? [line] : f.lines.filter((l) => l.repeat === position.per);
    return from.flatMap((l) => l.fills.get(key) ?? []);
  }))];
}
const linesOf = (f: Filling, per: string | undefined): (BuiltLine | null)[] => (per === undefined ? [null] : f.lines.filter((l) => l.repeat === per));
const named = (f: Filling, id: string) => f.people.get(id)?.name ?? "Someone";

/** Whom a step names beyond what it takes are left out, and the person is told. */
function atMost(f: Filling, ids: string[], what: string): string[] {
  if (ids.length > TELL_PEOPLE_PER_STEP) f.notes.push(`${what} reaches at most ${TELL_PEOPLE_PER_STEP} people; ${ids.length - TELL_PEOPLE_PER_STEP} more are left out.`);
  return ids.slice(0, TELL_PEOPLE_PER_STEP);
}

/** A Send Snapshot step that names a dashboard of the Pack, before the dashboards are laid out. */
type Send = { workflow: PlannedWorkflow; dashboard: string; people: string[] };

/** A step of a Workflow with the people its Positions name. */
function filledStep(f: Filling, s: WorkflowStep, at: PlacedStep | undefined, flow: PlannedWorkflow, sends: Send[]): WorkflowStep {
  if (s.type === "checklist" && s.kind === "tick") {
    const assignee = holders(f, at?.assignee, flow.line)[0] ?? null;
    const standIn = holders(f, at?.standIn, flow.line)[0] ?? null;
    if (assignee && standIn === assignee) f.notes.push(`${named(f, assignee)} ticks off “${s.text}” already, so nobody stands in for them.`);
    return { ...s, assignee, ...(standIn && standIn !== assignee ? { standIn } : {}) };
  }
  if (s.type === "checklist") return { ...s, people: atMost(f, holders(f, at?.to, flow.line), `An item of ${flow.name}`) };
  if (s.type === "send_snapshot") {
    if (at?.dashboard === undefined) f.notes.push(`The Send Snapshot step of ${flow.name} waits: pick its dashboard and people in the Workflow.`);
    else sends.push({ workflow: flow, dashboard: at.dashboard, people: atMost(f, holders(f, at.to, flow.line), `The Snapshot of ${flow.name}`) });
  }
  return s;
}

/** The Workflows to make, with the people their steps ask for. A Workflow is not made while one of its Approvers is
 * empty. */
function plannedWorkflows(f: Filling, flows: Picked<PackWorkflowPick>[]): { workflows: PlannedWorkflow[]; sends: Send[] } {
  const workflows: PlannedWorkflow[] = [];
  const sends: Send[] = [];
  for (const { pick, row, per } of flows) {
    const body = row.body as WorkflowTemplateBody;
    const placed = f.places.workflows.get(row.pack_key);
    const at = new Map((placed?.steps ?? []).map((s) => [s.at, s]));
    const by = body.steps.flatMap((s, i) => (s.type === "approve" ? at.get(i)?.by ?? [] : []));
    for (const line of linesOf(f, per)) {
      const name = suffixed(givenName(pick, row), line);
      const approvers = by.length ? by.flatMap((k) => holders(f, k, line).slice(0, 1)) : strings(pick.approvers, MAX_APPROVERS);
      if (approvers.length < by.length) {
        const missing = by.filter((k) => !holders(f, k, line).length).map((k) => f.places.positions.get(k)!.name);
        f.problems.push(`Pick ${listed(missing)}${line ? ` for ${line.name}` : ""}: the Workflow ${name} is not made while an Approver is empty.`);
        continue;
      }
      const config = fromWorkflowTemplate(body, approvers);
      if (!config) {
        f.problems.push(by.length ? `The Approvers of ${name} must be different people.` : "Pick each Approver the Workflow Template asks for, each person once.");
        continue;
      }
      const flow: PlannedWorkflow = { key: row.pack_key, line, name, templateName: row.name, config, approvers, send: null };
      config.steps = config.steps.map((s, i) => filledStep(f, s, at.get(i), flow, sends));
      config.steps.push(...(placed?.tells ?? []).map((t): WorkflowStep => ({ type: "tell", id: "", condition: t.condition, people: atMost(f, holders(f, t.to, line), `A Tell step of ${name}`), groups: [] })));
      workflows.push(flow);
    }
  }
  return { workflows, sends };
}

/** The Metrics made, found again by entry and line. */
type Made = (key: string, line: BuiltLine | null) => PlannedMetric | undefined;

/** Who is asked for the values of an entry, of those who would submit it. */
type Asked = (key: string, would: string[]) => Pick<PlannedMetric, "submitters" | "elsewhere" | "left">;

/** A number the Pack says comes from elsewhere (another system sends it, or it is set as a target) is asked of nobody,
 * whether they were picked beside Positions or hold one: only of the person setting up, when they chose to be asked.
 * The Pack's word only ever asks fewer people, never more. */
function asking(actor: Actor, p: InstalledForSetup, input: PackSetupInput): Asked {
  const elsewhere = new Map((p.overview?.numbers ?? []).flatMap((n): [string, Elsewhere][] => (n.by === "system" || n.by === "target" ? [[n.key, n.by]] : [])));
  return (key, would) => {
    const by = elsewhere.get(key) ?? null;
    const submitters = by === null ? would : would.filter((id) => input.askElsewhere === true && id === actor.personId);
    return { submitters, elsewhere: by, left: would.filter((id) => !submitters.includes(id)) };
  };
}

/** The Metrics to make: those outside every Repeat, then line by line; in each part what takes values before what is
 * computed from it. `beside` submit an entry that names no Position for that; `ask` says who is asked. */
function plannedMetrics(f: Filling, entries: EntryRow[], workflows: PlannedWorkflow[], beside: string[], ask: Asked, to: AddingTo | null): { metrics: PlannedMetric[]; made: Made } {
  const metrics: PlannedMetric[] = [];
  const byPlace = new Map<string, PlannedMetric>();
  const perOf = (key: string) => f.places.metrics.get(key)?.per;
  const at = (key: string, line: BuiltLine | null) => `${key} ${line ? f.lines.indexOf(line) : ""}`;
  const flowFor = (line: BuiltLine | null) => (line && workflows.find((w) => w.line === line)) || workflows.find((w) => !w.line) || null;
  // Adding a line makes nothing outside it: the Metrics made before stand for their entries.
  for (const entry of to ? entries.filter((e) => perOf(e.pack_key) === undefined) : []) {
    const m = to!.given.get(entry.pack_key);
    if (m) byPlace.set(at(entry.pack_key, null), { plan: m.id, slug: m.slug, entry, line: null, name: m.name, submitters: [], standIn: null, workflow: null, elsewhere: null, left: [] });
    const needing = entries.filter((e) => e.formula && formulaInputs(e.formula).includes(entry.pack_key)).map((e) => e.name);
    if (needing.length && (!m || !to!.mayCompute.has(entry.pack_key))) f.problems.push(`${listed(needing)} cannot be added: it is computed from ${entry.name}, ${m ? "which you neither own nor edit" : "which is not there or not shared with you"}. Untick it.`);
  }
  for (const line of [...(to ? [] : [null]), ...f.lines]) {
    const part = entries.filter((e) => perOf(e.pack_key) === line?.repeat);
    for (const entry of [...part.filter((e) => !e.formula), ...part.filter((e) => e.formula)]) {
      const place = f.places.metrics.get(entry.pack_key);
      const name = suffixed(entry.name, line);
      if ([...name].length > 120) f.problems.push(`“${name}” is longer than a Metric's name may be, 120 characters: shorten the line's name.`);
      const plain = !entry.formula;
      const { submitters, elsewhere, left } = plain ? ask(entry.pack_key, place?.submitters ? holders(f, place.submitters, line) : beside) : { submitters: [], elsewhere: null, left: [] };
      // Nobody stands in for a number nobody types: a Stand-in would be asked for it.
      let standIn = plain && !elsewhere ? holders(f, place?.standIn, line)[0] ?? null : null;
      if (standIn && submitters.includes(standIn)) {
        f.notes.push(`${named(f, standIn)} submits ${name} already, so nobody stands in for them there.`);
        // Someone else's Stand-in all the same.
        if (submitters.length === 1) standIn = null;
      }
      const m: PlannedMetric = { plan: -(metrics.length + 1), entry, line, name, submitters, standIn, workflow: plain ? flowFor(line) : null, elsewhere, left };
      metrics.push(m);
      byPlace.set(at(entry.pack_key, line), m);
    }
  }
  for (const r of f.places.repeats.values()) {
    if (!f.lines.some((l) => l.repeat === r.key) && entries.some((e) => perOf(e.pack_key) === r.key)) f.problems.push(`List at least one ${r.name}, or leave out what is made once for each.`);
  }
  if (metrics.length > SETUP_METRICS_MAX) f.problems.push(`One Set up makes at most ${SETUP_METRICS_MAX} Metrics; this makes ${metrics.length}. List fewer lines.`);
  return { metrics, made: (key, line) => byPlace.get(at(key, perOf(key) === undefined ? null : line)) };
}

/** The dashboards to make, with their Slots filled by what is made, else by Metrics picked (`offered`). */
function plannedDashboards(f: Filling, boards: Picked<PackDashboardPick>[], made: Made): { dashboards: PlannedDashboard[]; offered: number[] } {
  const dashboards: PlannedDashboard[] = [];
  const offered: number[] = [];
  for (const { pick, row, per } of boards) {
    const given = Array.isArray(pick.fills) ? pick.fills : [];
    for (const line of linesOf(f, per)) {
      const fills = (row.slots ?? []).map((s, i): number[] => {
        if (s.suggests) {
          const own = made(s.suggests, line);
          if (own) {
            // A Metric made before is one the actor must see, like any picked for a Slot.
            if (own.plan > 0) offered.push(own.plan);
            return [own.plan];
          }
          // From outside a Repeat, a Slot that takes several Metrics is filled with every line's.
          const of = f.places.metrics.get(s.suggests)?.per;
          const all = s.multiple && of !== per ? linesOf(f, of).flatMap((l) => made(s.suggests!, l)?.plan ?? []) : [];
          if (all.length) return all;
        }
        const chosen = given[i];
        const ids = Array.isArray(chosen) ? chosen.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 50) : [];
        if (!ids.length) f.problems.push(`Fill the Slot “${s.label}” with a Metric, or make the entry it suggests.`);
        const used = s.multiple ? ids : ids.slice(0, 1);
        offered.push(...used);
        return used;
      });
      dashboards.push({ plan: -(dashboards.length + 1), key: row.pack_key, line, name: suffixed(givenName(pick, row), line), template: row, fills });
    }
  }
  return { dashboards, offered };
}

/** Gives each Send Snapshot step its dashboard, when that is made here and the Workflow locks. */
function connectSends(f: Filling, sends: Send[], dashboards: PlannedDashboard[]) {
  for (const s of sends) {
    const board = dashboards.find((d) => d.key === s.dashboard && (d.line === null || d.line === s.workflow.line));
    const locks = s.workflow.config.steps.some((x) => x.type === "publish" && x.lock);
    if (board && locks) s.workflow.send = { dashboard: board.plan, people: s.people };
    else f.notes.push(`The Send Snapshot step of ${s.workflow.name} waits: its dashboard is not made here. Pick it and the people in the Workflow.`);
  }
}

/** A Derived Metric's formula, by the Metrics' slugs, checked against the Workspace's Metrics as they will be, with
 * each slug as long as one can get, so the formula written later cannot be refused as too long. */
function checkFormulas(metrics: PlannedMetric[], made: Made, existing: Metric[]) {
  const derived = metrics.filter((m) => m.entry.formula);
  if (!derived.length) return;
  const longest = (m: PlannedMetric) => m.slug ?? `${m.entry.pack_key}-${-m.plan}-`.padEnd(LONGEST_SLUG, "x");
  const planned = metrics.filter((m) => !m.entry.formula).map((m): FormulaInput => ({ slug: longest(m), name: m.name, period: m.entry.period as FormulaInput["period"], formula: null, aggregation: m.entry.aggregation as FormulaInput["aggregation"] }));
  for (const m of derived) {
    const formula = withSlugs(m.entry.formula!, (k) => {
      const input = made(k, m.line);
      // An input made once per line has no one Metric to name from outside its Repeat.
      if (!input) throw new Error(`“${m.name}” cannot be made: it is computed from an entry of another Repeat.`);
      return longest(input);
    });
    const why = checkFormula(formula, [...existing, ...planned], { slug: "-", period: m.entry.period as FormulaInput["period"] });
    if (why) throw new Error(`“${m.name}” cannot be made: ${why}`);
  }
}

/** The Shares the Pack proposes among what is made: never one with the person setting up, who owns it all, nor with a
 * Contact. Editor wins over Viewer. Whoever holds a Position that submits a Metric and is not asked for it is proposed
 * as its Viewer, so that the Position still lets them see it. */
function proposedShares(f: Filling, actor: Actor, metrics: PlannedMetric[], dashboards: PlannedDashboard[]): ProposedShare[] {
  const shares = new Map<string, ProposedShare>();
  const propose = (object: ProposedShare["object"], item: PlannedMetric | PlannedDashboard, key: string, role: ShareRole, person: string): ProposedShare | undefined => {
    if (person === actor.personId || f.people.get(person)?.kind === "contact") return undefined;
    const one = `${object} ${item.plan} ${person}`;
    const share = shares.get(one) ?? { id: JSON.stringify([object, key, item.line?.name ?? "", person, role]), object, plan: item.plan, item: item.name, person, role, keeps: false };
    shares.set(one, share);
    return share;
  };
  const placed = (object: ProposedShare["object"], item: PlannedMetric | PlannedDashboard, key: string) => {
    const place = object === "metric" ? f.places.metrics.get(key) : f.places.dashboards.get(key);
    for (const [role, keys] of [["editor", place?.editors], ["viewer", place?.viewers]] as const) for (const person of holders(f, keys, item.line)) propose(object, item, key, role, person);
  };
  for (const m of metrics) {
    placed("metric", m, m.entry.pack_key);
    // Only a Position gave this sight: someone picked beside Positions was never promised it by the Pack.
    if (!f.places.metrics.get(m.entry.pack_key)?.submitters) continue;
    for (const person of m.left) {
      const share = propose("metric", m, m.entry.pack_key, "viewer", person);
      if (share) share.keeps = true;
    }
  }
  for (const d of dashboards) placed("dashboard", d, d.key);
  return [...shares.values()];
}

/** The proposed Shares that are ticked: an id that is no proposal of this blueprint shares nothing. */
export function tickedShares(b: Blueprint, ids: unknown): ProposedShare[] {
  const wanted = new Set(Array.isArray(ids) ? ids.map(String) : []);
  return b.shares.filter((s) => wanted.has(s.id));
}

/** The Repeat whose one new line is asked for, when adding to what is there: exactly one line, nothing made for the
 * whole set. */
function oneLineOf(places: Places, input: PackSetupInput): string {
  const repeat = Array.isArray(input.lines) && input.lines.length === 1 ? String(input.lines[0]?.repeat) : "";
  if (!places.repeats.has(repeat)) throw new Error("Add one line at a time.");
  if (input.dashboard || input.workflow || input.metrics?.some((k) => places.metrics.get(String(k))?.per !== repeat)) throw new Error("Adding a line makes only what is made once for each line.");
  return repeat;
}

/** Checks what is asked for against the install and the Workspace, and lays out what would be made. For a further step
 * of a Set up, `earlier` names its record and counts the Metrics it made, which the Workspace Limit has counted. */
export async function buildSetup(actor: Actor, p: InstalledForSetup, input: PackSetupInput, earlier?: { record: number; metrics: number }): Promise<Blueprint> {
  const entries = wantedEntries(p, input);
  const places = placeMaps(p.places, p.workflows);
  const existing = await getMetrics(actor.workspaceId);
  const to = input.adding ? await addingTo(actor, p.install.id, oneLineOf(places, input), existing, earlier?.record) : null;
  const flows = pickedTemplates([...(input.workflow ? [input.workflow] : []), ...list(input.lineWorkflows, PACK_POSITION_LIMITS.repeats)], p.workflows, places, (k) => places.workflows.get(k)?.per, "Workflow");
  const boards = pickedTemplates([...(input.dashboard ? [input.dashboard] : []), ...list(input.lineDashboards, PACK_POSITION_LIMITS.repeats)], p.dashboards, places, (k) => places.dashboards.get(k)?.per, "Dashboard");

  // Who fills what, and the lines of each Repeat.
  const positions = positionUses(places, entries, boards, flows);
  const base = { places, uses: new Map(positions.map((u) => [u.key, u])), people: await everyone(actor), problems: [] as string[], notes: [] as string[] };
  for (const flow of flows) if (p.places?.workflows.some((w) => w.key === flow.row.pack_key) && !places.workflows.has(flow.row.pack_key)) base.notes.push(`The Positions of the Workflow ${flow.row.name} do not apply: this copy was kept from another version of the Pack.`);
  const global = fillsOf(input.people, undefined, base);
  const filling: Filling = { ...base, global, lines: builtLines(input.lines, base, to?.taken ?? []) };

  const { workflows, sends } = plannedWorkflows(filling, flows);
  const beside = strings(input.submitters, MAX_SUBMITTERS);
  const { metrics, made } = plannedMetrics(filling, entries, workflows, beside, asking(actor, p, input), to);
  const { dashboards, offered } = plannedDashboards(filling, boards, made);
  connectSends(filling, sends, dashboards);
  // Adding a line: one computed from a Metric that is not there to compute from is a problem said already, so its
  // formula is not read.
  checkFormulas(to ? metrics.filter((m) => !m.entry.formula || formulaInputs(m.entry.formula).every((k) => made(k, m.line))) : metrics, made, existing);
  // The Metrics that fill the other Slots: ones the person sees and that are not archived, as the page offers.
  if (offered.length) {
    const { choices } = await metricChoices(actor);
    const seen = new Set(choices.map((m) => m.id));
    if (offered.some((id) => !seen.has(id))) throw new Forbidden("Fill a Slot only with Metrics you see.");
  }
  if (beside.length > MAX_SUBMITTERS) throw new Error(`Ask at most ${MAX_SUBMITTERS} people; add more on each Metric's page.`);
  // Submitters and Approvers picked beside Positions are members of this Workspace: the page offers no one else.
  const asMembers = [...beside, ...flows.flatMap((x) => (places.workflows.get(x.row.pack_key)?.steps.some((s) => s.by) ? [] : strings(x.pick.approvers, MAX_APPROVERS)))];
  if (asMembers.some((id) => !filling.people.has(id) || filling.people.get(id)!.kind === "contact")) throw new Forbidden("Pick members of this Workspace.");
  // A Feed from the browser: a string naming a live Feed of this Workspace, or nothing.
  if (input.feed != null && typeof input.feed !== "string") throw new Error("Pick one of this Workspace's Feeds.");
  const feed = input.feed ? await liveFeed(actor.workspaceId, input.feed).then((x) => x.person_id as string, () => { throw new Forbidden("Pick one of this Workspace's Feeds."); }) : null;

  // Nobody approves their own value: said, never changed.
  for (const id of new Set(metrics.flatMap((m) => m.submitters.filter((s) => m.workflow?.approvers.includes(s)))))
    filling.notes.push(`${named(filling, id)} submits values and approves in the same Workflow. Nobody approves their own value: the next Approver or the Metric Owner does, else the Approve step's Self-check or count applies.`);

  const toMake = metrics.length - (earlier?.metrics ?? 0);
  const refusal = toMake > 0 ? await roomFor(actor, toMake) : null;
  if (refusal) filling.problems.push(refusal);
  if (!metrics.length && !dashboards.length && !workflows.length && !filling.problems.length) filling.problems.push("Pick something to set up.");
  const ticked = new Set((Array.isArray(input.adding?.ticked) ? input.adding.ticked : []).map(String));
  const additions = to && p.places ? await additionsFor(actor, to, p.places, metrics, ticked) : NO_ADDITIONS;
  return {
    given: new Map([...(to?.given ?? [])].map(([k, m]) => [k, m.slug])), additions,
    workflows, metrics, dashboards, shares: proposedShares(filling, actor, metrics, dashboards), feed, positions, fills: filling.global, lines: filling.lines,
    people: filling.people, existing, notes: [...new Set(filling.notes)], problems: [...new Set(filling.problems)],
  };
}
