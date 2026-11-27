// What the answers of a guided Pack set-up would make (spec 0068; GLOSSARY: Pack, Position, Repeat, Contact,
// Submitter, Approver, Share, Invitation, Trial Workspace): who holds what, who is added, what is made, who is asked,
// which Shares are offered and what is wrong or left out. Pure and safe for the browser, so the check screen and
// "Try it" show it, and the server (pack-start.ts) makes exactly it.
// Security: it decides nothing about rights. Who may fill a Position is today's rule (pack-setup-who.ts); someone new
// never holds a place that takes a Workspace Role (the person setting up holds it until they joined), no invitation is
// made here and nothing is sent. The server resolves typed addresses to people of this Workspace only and checks
// every id again.
import { PLAIN, textPasses } from "@ziffr/pack/file-text";
import type { PackAskEvery } from "@ziffr/pack/set-up";
import { askFits, needsRole, START_PROVIDERS_MAX, startSelection, startSteps, type StartChoices, type StartDeclarations, type StartMetric, type StartPerson, type StartRoom, type StartSlot, type StartStep, type StartWorkflow } from "./pack-start-steps";
import { periodEnd, periodStart, shiftPeriod, type YearStart } from "./periods";
import { whyNot, type PersonKind, type Place } from "./pack-setup-who";
import type { Period, ShareRole } from "./types";

/** Someone already in the Workspace who may be picked. */
export type StartPickable = { id: string; name: string; kind: PersonKind };
/** Who is here, as the plan reads it. `byEmail` (lower case address to id) is the server's, for typed addresses. */
export type StartContext = { me: { id: string; name: string }; people: StartPickable[]; byEmail?: ReadonlyMap<string, string> };

/** A person the plan puts somewhere. `ref` names them within the plan; `id` is null for someone not here yet. */
export type PlanPerson = { ref: string; id: string | null; name: string; kind: PersonKind | "me" | "new"; /** The address typed for them, if one was. */ email: string | null };
/** Who fills a Position: the references of the people. */
export type PlanFill = { position: string; people: string[] };
/** A Position held for someone who cannot hold it yet: the person setting up holds it until they have joined. */
export type PlanHeld = { position: string; name: string; line: string | null; for: string; places: Place[] };

/** What the answers would make. */
export type StartPlan = {
  /** Why it cannot be set up as answered; empty when it can. */
  problems: string[];
  /** Everyone the plan names, the person setting up included. */
  people: PlanPerson[];
  /** Those who are not here yet and are added as Contacts, by reference. */
  contacts: string[];
  /** Who fills each Position outside a Repeat. */
  fills: PlanFill[];
  lines: { repeat: string; name: string; fills: PlanFill[] }[];
  held: PlanHeld[];
  /** Who provides the numbers no Position submits. */
  providers: string[];
  metrics: { key: string; name: string; line: string | null; submitters: string[]; /** The Workflow that will ask: the Pack's, one by period, or none. */ workflow: "pack" | "period" | null }[];
  dashboards: { key: string; name: string; line: string | null }[];
  workflows: { key: string; name: string; line: string | null; approvers: string[] }[];
  decks: { key: string; name: string }[];
  /** What the Pack brings and this set-up does not make, and why. */
  leftOut: { name: string; why: string }[];
  /** Who is asked for values from the Workflow's next run, and for which Metrics. */
  asked: { person: string; metrics: string[] }[];
  /** Whom the done screen offers to invite, by their own button: nothing is sent before that. */
  invite: { person: string; role: "member" | "guest" }[];
  /** Every Share the Pack proposes between people who can be shared with now. None is made unless ticked. */
  shares: { id: string; person: string; role: ShareRole; kind: "Metric" | "dashboard"; item: string; showsMore: boolean; suggested: boolean }[];
  /** The numbers to write as targets; `line` is the line's name. */
  targets: { metric: string; line: string | null; value: number }[];
  notes: string[];
};

const NAME_MAX = 80;
const LINE_NAME_MAX = 60;
const METRIC_NAME_MAX = 120;
const NUMBER_MAX = 1e15;
const ME = "me";

/** An address as it is compared. */
export const asAddress = (email: string) => email.trim().toLowerCase();
const sameName = (name: string) => name.normalize("NFKC").toLowerCase();

/** The most periods one number asked is written to: a year of days. */
const PERIODS_MAX = 400;

/** The periods of a Metric that a number asked every `every` is the target of, on the Workspace's day `today`: every
 * period with a day in the running span, from the last ended one where that is earlier. `own` is the year start of the
 * Metric's period, `span` that of the span asked. */
export function targetPeriods(today: string, period: Period, every: PackAskEvery, own: YearStart, span: YearStart): string[] {
  const from = periodStart(today, every, span);
  const first = periodStart(from, period, own);
  const ended = shiftPeriod(periodStart(today, period, own), period, -1);
  const last = periodEnd(from, every);
  const out: string[] = [];
  for (let start = ended < first ? ended : first; start <= last && out.length < PERIODS_MAX; start = shiftPeriod(start, period, 1)) out.push(start);
  return out;
}

/** A person's name as it may stand in a Metric's name: what plain text does not hold goes. */
function asLineName(name: string): string {
  const kept = [...name].filter((c) => textPasses(PLAIN, c)).join("").replace(/\s+/g, " ").trim();
  const short = [...kept].slice(0, LINE_NAME_MAX).join("").trim();
  return textPasses(PLAIN, short) ? short : "";
}

type Planning = {
  d: StartDeclarations; room: StartRoom; ctx: StartContext;
  people: Map<string, PlanPerson>;
  plan: StartPlan;
};

/** The person of an answer, added to the plan; null, with a problem said, when it names nobody who can be picked. */
function personOf(p: Planning, choice: StartPerson | undefined): PlanPerson | null {
  const keep = (person: PlanPerson) => {
    const was = p.people.get(person.ref);
    if (was) return was.email === null && person.email !== null ? Object.assign(was, { email: person.email }) : was;
    p.people.set(person.ref, person);
    return person;
  };
  const me = () => keep({ ref: ME, id: p.ctx.me.id, name: p.ctx.me.name, kind: "me", email: null });
  const here = (id: string, email: string | null) => {
    if (id === p.ctx.me.id) return me();
    const found = p.ctx.people.find((x) => x.id === id);
    return found ? keep({ ref: found.id, id: found.id, name: found.name, kind: found.kind, email }) : null;
  };
  const problem = (words: string) => { p.plan.problems.push(words); return null; };
  if (choice?.who === "me") return me();
  if (choice?.who === "here") return here(String(choice.id), null) ?? problem("Pick someone who is in this Workspace.");
  if (choice?.who !== "new") return problem("Say who it is.");
  const email = asAddress(String(choice.email ?? ""));
  const name = String(choice.name ?? "").replace(/\s+/g, " ").trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return problem(`That email address does not look right${name ? ` for ${[...name].slice(0, NAME_MAX).join("")}` : ""}.`);
  // A person is found by email first: someone who is here is used as they are.
  const id = p.ctx.byEmail?.get(email);
  if (id !== undefined) return here(id, email) ?? problem("Pick someone who is in this Workspace.");
  const typed = p.people.get(`new:${email}`);
  if (typed) return typed;
  if (!name) return problem(`Give ${email} a name.`);
  if ([...name].length > NAME_MAX) return problem(`Keep a name to ${NAME_MAX} characters.`);
  if (p.room.practice) return problem("A Practice Workspace takes no new people: pick someone who is in it.");
  return keep({ ref: `new:${email}`, id: null, name, kind: "new", email });
}

function addContact(p: Planning, person: PlanPerson) {
  if (person.kind === "new" && !p.plan.contacts.includes(person.ref)) p.plan.contacts.push(person.ref);
}

/** Offers an invitation, which only its own button sends. A role wins over Guest. */
function offerInvite(p: Planning, ref: string, role: "member" | "guest") {
  const was = p.plan.invite.find((x) => x.person === ref);
  if (!was) p.plan.invite.push({ person: ref, role });
  else if (role === "member") was.role = role;
}

/** Someone who only provides numbers: added if new; in a trial a Contact is sent nothing, so an invitation is offered. */
function provider(p: Planning, person: PlanPerson) {
  addContact(p, person);
  if (p.room.trial && (person.kind === "new" || person.kind === "contact")) offerInvite(p, person.ref, "guest");
}

type Asked = Extract<StartStep, { step: "who" }> | NonNullable<Extract<StartStep, { step: "lines" }>["person"]>;

/** Who holds a Position for an answer: the person, or, for someone new whose Position takes a Workspace Role, the
 * person setting up until they have joined. */
function holderOf(p: Planning, position: Asked, choice: StartPerson | undefined, line: string | null): { meant: PlanPerson; holder: PlanPerson } | null {
  const meant = personOf(p, choice);
  if (!meant) return null;
  const places = new Set(position.places);
  // Someone typed who cannot hold it yet: new, or a Contact found by the address, such as one added a moment ago.
  if (choice?.who === "new" && (meant.kind === "new" || meant.kind === "contact") && needsRole(places)) {
    addContact(p, meant);
    offerInvite(p, meant.ref, "member");
    p.plan.held.push({ position: position.position, name: position.name, line, for: meant.ref, places: position.places });
    p.plan.notes.push(places.has("approve") ? `You approve until ${meant.name} has joined.` : `You are ${position.name} until ${meant.name} has joined.`);
    return { meant, holder: personOf(p, { who: "me" })! };
  }
  const refused = meant.kind === "me" || meant.kind === "new" ? null : whyNot(meant.kind, places);
  if (refused) {
    p.plan.problems.push(`${meant.name} cannot be ${position.name}. ${refused}`);
    return null;
  }
  if (places.has("submit") || places.has("standIn")) provider(p, meant);
  else addContact(p, meant);
  return { meant, holder: meant };
}

type LinesStep = Extract<StartStep, { step: "lines" }>;

/** The lines of one Repeat, each with a name of its own and its people. */
function plannedLines(p: Planning, step: LinesStep, answers: NonNullable<StartChoices["lines"]>) {
  const mine = answers.filter((l) => l.repeat === step.repeat);
  if (!mine.length) p.plan.problems.push(`${step.question} Add at least one.`);
  if (mine.length > step.limit.allowed) p.plan.problems.push(`There is room for ${step.limit.allowed} of ${step.name} here; ${mine.length} are listed.`);
  const names: string[] = [];
  const persons = new Set<string>();
  // Typed names are kept as typed; a name taken from the person gives way to them.
  const typed = new Set(mine.flatMap((l) => (l.name?.trim() ? [sameName(l.name.replace(/\s+/g, " ").trim())] : [])));
  for (const answer of mine.slice(0, step.limit.allowed)) {
    const lineFills: PlanFill[] = [];
    const held = p.plan.held.length;
    let name = String(answer.name ?? "").replace(/\s+/g, " ").trim();
    const person = step.person ? holderOf(p, step.person, answer.person, null) : null;
    if (step.person && !person) continue;
    if (person) {
      if (persons.has(person.meant.ref)) p.plan.problems.push(`Two lines of ${step.name} are for ${person.meant.name}: each line is another person.`);
      persons.add(person.meant.ref);
      lineFills.push({ position: step.person!.position, people: [person.holder.ref] });
      if (!name) {
        const base = asLineName(person.meant.name);
        name = base;
        for (let n = 2; base && (typed.has(sameName(name)) || names.includes(sameName(name))); n++) name = `${[...base].slice(0, LINE_NAME_MAX - 4).join("")} ${n}`;
      }
    }
    if (!name) { p.plan.problems.push(`Name each line of ${step.name}.`); continue; }
    if ([...name].length > LINE_NAME_MAX || !textPasses(PLAIN, name)) p.plan.problems.push(`A line of ${step.name} has a name of at most ${LINE_NAME_MAX} characters of plain text: no web or email address, markup or brackets.`);
    if (names.includes(sameName(name))) p.plan.problems.push(`Two lines of ${step.name} are called “${name}”: give each its own name.`);
    names.push(sameName(name));
    for (const other of step.others) {
      const choice = answer.others?.find((o) => o.position === other.position)?.person;
      const got = holderOf(p, other, choice, name);
      if (got) lineFills.push({ position: other.position, people: [got.holder.ref] });
    }
    for (const h of p.plan.held.slice(held)) h.line = name;
    p.plan.lines.push({ repeat: step.repeat, name, fills: lineFills });
  }
}

type Line = StartPlan["lines"][number];

/** The people of a Position as an item sees it: its own line's, or, from outside the Repeat, every line's. */
function holders(p: Planning, keys: string[] | string | undefined, line: Line | null): string[] {
  return [...new Set((keys === undefined ? [] : [keys].flat()).flatMap((key) => {
    const per = p.d.positions?.find((x) => x.key === key)?.per;
    const from = per === undefined ? [p.plan.fills] : (line?.repeat === per ? [line] : p.plan.lines.filter((l) => l.repeat === per)).map((l) => l.fills);
    return from.flatMap((f) => f.find((x) => x.position === key)?.people ?? []);
  }))];
}
const linesOf = (p: Planning, per: string | undefined): (Line | null)[] => (per === undefined ? [null] : p.plan.lines.filter((l) => l.repeat === per));
const withLine = (name: string, line: Line | null) => (line ? `${name}, ${line.name}` : name);

/** A Workflow with the Approvers the answers give, once for the Pack or for each line of its Repeat, or why it is left
 * out (for one line, then for all: a template is picked as a whole). */
function plannedWorkflow(p: Planning, w: StartWorkflow) {
  const made: StartPlan["workflows"] = [];
  for (const line of linesOf(p, w.per)) {
    const name = withLine(w.name, line);
    // Without Positions that approve, the person setting up approves; more than one Approver they cannot be.
    const approvers = w.approveBy?.length ? w.approveBy.flatMap((k) => holders(p, k, line).slice(0, 1)) : w.approvers === 0 ? [] : [personOf(p, { who: "me" })!.ref];
    const why = approvers.length !== w.approvers ? `It needs ${w.approvers === 1 ? "an Approver" : `${w.approvers} Approvers`}, and the answers give ${approvers.length}.`
      : new Set(approvers).size !== approvers.length ? "Its Approvers must be different people." : null;
    if (why) return void p.plan.leftOut.push({ name: `the Workflow ${name}`, why });
    made.push({ key: w.key, name, line: line?.name ?? null, approvers });
  }
  p.plan.workflows.push(...made);
}

type PlannedOne = StartPlan["metrics"][number] & { entry: StartMetric };

/** Every Metric as it would be made: outside every Repeat, then line by line. */
function plannedMetrics(p: Planning): PlannedOne[] {
  const out: PlannedOne[] = [];
  for (const line of [null, ...p.plan.lines]) {
    for (const m of p.d.metrics.filter((x) => x.per === line?.repeat)) {
      const name = withLine(m.name, line);
      if ([...name].length > METRIC_NAME_MAX) p.plan.problems.push(`“${name}” is longer than a Metric's name may be, ${METRIC_NAME_MAX} characters: shorten the line's name.`);
      // A number set as a target is asked of nobody.
      const submitters = !m.takesValues || m.comesFrom === "target" ? [] : m.submitters?.length ? holders(p, m.submitters, line) : p.plan.providers;
      const pack = p.plan.workflows.some((w) => (line && w.line === line.name && p.d.workflows?.find((x) => x.key === w.key)?.per === line.repeat) || w.line === null);
      out.push({ key: m.key, name, line: line?.name ?? null, submitters, workflow: !submitters.length ? null : pack ? "pack" : "period", entry: m });
    }
  }
  return out;
}

/** The Metrics a template's Slots would show. */
function shown(metrics: PlannedOne[], slots: StartSlot[], line: Line | null): PlannedOne[] {
  return slots.flatMap((s) => metrics.filter((m) => m.key === s.suggests && (m.entry.per === undefined || m.line === line?.name || (line === null && s.multiple))));
}

/** The Shares the Pack proposes among what is made, as Set up proposes them: never with the person setting up or a
 * Contact. Editor wins over Viewer. */
function plannedShares(p: Planning, metrics: PlannedOne[]) {
  const found = new Map<string, StartPlan["shares"][number]>();
  const propose = (kind: "metric" | "dashboard", key: string, line: Line | null, item: string, on: PlannedOne[], viewers?: string[], editors?: string[]) => {
    for (const [role, keys] of [["editor", editors], ["viewer", viewers]] as const) {
      for (const ref of holders(p, keys, line)) {
        const person = p.people.get(ref)!;
        const one = `${kind} ${key} ${line?.name ?? ""} ${ref}`;
        if (person.kind === "me" || person.kind === "contact" || person.kind === "new" || found.has(one)) continue;
        const showsMore = on.some((m) => !m.submitters.includes(ref));
        found.set(one, { id: JSON.stringify([kind, key, line?.name ?? "", person.id, role]), person: ref, role, kind: kind === "metric" ? "Metric" : "dashboard", item, showsMore, suggested: role === "viewer" && !showsMore });
      }
    }
  };
  for (const m of metrics) {
    const line = p.plan.lines.find((l) => l.name === m.line && l.repeat === m.entry.per) ?? null;
    propose("metric", m.key, line, m.name, [m], m.entry.viewers, m.entry.editors);
  }
  for (const made of p.plan.dashboards) {
    const t = p.d.dashboards!.find((x) => x.key === made.key)!;
    const line = p.plan.lines.find((l) => l.name === made.line && l.repeat === t.per) ?? null;
    propose("dashboard", t.key, line, made.name, shown(metrics, t.slots, line), t.viewers, t.editors);
  }
  p.plan.shares = [...found.values()];
}

/** The numbers asked at set-up, checked against what the Pack asks. */
function plannedTargets(p: Planning, answers: NonNullable<StartChoices["numbers"]>) {
  const seen = new Set<string>();
  for (const n of answers) {
    const m = p.d.metrics.find((x) => x.key === n.metric);
    const lines = m?.per === undefined ? null : p.plan.lines.filter((l) => l.repeat === m.per);
    const line = lines && Number.isInteger(n.line) ? lines[n.line!] : undefined;
    const one = `${n.metric} ${n.line ?? ""}`;
    if (!m?.ask || !m.takesValues || !askFits(m.period, m.ask.every) || (lines ? !line : n.line !== undefined) || seen.has(one)) { p.plan.problems.push("A number was answered that this Pack does not ask."); continue; }
    seen.add(one);
    if (typeof n.value !== "number" || !Number.isFinite(n.value) || Math.abs(n.value) > NUMBER_MAX) { p.plan.problems.push(`Enter a number for ${withLine(m.name, line ?? null)}.`); continue; }
    p.plan.targets.push({ metric: m.key, line: line?.name ?? null, value: n.value });
  }
}

/** The people who answered "Who provides these numbers?", each once. */
function plannedProviders(p: Planning, choices: StartPerson[]) {
  for (const choice of choices) {
    const person = personOf(p, choice);
    if (!person || p.plan.providers.includes(person.ref)) continue;
    p.plan.providers.push(person.ref);
    provider(p, person);
  }
  if (p.plan.providers.filter((x) => x !== ME).length > START_PROVIDERS_MAX) p.plan.problems.push(`Pick at most ${START_PROVIDERS_MAX} other people; add more on each Metric's page.`);
}

const emptyPlan = (): StartPlan => ({ problems: [], people: [], contacts: [], fills: [], lines: [], held: [], providers: [], metrics: [], dashboards: [], workflows: [], decks: [], leftOut: [], asked: [], invite: [], shares: [], targets: [], notes: [] });

/** Who the people named as providers after a set-up are, checked as a set-up checks them: whom to add as a Contact and
 * what is wrong. */
export function planProviders(room: StartRoom, ctx: StartContext, choices: StartPerson[]): Pick<StartPlan, "problems" | "people" | "contacts" | "providers" | "invite"> {
  const plan = emptyPlan();
  const p: Planning = { d: { name: "", metrics: [] }, room, ctx, people: new Map(), plan };
  personOf(p, { who: "me" });
  plannedProviders(p, choices);
  if (!plan.providers.length && !plan.problems.length) plan.problems.push("Say who provides these numbers.");
  return { problems: [...new Set(plan.problems)], people: [...p.people.values()], contacts: plan.contacts, providers: plan.providers, invite: plan.invite };
}

/** What the answers would make of this Pack here. */
export function planStart(d: StartDeclarations, room: StartRoom, choices: StartChoices, ctx: StartContext): StartPlan {
  const plan = emptyPlan();
  const p: Planning = { d, room, ctx, people: new Map(), plan };
  const steps = startSteps(d, room);
  const selection = startSelection(d);
  personOf(p, { who: "me" });
  for (const s of steps) {
    if (s.step === "preview") {
      if (s.blocked) plan.problems.push(s.blocked);
      if (!s.setsUp) plan.problems.push("This Pack has nothing to set up: add it to your Workspace instead.");
    }
    if (s.step === "lines") plannedLines(p, s, choices.lines ?? []);
    if (s.step === "who") {
      const got = holderOf(p, s, choices.who?.find((w) => w.position === s.position)?.person, null);
      if (got) plan.fills.push({ position: s.position, people: [got.holder.ref] });
    }
    if (s.step === "providers") {
      if (!choices.providers) plan.problems.push("Say who provides these numbers.");
      plannedProviders(p, choices.providers ?? []);
    }
  }
  if ((choices.lines ?? []).some((l) => !steps.some((s) => s.step === "lines" && s.repeat === l.repeat))) plan.problems.push("Add lines to the Repeats of this Pack.");

  for (const w of selection.workflows) plannedWorkflow(p, w);
  const metrics = plannedMetrics(p);
  plan.metrics = metrics.map(({ entry: _entry, ...m }) => m); // eslint-disable-line @typescript-eslint/no-unused-vars
  plan.dashboards = selection.dashboards.flatMap((t) => linesOf(p, t.per).map((line) => ({ key: t.key, name: withLine(t.name, line), line: line?.name ?? null })));
  for (const per of new Set((d.dashboards ?? []).map((t) => t.per))) {
    if (!selection.dashboards.some((t) => t.per === per)) plan.leftOut.push(...(d.dashboards ?? []).filter((t) => t.per === per).map((t) => ({ name: `the dashboard ${t.name}`, why: "Its Slots take Metrics this set-up does not make." })));
  }
  plan.decks = selection.decks.map((t) => ({ key: t.key, name: t.name }));
  plan.asked = [...p.people.keys()].flatMap((ref) => {
    const mine = metrics.filter((m) => m.submitters.includes(ref)).map((m) => m.name);
    return mine.length ? [{ person: ref, metrics: mine }] : [];
  });
  plannedShares(p, metrics);
  plannedTargets(p, choices.numbers ?? []);
  if (room.trial && plan.invite.length > room.trial.places) plan.notes.push(`Your trial has ${room.trial.places === 1 ? "1 place" : `${room.trial.places} places`} for people: ${room.trial.places} of these ${plan.invite.length} can be invited.`);
  plan.people = [...p.people.values()];
  plan.problems = [...new Set(plan.problems)];
  plan.notes = [...new Set(plan.notes)];
  return plan;
}
