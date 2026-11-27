// The steps of a guided Pack set-up (spec 0068; GLOSSARY: Pack, Position, Repeat, Metric Catalog, Total, Trial Limit):
// from what a Pack declares and the room the Workspace has, what the flow asks, with its defaults and limits. Pure and
// safe for the browser: the screens, "Try it" and the server all ask this one place. pack-start-plan.ts says what the
// answers would make.
// Security: the declarations come from a Pack, which is untrusted: they hold short plain text only, read and bounded by
// pack-start-declarations.ts. Nothing here reads or writes; the server checks every answer again (pack-start.ts).
import type { PackAsk, PackAskEvery, PackSetUpWords } from "@ziffr/pack/set-up";
import type { Place } from "./pack-setup-who";
import type { Period } from "./types";

/** A Metric Catalog entry as the set-up reads it. `takesValues` is false for a Derived Metric or a Total. */
export type StartMetric = {
  key: string; name: string; period: Period; takesValues: boolean;
  /** The Repeat that makes it once for each line. */
  per?: string;
  total?: { of: string; targets: "own" | "parts" };
  /** The Positions that submit it, stand in for its Submitters and are proposed a Share of it. */
  submitters?: string[]; standIn?: string; viewers?: string[]; editors?: string[];
  /** Where the Pack says its number comes from. */
  comesFrom?: "person" | "system" | "target";
  /** A number asked at set-up and written as this Metric's target. */
  ask?: PackAsk;
};
/** A Position of the Pack, with the question that fills it. */
export type StartPosition = { key: string; name: string; per?: string; question?: string; hint?: string };
/** A Repeat of the Pack, with the question that lists its lines. */
export type StartRepeat = { key: string; name: string; max?: number; question?: string };
/** A Slot of a Dashboard or Deck Template: the entry it suggests, and whether it takes several. */
export type StartSlot = { suggests: string | null; multiple: boolean };
/** A Dashboard Template of the Pack. */
export type StartDashboard = { key: string; name: string; per?: string; viewers?: string[]; editors?: string[]; slots: StartSlot[] };
/** A Deck Template of the Pack. */
export type StartDeck = { key: string; name: string; slots: StartSlot[] };
/** A Workflow Template of the Pack: how many Approvers it asks for, the Positions that approve, in order, and the other
 * places Positions take in its steps. */
export type StartWorkflow = { key: string; name: string; per?: string; approvers: number; approveBy?: string[]; uses?: { position: string; place: Place }[] };

/** What the guided set-up reads of a Pack. Everything a Pack may add for its set-up is optional. */
export type StartDeclarations = {
  name: string;
  summary?: string;
  setUp?: Partial<PackSetUpWords>;
  metrics: StartMetric[];
  positions?: StartPosition[];
  repeats?: StartRepeat[];
  dashboards?: StartDashboard[];
  decks?: StartDeck[];
  workflows?: StartWorkflow[];
  /** The n8n templates the Pack says fill its entries. */
  feeds?: { template: string; fills: string[] }[];
};

/** The room the Workspace has for a set-up: counts only. */
export type StartRoom = {
  /** How many Metrics may be made now; null where nothing limits it. */
  metrics: number | null;
  /** In a Trial Workspace: the most Metrics it holds, the free places for people, and the Members and Guests here
   * besides the person setting up. Null outside a trial. */
  trial: { metricCap: number; places: number; others: number } | null;
  /** A Practice Workspace takes no new people. */
  practice: boolean;
};

/** The most Metrics one set-up makes (the same as any Set up). */
export const START_METRICS_MAX = 200;
/** The most lines a Repeat takes. */
const LINES_MAX = 50;
/** The most other people picked to provide numbers; the person setting up may be ticked too. */
export const START_PROVIDERS_MAX = 5;

/** How many lines a Repeat may have here, and what bounds it. */
export type StartLimit = { allowed: number; because: "pack" | "metrics" | "setup" | "people" };

/** A Position asked as a question. `needsRole`: holding it takes a Workspace Role, so someone new does not hold it
 * until they joined. */
export type StartAsked = { position: string; name: string; question: string; hint: string | null; needsRole: boolean; places: Place[] };

/** One screen of the flow. A step with nothing to ask is left out. */
export type StartStep =
  | { step: "preview"; name: string; line: string; /** "Every week" and the like. */ heading: string; happens: string[]; needs: string[]; draws: { kind: "dashboard" | "deck"; key: string } | null; /** False when the Pack has nothing to set up: it is only added. */ setsUp: boolean; /** Why it cannot be set up here, or null. */ blocked: string | null }
  | { step: "lines"; repeat: string; name: string; question: string; /** Whether each line asks a name: no Position of the Repeat submits. */ asksName: boolean; /** The person each line is, if a Position submits. */ person: StartAsked | null; others: StartAsked[]; limit: StartLimit }
  | ({ step: "who" } & StartAsked)
  | { step: "providers"; metrics: { key: string; name: string }[]; preselected: "me" | "nobody"; max: number }
  | { step: "numbers"; asks: { metric: string; name: string; question: string; field: string; every: PackAskEvery; /** One field per line of this Repeat. */ repeat: string | null; /** The Total that adds these targets up, whose sum is shown. */ total: string | null }[] }
  | { step: "source"; metrics: { key: string; name: string }[]; preselected: "typed" | "system"; /** The n8n templates the Pack names for them. */ templates: string[] }
  | { step: "check" };

/** Who is picked: the person setting up, someone already here, or someone new by name and email address. */
export type StartPerson = { who: "me" } | { who: "here"; id: string } | { who: "new"; name: string; email: string };
/** One line of a Repeat as answered. */
export type StartLine = { repeat: string; name?: string; person?: StartPerson; others?: { position: string; person: StartPerson }[] };
/** Everything a person answered. A browser names ids, keys, typed names, addresses and numbers; the server checks all. */
export type StartChoices = {
  lines?: StartLine[];
  who?: { position: string; person: StartPerson }[];
  /** Who provides the numbers no Position submits; empty: nobody for now. */
  providers?: StartPerson[];
  /** Numbers asked at set-up; `line` counts the lines of the Metric's Repeat from 0. */
  numbers?: { metric: string; line?: number; value: number }[];
  source?: "typed" | "system";
  /** The ids of the proposed Shares that are ticked. */
  shares?: string[];
  confirmed?: { assistantTexts?: boolean };
};

const SPAN_LENGTH: Record<Period, number> = { day: 1, week: 7, month: 31, quarter: 92, year: 366 };
const HEADINGS: Record<Period, string> = { day: "Every day", week: "Every week", month: "Every month", quarter: "Every quarter", year: "Every year" };
const ROLE_PLACES: Place[] = ["share", "approve", "told", "tick", "tickStandIn", "snapshot"];

/** Whether holding a Position with these places takes a Workspace Role. */
export const needsRole = (places: Iterable<Place>) => [...places].some((p) => ROLE_PLACES.includes(p));

/** Whether a number asked every `every` fits a Metric of this period: a longer period than the span does not. */
export const askFits = (period: Period, every: PackAskEvery) => SPAN_LENGTH[period] <= SPAN_LENGTH[every];

/** Whether every Slot of a template made for `scope` (a Repeat, or none) is filled by the Pack's own entries. */
function fills(slots: StartSlot[], scope: string | undefined, entries: ReadonlyMap<string, StartMetric>): boolean {
  return slots.every((s) => {
    const m = s.suggests === null ? undefined : entries.get(s.suggests);
    return Boolean(m) && (m!.per === undefined || m!.per === scope || s.multiple);
  });
}

/** Of templates, the first of the Pack and of each Repeat that passes. */
function firstPerScope<T extends { per?: string }>(list: T[], passes: (t: T) => boolean = () => true): T[] {
  const seen = new Set<string | undefined>();
  return list.filter((t) => {
    if (seen.has(t.per) || !passes(t)) return false;
    seen.add(t.per);
    return true;
  });
}

/** What a set-up of this Pack makes: every Metric, the first fillable dashboard and the first Workflow of the Pack and
 * of each Repeat, every Deck whose Slots the Pack's entries fill, and the places each Position then takes. */
export function startSelection(d: StartDeclarations) {
  const entries = new Map(d.metrics.map((m) => [m.key, m]));
  const dashboards = firstPerScope(d.dashboards ?? [], (t) => fills(t.slots, t.per, entries));
  const workflows = firstPerScope(d.workflows ?? []);
  const decks = (d.decks ?? []).filter((t) => t.slots.length > 0 && fills(t.slots, undefined, entries));
  const places = new Map<string, Set<Place>>();
  const use = (keys: string | string[] | undefined, place: Place) => {
    for (const key of keys === undefined ? [] : [keys].flat()) places.set(key, (places.get(key) ?? new Set()).add(place));
  };
  for (const m of d.metrics) { use(m.submitters, "submit"); use(m.standIn, "standIn"); use(m.viewers, "share"); use(m.editors, "share"); }
  for (const t of dashboards) { use(t.viewers, "share"); use(t.editors, "share"); }
  for (const w of workflows) {
    use(w.approveBy, "approve");
    for (const u of w.uses ?? []) use(u.position, u.place);
  }
  return { entries, dashboards, workflows, decks, places };
}

/** The numbers a person provides: those that take values and are not set as a target. */
const provided = (d: StartDeclarations) => d.metrics.filter((m) => m.takesValues && m.comesFrom !== "target");

/** Lines allowed for a Repeat: the lowest of its own most, the room for Metrics and what one set-up makes (after the
 * other Metrics) and, in a trial, the places for people. */
function lineLimit(d: StartDeclarations, repeat: StartRepeat, room: StartRoom): StartLimit {
  const perLine = d.metrics.filter((m) => m.per === repeat.key).length;
  // The others: what is made once, and one line of every other Repeat.
  const others = d.metrics.filter((m) => m.per !== repeat.key).length;
  const share = (most: number) => (perLine ? Math.floor((most - others) / perLine) : LINES_MAX);
  // In this order, so that of two equal limits the one the person can do something about is named.
  const limits: [StartLimit["because"], number][] = [
    ...(room.trial ? [["people", Math.max(1, room.trial.places + room.trial.others)] as [StartLimit["because"], number]] : []),
    ...(room.metrics === null ? [] : [["metrics", share(room.metrics)] as [StartLimit["because"], number]]),
    ["setup", share(START_METRICS_MAX)],
    ["pack", Math.min(repeat.max ?? LINES_MAX, LINES_MAX)],
  ];
  const [because, allowed] = limits.reduce((low, next) => (next[1] < low[1] ? next : low));
  return { allowed: Math.max(0, allowed), because };
}

/** Why the Pack does not fit here at all, even with one line of every Repeat, or null. */
function blockedBy(d: StartDeclarations, room: StartRoom): string | null {
  const least = d.metrics.length;
  if (least > START_METRICS_MAX) return `This Pack makes at least ${least} Metrics, and one set-up makes at most ${START_METRICS_MAX}.`;
  if (room.metrics === null || least <= room.metrics) return null;
  return room.trial
    ? `A trial holds at most ${room.trial.metricCap} Metrics. This Pack makes at least ${least}, and there is room for ${room.metrics}.`
    : `This Pack makes at least ${least} Metrics, and there is room for ${room.metrics}.`;
}

/** The steps of setting this Pack up here, in order, with their questions, defaults and limits. */
export function startSteps(d: StartDeclarations, room: StartRoom): StartStep[] {
  const { entries, dashboards, workflows, decks, places } = startSelection(d);
  const asked = (p: StartPosition): StartAsked => {
    const its = [...(places.get(p.key) ?? [])];
    return { position: p.key, name: p.name, question: p.question || `Who is ${p.name}?`, hint: p.hint || null, needsRole: needsRole(its), places: its };
  };
  const used = (d.positions ?? []).filter((p) => places.has(p.key));
  // The heading follows the rhythm of the first Workflow Template: the one period of the numbers it asks for. One that
  // asks for several periods, such as a quarter close with monthly numbers, has no "Every …" that would be true.
  const first = (d.workflows ?? [])[0];
  const periods = new Set(first ? d.metrics.filter((m) => m.takesValues && (first.per === undefined || m.per === first.per)).map((m) => m.period) : []);
  const [rhythm] = periods.size === 1 ? periods : [];
  const setsUp = Boolean((d.dashboards?.length ?? 0) + (d.decks?.length ?? 0) + (d.workflows?.length ?? 0));
  const board = dashboards.find((t) => t.per === undefined) ?? dashboards[0];
  const preview: StartStep = {
    step: "preview", name: d.name, line: d.setUp?.line || d.summary || "", heading: rhythm ? HEADINGS[rhythm] : "What happens",
    happens: d.setUp?.happens ?? [], needs: d.setUp?.needs ?? [],
    draws: board ? { kind: "dashboard", key: board.key } : decks[0] ? { kind: "deck", key: decks[0].key } : null,
    setsUp, blocked: blockedBy(d, room),
  };
  const lines = (d.repeats ?? []).flatMap((r): StartStep[] => {
    const mine = used.filter((p) => p.per === r.key);
    const made = d.metrics.some((m) => m.per === r.key) || [...dashboards, ...workflows].some((t) => t.per === r.key);
    if (!made) return [];
    const person = mine.find((p) => places.get(p.key)!.has("submit"));
    return [{ step: "lines", repeat: r.key, name: r.name, question: r.question || `List each ${r.name}`, asksName: !person, person: person ? asked(person) : null, others: mine.filter((p) => p !== person).map(asked), limit: lineLimit(d, r, room) }];
  });
  const who = used.filter((p) => p.per === undefined).map((p): StartStep => ({ step: "who", ...asked(p) }));
  const short = (m: StartMetric) => ({ key: m.key, name: m.name });
  const numbers = provided(d);
  const fromSystem = numbers.filter((m) => m.comesFrom === "system");
  // Where every number comes from a system, nobody is picked and the system is preselected.
  const allSystem = numbers.length > 0 && fromSystem.length === numbers.length;
  const unplaced = numbers.filter((m) => !m.submitters?.length);
  const asks = d.metrics.flatMap((m) => {
    if (!m.ask || !m.takesValues || !askFits(m.period, m.ask.every)) return [];
    const total = d.metrics.find((x) => x.total?.of === m.key && x.total.targets === "parts");
    return [{ metric: m.key, name: m.name, question: m.ask.question, field: m.ask.name, every: m.ask.every, repeat: m.per ?? null, total: total && entries.has(total.key) ? total.name : null }];
  });
  const templates = [...new Set((d.feeds ?? []).filter((f) => f.fills.some((k) => fromSystem.some((m) => m.key === k))).map((f) => f.template))];
  return [
    preview,
    ...lines,
    ...who,
    ...(unplaced.length ? [{ step: "providers" as const, metrics: unplaced.map(short), preselected: allSystem ? ("nobody" as const) : ("me" as const), max: START_PROVIDERS_MAX }] : []),
    ...(asks.length ? [{ step: "numbers" as const, asks }] : []),
    ...(fromSystem.length ? [{ step: "source" as const, metrics: fromSystem.map(short), preselected: allSystem ? ("system" as const) : ("typed" as const), templates }] : []),
    { step: "check" },
  ];
}

/** The answers the screens start with: what each step preselects. Lines are left for the person to add. */
export function defaultChoices(steps: StartStep[]): StartChoices {
  const choices: StartChoices = {};
  for (const s of steps) {
    if (s.step === "who") (choices.who ??= []).push({ position: s.position, person: { who: "me" } });
    if (s.step === "providers") choices.providers = s.preselected === "me" ? [{ who: "me" }] : [];
    if (s.step === "source") choices.source = s.preselected;
  }
  return choices;
}
