// What each Position and Repeat of a Pack does (spec 0058, #1178; GLOSSARY: Position, Repeat, Pack, Share, Workflow
// Template): the places of a checked ziffr.pack/2 or /3 file taken off its items' wrappers into one small document the
// install keeps, and that document said in words for the Packs page, before and after installing. With them go the
// questions and the numbers asked at set-up of a /3 Pack (spec 0068).
// Security: a Pack is untrusted input. What is kept holds keys, the Pack's own Position and Repeat names, its questions
// as plain text of limited length and a share in percent, never a person, and is read back defensively. A Position grants
// nothing by itself: who fills it, and what is shared, is decided at Set up by the server.
import type { PackPosition, PackRepeat } from "@ziffr/pack/pack-positions";
import { PACK_ASK_EVERY, PACK_SET_UP_LIMITS as L, type PackAsk } from "@ziffr/pack/set-up";
import { PLAIN, textPasses } from "./file-text";
import type { Pack } from "./pack";
import type { WorkflowTemplateStep } from "./types";

/** The places of one Metric Catalog entry: the Repeat that makes it once per line, the Positions that submit it,
 * stand in for its Submitters and are proposed a Share of it, and the number asked at set-up for it. */
export type PlacedMetric = { key: string; per?: string; submitters?: string[]; standIn?: string; viewers?: string[]; editors?: string[]; ask?: PackAsk };
/** The places of one Dashboard Template: its Repeat and the Positions it is proposed to be shared with. */
export type PlacedDashboard = { key: string; per?: string; viewers?: string[]; editors?: string[] };
/** The Positions one step of a stored Workflow Template names; `at` is the step's place in the stored template. */
export type PlacedStep = { at: number; by?: string[]; assignee?: string; standIn?: string; to?: string[]; dashboard?: string };
/** A Tell step of a Pack's Workflow Template, which a stored template does not hold: when, and the Positions told. */
export type PlacedTell = { condition: { kind: "share_of_target" | "changed_more"; share: string }; to?: string[] };
/** The places of one Workflow Template. `mark` identifies the stored steps the places were read for: a copy kept from
 * another version does not match it, and its places are left alone. */
export type PlacedWorkflow = { key: string; per?: string; mark: string; steps: PlacedStep[]; tells: PlacedTell[] };
/** What an install keeps of a Pack's Positions and Repeats, and of what its set-up asks. */
export type PackPlaces = { positions: PackPosition[]; repeats: PackRepeat[]; metrics: PlacedMetric[]; dashboards: PlacedDashboard[]; workflows: PlacedWorkflow[] };

/** The fields of `o` that are there, of those named. */
function given<T extends object, K extends keyof T>(o: T, fields: readonly K[]): Pick<T, K> {
  return Object.fromEntries(fields.filter((f) => o[f] !== undefined).map((f) => [f, o[f]])) as Pick<T, K>;
}
const METRIC_FIELDS = ["per", "submitters", "standIn", "viewers", "editors", "ask"] as const;
const DASHBOARD_FIELDS = ["per", "viewers", "editors"] as const;
const STEP_FIELDS = ["by", "assignee", "standIn", "to", "dashboard"] as const;

/** The places of a checked Pack, or null when it has none and asks no number at set-up. `mark` identifies the steps
 * of a Workflow Template as they are stored (every step but a Tell step, in the file's order). */
export function packPlaces(pack: Pick<Pack, "positions" | "repeats" | "contents">, mark: (key: string) => string): PackPlaces | null {
  const metrics = (pack.contents.metrics ?? []).map((m): PlacedMetric => ({ key: m.key, ...given(m, METRIC_FIELDS) })).filter((m) => Object.keys(m).length > 1);
  const dashboards = (pack.contents.dashboards ?? []).map((d): PlacedDashboard => ({ key: d.key, ...given(d, DASHBOARD_FIELDS) })).filter((d) => Object.keys(d).length > 1);
  const workflows = (pack.contents.workflows ?? []).flatMap((w): PlacedWorkflow[] => {
    const steps: PlacedStep[] = [];
    const tells: PlacedTell[] = [];
    let at = 0;
    for (const s of w.template.steps) {
      if (s.type === "tell") { tells.push({ condition: { kind: s.condition.kind, share: s.condition.share }, ...(s.to ? { to: s.to } : {}) }); continue; }
      // An Escalate step's `to` is “stand-in” or “owner”, never a Position.
      const named = s.type === "escalate" ? {} : given(s as Omit<PlacedStep, "at">, STEP_FIELDS);
      if (Object.keys(named).length) steps.push({ at, ...named });
      at++;
    }
    return w.per !== undefined || steps.length || tells.length ? [{ key: w.key, ...given(w, ["per"] as const), mark: mark(w.key), steps, tells }] : [];
  });
  const positions = pack.positions ?? [];
  const repeats = pack.repeats ?? [];
  return positions.length || repeats.length || workflows.length || metrics.some((m) => m.ask) ? { positions, repeats, metrics, dashboards, workflows } : null;
}

const isText = (v: unknown): v is string => typeof v === "string";
const isKeys = (v: unknown) => v === undefined || (Array.isArray(v) && v.every(isText));
const isKey = (v: unknown) => v === undefined || isText(v);
const rows = (v: unknown): Record<string, unknown>[] | null => (Array.isArray(v) && v.every((x) => x && typeof x === "object") ? (v as Record<string, unknown>[]) : null);
const sound = (v: unknown, one: string[], several: string[]) => rows(v)?.every((x) => isText(x.key) && one.every((f) => isKey(x[f])) && several.every((f) => isKeys(x[f]))) ?? false;

/** Whether a stored text of a set-up is one a Pack may declare: plain text, with something in it, within its limit. */
const words = (max: number) => (v: unknown) => isText(v) && v.trim() !== "" && [...v].length <= max && textPasses(PLAIN, v);
const asked = (v: unknown) => {
  const a = v as Partial<PackAsk> | null;
  return !!a && words(L.question)(a.question) && words(L.name)(a.name) && PACK_ASK_EVERY.some((e) => e === a.every);
};
/** A stored row without those of `fields` that do not fit: the row stays, and a set-up uses Ziffr's own words. */
const without = <T extends object>(row: T, fields: Record<string, (v: unknown) => boolean>): T =>
  Object.fromEntries(Object.entries(row).filter(([k, v]) => !Object.hasOwn(fields, k) || fields[k](v))) as T;

/** The places an install keeps, read back from the database: null when it has none, or when what is there does not have
 * the shape installing wrote (then the Pack is treated as one without Positions). A question, hint or number asked that
 * is not what installing wrote is left out on its own. */
export function readPlaces(raw: unknown): PackPlaces | null {
  const p = raw as Partial<Record<keyof PackPlaces, unknown>> | null | undefined;
  if (!p || typeof p !== "object") return null;
  const ok = (rows(p.positions)?.every((x) => isText(x.key) && isText(x.name) && (x.people === "one" || x.people === "several") && isKey(x.per)) ?? false)
    && (rows(p.repeats)?.every((x) => isText(x.key) && isText(x.name) && (x.max === undefined || Number.isInteger(x.max))) ?? false)
    && sound(p.metrics, ["per", "standIn"], ["submitters", "viewers", "editors"])
    && sound(p.dashboards, ["per"], ["viewers", "editors"])
    && (rows(p.workflows)?.every((w) => isText(w.key) && isKey(w.per) && isText(w.mark)
      && (rows(w.steps)?.every((s) => Number.isInteger(s.at) && ["assignee", "standIn", "dashboard"].every((f) => isKey(s[f])) && isKeys(s.by) && isKeys(s.to)) ?? false)
      && (rows(w.tells)?.every((t) => { const c = t.condition as { kind?: unknown; share?: unknown } | null; return (c?.kind === "share_of_target" || c?.kind === "changed_more") && isText(c.share) && isKeys(t.to); }) ?? false)) ?? false);
  if (!ok) return null;
  const kept = p as PackPlaces;
  return {
    ...kept,
    positions: kept.positions.map((x) => without(x, { question: words(L.question), hint: words(L.hint) })),
    repeats: kept.repeats.map((x) => without(x, { question: words(L.question) })),
    metrics: kept.metrics.map((x) => {
      // Rebuilt field by field, so that nothing else stored beside a number asked is passed on.
      const { ask, ...m } = x;
      return asked(ask) ? { ...m, ask: { question: ask!.question, name: ask!.name, every: ask!.every } } : m;
    }),
  };
}

/** A Pack's Positions, Repeats and proposed Shares in words, as the Packs page shows them. */
export type PackPeople = {
  repeats: { name: string; max: number; makes: string[]; positions: string[] }[];
  positions: { name: string; several: boolean; /** The Repeat each of whose lines has its own holder. */ each: string | null; does: string[] }[];
  /** Per Position and role, what it is proposed to be shared. */
  shares: { position: string; role: "Viewer" | "Editor"; metrics: string[]; dashboards: string[] }[];
};

/** What the words are made from: the Pack's items by key, as they are named (null when the Workspace no longer has one),
 * and the stored steps of a Workflow Template when they are the ones the places were read for. */
export type PlacedItems = {
  name: (kind: "metric" | "dashboard" | "workflow", key: string) => string | null;
  steps: (workflow: PlacedWorkflow) => readonly WorkflowTemplateStep[] | null;
};

/** The most Repeat lines when a Pack sets no `max` of its own, as the format keeps it. */
const LINES = 50;
const short = (text: string) => ([...text].length > 80 ? `${[...text].slice(0, 79).join("")}…` : text);
/** “A”, “A and B”, “A, B and C”. */
export const listed = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
const ORDINAL = ["first", "second", "third"];

/** Says what a Pack's places mean. Items the Workspace no longer has are left out. */
export function describePlaces(places: PackPlaces, items: PlacedItems): PackPeople {
  // By key, through Maps: a key is only ever a key.
  const does = new Map(places.positions.map((p) => [p.key, [] as string[]]));
  const say = (position: string | undefined, line: string) => { if (position !== undefined) does.get(position)?.push(line); };
  const nameOf = new Map(places.positions.map((p) => [p.key, p.name]));
  const shares = new Map<string, PackPeople["shares"][number]>();
  const propose = (kind: "metrics" | "dashboards", item: string, viewers: string[] = [], editors: string[] = []) => {
    for (const [role, keys] of [["Viewer", viewers], ["Editor", editors]] as const) for (const k of keys) {
      const share: PackPeople["shares"][number] = shares.get(`${k} ${role}`) ?? { position: nameOf.get(k) ?? k, role, metrics: [], dashboards: [] };
      share[kind].push(item);
      shares.set(`${k} ${role}`, share);
    }
  };
  const submits = new Map<string, string[]>();
  const standsIn = new Map<string, string[]>();
  const collect = (into: Map<string, string[]>, key: string, item: string) => into.set(key, [...(into.get(key) ?? []), item]);
  for (const m of places.metrics) {
    const name = items.name("metric", m.key);
    if (name === null) continue;
    for (const k of m.submitters ?? []) collect(submits, k, name);
    if (m.standIn !== undefined) collect(standsIn, m.standIn, name);
    propose("metrics", name, m.viewers, m.editors);
  }
  for (const [k, names] of submits) say(k, `Submits ${listed(names)}.`);
  for (const [k, names] of standsIn) say(k, `Stands in for the Submitters of ${listed(names)}.`);
  for (const d of places.dashboards) {
    const name = items.name("dashboard", d.key);
    if (name !== null) propose("dashboards", name, d.viewers, d.editors);
  }
  for (const w of places.workflows) {
    const name = items.name("workflow", w.key);
    const steps = name === null ? null : items.steps(w);
    if (name === null || !steps) continue;
    const flow = `the Workflow ${name}`;
    for (const placed of w.steps) {
      const step = steps[placed.at];
      if (!step) continue;
      if (step.type === "approve") placed.by?.forEach((k, i) => say(k, (placed.by!.length > 1 ? `Approves ${ORDINAL[i] ?? "next"} of ${placed.by!.length} in ${flow}.` : `Approves in ${flow}.`)));
      else if (step.type === "checklist" && step.kind === "tick") {
        say(placed.assignee, `Ticks off “${short(step.text)}” in ${flow}.`);
        say(placed.standIn, `Stands in for the Assignee of “${short(step.text)}” in ${flow}.`);
      } else if (step.type === "checklist") for (const k of placed.to ?? []) say(k, `Is told “${short(step.text)}” in ${flow}.`);
      else if (step.type === "send_snapshot") {
        const dashboard = placed.dashboard === undefined ? null : items.name("dashboard", placed.dashboard);
        for (const k of placed.to ?? []) say(k, `Gets the Snapshot${dashboard === null ? "" : ` of the dashboard ${dashboard}`} that ${flow} sends.`);
      }
    }
    for (const t of w.tells) for (const k of t.to ?? [])
      say(k, t.condition.kind === "share_of_target" ? `Is told when a Metric of ${flow} reaches ${t.condition.share} % of its target.` : `Is told when a Metric of ${flow} changes by more than ${t.condition.share} % on the period before.`);
  }
  const made = (kind: "metric" | "dashboard" | "workflow", list: { key: string; per?: string }[], repeat: string) => list.filter((x) => x.per === repeat).flatMap((x) => items.name(kind, x.key) ?? []);
  return {
    repeats: places.repeats.map((r) => {
      const [metrics, dashboards, workflows] = [made("metric", places.metrics, r.key), made("dashboard", places.dashboards, r.key), made("workflow", places.workflows, r.key)];
      return {
        name: r.name,
        max: r.max ?? LINES,
        makes: [
          ...(metrics.length ? [`${metrics.length === 1 ? "Metric" : "Metrics"}: ${listed(metrics)}`] : []),
          ...(dashboards.length ? [`${dashboards.length === 1 ? "Dashboard" : "Dashboards"}: ${listed(dashboards)}`] : []),
          ...(workflows.length ? [`${workflows.length === 1 ? "Workflow" : "Workflows"}: ${listed(workflows)}`] : []),
        ],
        positions: places.positions.filter((p) => p.per === r.key).map((p) => p.name),
      };
    }),
    positions: places.positions.map((p) => ({ name: p.name, several: p.people === "several", each: p.per === undefined ? null : places.repeats.find((r) => r.key === p.per)?.name ?? p.per, does: does.get(p.key) ?? [] })),
    // In the order of the Pack's Positions, Viewer before Editor.
    shares: places.positions.flatMap((p) => ["Viewer", "Editor"].flatMap((role) => shares.get(`${p.key} ${role}`) ?? [])),
  };
}
