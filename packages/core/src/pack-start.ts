// The guided Pack set-up through the core (spec 0068; GLOSSARY: Pack, Position, Repeat, Contact, Submitter, Approver,
// Target Series, Deck Template, Workflow, Trial Workspace, Practice Workspace): what starting a Pack offers, and setting
// it up from the answers in steps: check everything, install, add the Contacts that are missing, set up as any Set up,
// join Metrics without a Pack Workflow to one for their period, write the numbers asked as targets, make the decks.
// Security: only Owners and Admins, never through a key, never in the demo, only in their Workspace. A browser names
// ids, keys, typed names, addresses and numbers: their shape and size are checked here, an address is looked up among
// the people of this Workspace only, and pack-start-plan.ts and the Set up check every id again. Everything is made
// through the operation a person uses by hand (addContact, setUpStep, saveSeriesRows, createFilledDeck,
// joinPeriodWorkflows), so rights, limits and the Audit Log apply. No invitation is made, no first request is sent
// (askNow is never set) and nothing is shared unless ticked: whoever was named is asked by their Workflow's next run.
// What comes back names only what this Owner or Admin may see: the Pack's words, the people of the Workspace by name,
// and what they just made.
import { db } from "./db";
import { Forbidden, Refused, type Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { nextAskingRun } from "./asking-schedule";
import { createFilledDeck } from "./deck-templates";
import { feedTemplates, type FeedTemplateInfo } from "./feed-template-download";
import { yearStartFor } from "./fiscal-year";
import { bundledPacks, installIncludedPack, readIncludedPack } from "./included-packs";
import { ownerHasOwnValue } from "./invite-gate";
import { mailOn } from "./mail";
import { saveSeriesRows } from "./metrics";
import type { Pack } from "./pack";
import { installManifest, itemHash, storedItems } from "./packs";
import { listed } from "./pack-places";
import { setUpStep, wordsForPeople, type GuidedStep, type SetupRun } from "./pack-setup";
import { setupPeople, unsubscribedNote, type Blueprint, type PackSetupInput, type PlannedMetric, type SetupPerson } from "./pack-setup-build";
import { assertSetsUp, installedForSetup, roomFor, roomNow, type EntryRow, type TemplateRow } from "./pack-setup-install";
import { claimGuidedRecord, dropIdleGuided, heldKey, setupStates, stillMade, type GuidedRecord, type MadeThing, type SetupState } from "./pack-setup-record";
import { entryTotal, isComputed } from "./pack-setup-totals";
import type { PackSampleEntry } from "./pack-sample";
import { declarationsFrom, type DeclaredEntry, type DeclaredTemplate } from "./pack-start-declarations";
import { asAddress, planStart, targetPeriods, type StartContext, type StartPickable, type StartPlan } from "./pack-start-plan";
import { START_METRICS_MAX, startSelection, startSteps, type StartChoices, type StartDeclarations, type StartPerson, type StartRoom } from "./pack-start-steps";
import { joinPeriodWorkflows } from "./period-workflows";
import { isPracticeWorkspace, verifiedSignInAddress } from "./practice";
import { sendingLimit } from "./sending-limit";
import { addContact, DEMO_WORKSPACE_ID } from "./team";
import { peopleIn } from "./submissions";
import { trialLimitsInEffect } from "./trial-limits-in-effect";
import { trialEndsAt } from "./trials";
import type { DashboardTemplateBody, DeckTemplateBody, Period, SlideBody, Slot, WorkflowConfig } from "./types";
import { assertWidgetDesigns } from "./widget-designs";
import { openWorkflowRows } from "./workflow-rows";
import { workflowSchedule } from "./workflows";
import { getMetrics } from "./workspace-data";
import { localTime, workspaceClock } from "./workspace-clock";

/** Which Pack to start: one of Ziffr's own by its id, or one the Workspace has installed by the install's number. */
export type PackStartRef = { included: string } | { install: number };

/** What starting a Pack offers. `startSteps(declarations, room)` makes its screens; `checkStart` its check screen. */
export type PackStartOptions = {
  pack: { id: string; name: string; version: string; installId: number | null };
  declarations: StartDeclarations;
  room: StartRoom;
  me: { id: string; name: string };
  /** Everyone else already here who may be picked: names and what they are, no addresses. */
  people: StartPickable[];
  /** The texts aimed at assistants to be confirmed before a Pack of Ziffr's own is installed. */
  assistantTexts: { path: string; text: string }[];
  /** The Workspace's day, and when its daily run asks next. */
  clock: { today: string; hour: number; timeZone: string; runHour: number; todayRan: boolean };
  /** A set-up of this person's that stopped half way: what it made, which is kept. */
  unfinished: { made: string[] } | null;
  /** Why it cannot be set up here, in words, or null. */
  blocked: string | null;
};

/** What a finished set-up made, who is asked from when, and what is left to do. */
export type PackStartResult = {
  pack: { installId: number; name: string };
  metrics: { id: number; slug: string; name: string; key: string; line: string | null; takesValues: boolean }[];
  dashboards: { id: number; name: string }[];
  decks: { id: number; name: string }[];
  workflows: { id: number; name: string }[];
  /** Who submits what was made, and the day of the next run that asks them; null where nothing asks by itself. */
  asked: { id: string; name: string; you: boolean; metrics: string[]; from: string | null }[];
  /** The numbers that take values and nobody submits yet. */
  unasked: { id: number; slug: string; name: string }[];
  /** The Positions the person setting up holds until someone has joined. */
  held: { position: string; name: string; line: string | null; for: { id: string; name: string }; approves: boolean }[];
  /** Whom to offer an invitation, by its own button. None was sent. */
  invite: { id: string; name: string; role: "member" | "guest" }[];
  leftOut: { name: string; why: string }[];
  notes: string[];
  /** How many numbers asked at set-up are written as targets. */
  targets: number;
  /** Where the numbers of a system come from for now, and the templates for them when the system was chosen. */
  source: "typed" | "system" | null;
  templates: FeedTemplateInfo[];
  /** A trial whose Owner has no value of their own yet, so nobody can be invited. */
  needsFirstValue: boolean;
  /** Whether email is set up; without it requests wait in the Outbox. */
  mail: boolean;
};

/** What one call of the set-up did: all of it, or how far it is. Send `run` back with the same choices. */
export type PackStartStep = { done: false; run: SetupRun; made: number; of: number } | { done: true; result: PackStartResult };

const AGAIN = "Answer the questions again.";
const SET_UP = "This Pack is set up here already. Open the Packs page to see it or add to it.";
const GONE = "This set-up cannot go on from here. Press Try again.";

// ---- The Pack ----

type Source = { installId: number | null; included: string | null; pack: { id: string; name: string; version: string }; declarations: StartDeclarations; entries: DrawnEntry[]; templates: DeclaredTemplate[]; assistantTexts: { path: string; text: string }[]; blocked: string | null };
/** A Metric Catalog entry with what Sample Data reads of it. */
type DrawnEntry = DeclaredEntry & Pick<EntryRow, "aggregation" | "unit" | "unit_position" | "format" | "decimals" | "polarity" | "target_min" | "target_max">;

/** An install of the actor's Workspace as a set-up reads it (Owners and Admins; Forbidden for anyone else's). */
export async function installedSource(actor: Actor, installId: number): Promise<Source> {
  const p = await installedForSetup(actor, installId);
  const ws = actor.workspaceId;
  const [{ data: row, error }, { data: decks, error: unread }] = await Promise.all([
    db().from("pack_installs").select("pack_id, manifest").eq("id", p.install.id).eq("workspace_id", ws).single(),
    db().from("team_templates").select("id, kind, pack_key, name, slots, body").eq("workspace_id", ws).eq("pack_install_id", p.install.id).eq("kind", "deck").order("id"),
  ]);
  if (error || unread) throw new Error("The Pack could not be read.");
  const templates = [...p.dashboards.values(), ...(decks as TemplateRow[] as DeclaredTemplate[]), ...p.workflows.values()] as DeclaredTemplate[];
  const entries = [...p.entries.values()];
  return {
    installId: p.install.id, included: null, pack: { id: String(row.pack_id), name: p.install.name, version: p.install.version },
    declarations: declarationsFrom(row.manifest, entries, templates), entries, templates, assistantTexts: [], blocked: null,
  };
}

/** One of Ziffr's own Packs: its install when the Workspace has it, else what installing it would keep. */
async function includedSource(actor: Actor, packId: string): Promise<Source> {
  // Refuses an id that is none of Ziffr's own, before anything else.
  const read = await readIncludedPack(actor, packId);
  const bundled = bundledPacks().get(packId);
  if (!read.ok || !bundled) throw new Forbidden("Ziffr has no such Pack of its own.");
  const { pack } = bundled;
  const { data: has, error } = await db().from("pack_installs").select("id, source").eq("workspace_id", actor.workspaceId).eq("pack_id", pack.id).maybeSingle();
  if (error) throw new Error("The Pack could not be read.");
  if (has) {
    const source = await installedSource(actor, Number(has.id));
    const other = has.source !== "included" ? "This Workspace has this Pack from another source: open it on the Packs page." : null;
    return { ...source, included: packId, blocked: other };
  }
  return { installId: null, included: packId, ...startFromPack(pack), assistantTexts: read.preview.assistantTexts, blocked: read.preview.blocked };
}

/** What the set-up reads of a checked Pack that is not installed: what installing it would keep. Nothing is written. */
export function startFromPack(pack: Pack): Pick<Source, "pack" | "declarations" | "entries" | "templates"> {
  const stored = storedItems(pack);
  const entries = stored.catalog.map((e): DrawnEntry => ({ ...(e as unknown as DrawnEntry), pack_key: e.key, total: "total" in e ? e.total : null }));
  const templates = stored.templates.map((t) => ({ kind: t.kind, pack_key: t.key, name: t.name, slots: t.slots, body: t.body }) as DeclaredTemplate);
  return { pack: { id: pack.id, name: pack.name, version: pack.version }, declarations: declarationsFrom(installManifest(pack, stored), entries, templates), entries, templates };
}

function sourceOf(actor: Actor, ref: PackStartRef): Promise<Source> {
  const r = (ref ?? {}) as { included?: unknown; install?: unknown };
  if (typeof r.included === "string") return includedSource(actor, r.included);
  if (typeof r.install === "number") return installedSource(actor, r.install);
  throw new Forbidden();
}

// ---- The Workspace ----

/** Where an install's Set ups stand: the guided one still open, the finished one, and why no new one may start. */
async function standing(actor: Actor, installId: number | null): Promise<{ open: SetupState | null; done: SetupState | null; blocked: string | null }> {
  if (installId === null) return { open: null, done: null, blocked: null };
  const states = await setupStates(actor, installId);
  const open = states.find((s) => s.guided && !s.finished) ?? null;
  const done = states.find((s) => s.guided && s.finished) ?? null;
  if (states.some((s) => s !== open && (s.finished || s.made > 0))) return { open: null, done, blocked: SET_UP };
  if (open && open.by !== actor.personId) {
    if (open.made > 0) return { open: null, done: null, blocked: "Someone else started setting this Pack up here. They can finish it." };
    // One that made nothing holds nobody up.
    await dropIdleGuided(actor, open.id);
    return { open: null, done: null, blocked: null };
  }
  return { open, done: null, blocked: null };
}

/** The room for a set-up; `made` Metrics of an unfinished one are there already and count as its own. */
export async function roomOf(actor: Actor, made: number): Promise<StartRoom> {
  const ws = actor.workspaceId;
  const [room, ends, practice] = await Promise.all([roomNow(actor, START_METRICS_MAX), trialEndsAt(ws), isPracticeWorkspace(ws)]);
  const metrics = room ? room.allowed + made : null;
  if (!ends) return { metrics, trial: null, practice };
  const [limits, { data: taken, error }, { count, error: unread }] = await Promise.all([
    trialLimitsInEffect(), db().rpc("trial_people", { p_workspace: ws }), db().from("memberships").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws),
  ]);
  if (error || unread) throw new Error("The trial's places could not be counted.");
  return { metrics, practice, trial: { metricCap: limits.metrics, places: Math.max(0, limits.people - Number(taken)), others: Math.max(0, (count ?? 0) - 1) } };
}

/** Why nothing can be added here: a trial that has ended. */
export async function ended(actor: Actor): Promise<string | null> {
  const ends = await trialEndsAt(actor.workspaceId);
  return ends && ends.getTime() <= Date.now() ? "This trial has ended: nothing can be added." : null;
}

const pickable = (p: SetupPerson): StartPickable => ({ id: p.id, name: p.name, kind: p.kind });
const typed = (choices: StartChoices): StartPerson[] => [
  ...(choices.who ?? []).map((w) => w.person), ...(choices.providers ?? []),
  ...(choices.lines ?? []).flatMap((l) => [...(l.person ? [l.person] : []), ...(l.others ?? []).map((o) => o.person)]),
];

/** Who is here, and which of the typed addresses belong to them. The person setting up comes first, then Members and
 * Guests before Contacts. Addresses stay on the server. The caller has checked who asks. */
export async function contextOf(actor: Actor, choices: StartChoices): Promise<StartContext> {
  const people = await setupPeople(actor);
  const me = people.get(actor.personId);
  if (!me) throw new Forbidden();
  const wanted = new Set(typed(choices).flatMap((p) => (p.who === "new" ? [asAddress(p.email)] : [])));
  const byEmail = new Map<string, string>();
  if (wanted.size) {
    const rank = (id: string) => (id === actor.personId ? 0 : people.get(id)?.kind === "contact" ? 2 : 1);
    const detailed = (await peopleIn(actor.workspaceId, { contactDetails: true })).sort((a, b) => rank(a.id) - rank(b.id));
    const own = await verifiedSignInAddress(actor.personId);
    for (const found of [...(own ? [{ id: actor.personId, email: own }] : []), ...detailed]) {
      const email = found.email ? asAddress(found.email) : "";
      if (wanted.has(email) && !byEmail.has(email) && people.has(found.id)) byEmail.set(email, found.id);
    }
  }
  return { me: { id: me.id, name: me.name }, people: [...people.values()].map(pickable), byEmail };
}

const withLine = (name: string, line: string | null) => (line ? `${name}, ${line}` : name);

/** What was made, in words of the Pack and the names this person typed. */
function madeWords(d: StartDeclarations, made: MadeThing[]): string[] {
  const lists = { metric: ["", d.metrics], dashboard: ["the dashboard ", d.dashboards], workflow: ["the Workflow ", d.workflows], deck: ["the deck ", d.decks] } as const;
  return made.map((m) => {
    const [what, list] = lists[m.kind];
    return `${what}${withLine(list?.find((x) => x.key === m.key)?.name ?? m.key, m.line?.name ?? null)}`;
  });
}

/** What starting a Pack offers here (Owners and Admins). Nothing is written, but an idle set-up of someone else that
 * made nothing is taken away. */
export async function startOptions(actor: Actor, ref: PackStartRef): Promise<PackStartOptions> {
  assertSetsUp(actor);
  const source = await sourceOf(actor, ref);
  const stands = await standing(actor, source.installId);
  const made = stands.open ? await stillMade(actor, stands.open.id) : [];
  const [room, people, clock, over] = await Promise.all([roomOf(actor, made.filter((m) => m.kind === "metric").length), setupPeople(actor), workflowSchedule(actor), ended(actor)]);
  const [preview] = startSteps(source.declarations, room);
  const me = people.get(actor.personId);
  if (!me) throw new Forbidden();
  return {
    pack: { ...source.pack, installId: source.installId },
    declarations: source.declarations, room,
    me: { id: me.id, name: me.name },
    people: [...people.values()].filter((p) => p.id !== actor.personId).map(pickable),
    assistantTexts: source.assistantTexts,
    clock: { today: clock.today, hour: clock.hour, timeZone: clock.timeZone, runHour: clock.runHour, todayRan: clock.todayRan },
    unfinished: made.length ? { made: madeWords(source.declarations, made) } : null,
    blocked: source.blocked ?? stands.blocked ?? over ?? (preview.step === "preview" ? preview.blocked : null),
  };
}

// ---- The answers, from a browser ----

const KEY = /^[a-z][a-z0-9-]{0,39}$/;

function must(ok: unknown): asserts ok {
  if (!ok) throw new Refused(AGAIN);
}
const record = (v: unknown): Record<string, unknown> => { must(v && typeof v === "object" && !Array.isArray(v)); return v as Record<string, unknown>; };
const many = <T>(v: unknown, most: number, one: (x: unknown) => T): T[] | undefined => {
  if (v === undefined || v === null) return undefined;
  must(Array.isArray(v) && v.length <= most);
  return (v as unknown[]).map(one);
};
const word = (v: unknown, most: number): string => { must(typeof v === "string" && v.length <= most); return v as string; };
const key = (v: unknown): string => { must(typeof v === "string" && KEY.test(v)); return v as string; };

/** One person as a browser names them, shape and sizes checked. */
export function cleanPerson(v: unknown): StartPerson {
  const p = record(v);
  if (p.who === "me") return { who: "me" };
  if (p.who === "here") return { who: "here", id: word(p.id, 64) };
  must(p.who === "new");
  return { who: "new", name: word(p.name, 320), email: word(p.email, 320) };
}

/** The answers as a browser sends them, every shape and size checked, and nothing else taken over. */
function cleanChoices(input: unknown): StartChoices {
  const c = record(input);
  const lines = many(c.lines, 250, (v) => {
    const l = record(v);
    return {
      repeat: key(l.repeat),
      ...(l.name === undefined ? {} : { name: word(l.name, 240) }),
      ...(l.person === undefined ? {} : { person: cleanPerson(l.person) }),
      ...(l.others === undefined ? {} : { others: many(l.others, 20, (o) => ({ position: key(record(o).position), person: cleanPerson(record(o).person) })) ?? [] }),
    };
  });
  const who = many(c.who, 20, (v) => ({ position: key(record(v).position), person: cleanPerson(record(v).person) }));
  const providers = many(c.providers, 20, cleanPerson);
  const numbers = many(c.numbers, 600, (v) => {
    const n = record(v);
    must(typeof n.value === "number" && Number.isFinite(n.value) && (n.line === undefined || (Number.isInteger(n.line) && (n.line as number) >= 0 && (n.line as number) < 250)));
    return { metric: key(n.metric), ...(n.line === undefined ? {} : { line: n.line as number }), value: n.value as number };
  });
  const shares = many(c.shares, 1000, (v) => word(v, 400));
  must(c.source === undefined || c.source === "typed" || c.source === "system");
  const confirmed = c.confirmed === undefined ? undefined : record(c.confirmed);
  return {
    ...(lines ? { lines } : {}), ...(who ? { who } : {}), ...(providers ? { providers } : {}), ...(numbers ? { numbers } : {}), ...(shares ? { shares } : {}),
    ...(c.source === undefined ? {} : { source: c.source as "typed" | "system" }),
    ...(confirmed ? { confirmed: { assistantTexts: confirmed.assistantTexts === true } } : {}),
  };
}

// ---- Setting up ----

/** Adds the Contacts the plan names, and answers each one's id by its reference. Someone added meanwhile is used.
 * `beat` is called before each one. */
export async function addContacts(actor: Actor, plan: Pick<StartPlan, "contacts" | "people">, choices: StartChoices, added: string[], beat?: () => Promise<void>): Promise<Map<string, string>> {
  const ids = new Map<string, string>([["me", actor.personId]]);
  for (const ref of plan.contacts) {
    await beat?.();
    const p = plan.people.find((x) => x.ref === ref)!;
    try {
      ids.set(ref, await addContact(actor, { name: p.name, email: p.email! }));
      added.push(p.name);
    } catch (e) {
      const found = (await contextOf(actor, choices)).byEmail?.get(p.email!);
      if (!found) throw e;
      ids.set(ref, found);
    }
  }
  return ids;
}

/** The plan as a Set up takes it, with the people's ids. */
function setupInput(d: StartDeclarations, plan: StartPlan, choices: StartChoices, id: (ref: string) => string): PackSetupInput {
  const per = <T extends { key: string; per?: string }>(list: T[] | undefined, made: { key: string }[]) => {
    const picked = (list ?? []).filter((t) => made.some((m) => m.key === t.key));
    return { once: picked.find((t) => t.per === undefined), lines: picked.filter((t) => t.per !== undefined) };
  };
  const flows = per(d.workflows, plan.workflows);
  const boards = per(d.dashboards, plan.dashboards);
  // Where Positions name the Approvers the Set up takes them from there.
  const flow = (w: { key: string; approveBy?: string[] }) => ({ key: w.key, ...(w.approveBy?.length ? {} : { approvers: plan.workflows.find((x) => x.key === w.key)!.approvers.map(id) }) });
  const fills = (list: StartPlan["fills"]) => list.map((f) => ({ position: f.position, people: f.people.map(id) }));
  return {
    metrics: d.metrics.map((m) => m.key),
    submitters: plan.providers.map(id),
    workflow: flows.once ? flow(flows.once) : null,
    lineWorkflows: flows.lines.map(flow),
    dashboard: boards.once ? { key: boards.once.key } : null,
    lineDashboards: boards.lines.map((t) => ({ key: t.key })),
    people: fills(plan.fills),
    lines: plan.lines.map((l) => ({ repeat: l.repeat, name: l.name, people: fills(l.fills) })),
    shares: choices.shares ?? [],
  };
}

type Made = Parameters<GuidedStep["after"]>[1];
const madeId = (made: Made, m: PlannedMetric) => made.get(m.plan)!.id;

/** Writes each number asked at set-up as the target of every period of its span, unchanged. */
async function writeTargets(actor: Actor, d: StartDeclarations, targets: StartPlan["targets"], b: Blueprint, made: Made, beat: () => Promise<void>) {
  if (!targets.length) return;
  const ws = actor.workspaceId;
  const today = localTime(new Date(), (await workspaceClock(actor)).timeZone).day;
  for (const t of targets) {
    const metric = d.metrics.find((m) => m.key === t.metric)!;
    const planned = b.metrics.find((m) => m.entry.pack_key === t.metric && (m.line?.name ?? null) === t.line);
    if (!planned || !metric.ask) continue;
    await beat();
    const [own, span] = await Promise.all([yearStartFor(ws, metric.period as Period), yearStartFor(ws, metric.ask.every)]);
    const periods = targetPeriods(today, metric.period, metric.ask.every, own, span);
    await saveSeriesRows(actor, madeId(made, planned), "target", periods.map((period) => ({ period, value: t.value })), `From the set-up of ${d.name}`);
  }
}

/** Makes each Deck whose Slots the Pack's entries fill, once, owned by the person setting up. */
async function makeDecks(actor: Actor, installId: number, d: StartDeclarations, b: Blueprint, made: Made, kept: GuidedRecord) {
  const wanted = startSelection(d).decks.filter((t) => !kept.madeBefore.some((x) => x.kind === "deck" && x.key === t.key));
  if (!wanted.length) return;
  const { data, error } = await db().from("team_templates").select("id, pack_key, name").eq("workspace_id", actor.workspaceId).eq("pack_install_id", installId).eq("kind", "deck");
  if (error) throw new Error("The Pack's Deck Templates could not be read.");
  for (const t of wanted) {
    const template = data.find((x) => x.pack_key === t.key);
    if (!template) continue;
    await kept.beat();
    const fills = t.slots.map((s) => b.metrics.filter((m) => m.entry.pack_key === s.suggests).map((m) => madeId(made, m)).slice(0, s.multiple ? 50 : 1));
    const id = await createFilledDeck(actor, { template: Number(template.id), name: String(template.name), fills });
    await kept.made({ kind: "deck", key: t.key, line: null, id });
  }
}

/** The day of the next run that asks for a Workflow's Metrics: its own days, else the Workspace's daily run. */
export function nextRun(config: WorkflowConfig | undefined, clock: PackStartOptions["clock"]): string {
  if (config?.asking) return nextAskingRun(config.asking, clock.runHour, { day: clock.today, hour: clock.hour }) ?? clock.today;
  if (!clock.todayRan) return clock.today;
  return new Date(Date.parse(`${clock.today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** The names of the things made that are still there and the person sees. */
async function named(actor: Actor, table: "dashboards" | "decks" | "workflows", made: MadeThing[]): Promise<{ id: number; name: string }[]> {
  const ids = made.filter((m) => `${m.kind}s` === table).map((m) => m.id);
  if (!ids.length) return [];
  const { data, error } = await db().from(table).select("id, name").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).in("id", ids).order("id");
  if (error) throw new Error("What was made could not be read.");
  return data.map((r) => ({ id: Number(r.id), name: String(r.name) }));
}

/** What a finished set-up made, read from what is there now, so that a second press answers the same. */
async function resultOf(actor: Actor, source: Source, installId: number, setupId: number, choices: StartChoices): Promise<PackStartResult> {
  const ws = actor.workspaceId;
  const d = source.declarations;
  const [made, all, people, clock, context, room, trial, mail] = await Promise.all([
    stillMade(actor, setupId), getMetrics(ws), setupPeople(actor), workflowSchedule(actor), contextOf(actor, choices), roomOf(actor, 0), trialEndsAt(ws), mailOn(),
  ]);
  const seen = await visibleMetricIds(ws, actor.personId, all);
  const byId = new Map(all.map((m) => [m.id, m]));
  const metrics = made.flatMap((x) => {
    const m = x.kind === "metric" && seen.has(x.id) ? byId.get(x.id) : undefined;
    return m ? [{ id: m.id, slug: m.slug, name: m.name, key: x.key, line: x.line?.name ?? null, takesValues: Boolean(d.metrics.find((e) => e.key === x.key)?.takesValues) }] : [];
  });
  const ids = metrics.map((m) => m.id);
  const [{ data: tokens, error }, { data: follows, error: lost }, { data: series, error: none }] = await Promise.all([
    db().from("tokens").select("metric_id, submitter_id").eq("workspace_id", ws).is("stands_in_for", null).in("metric_id", ids),
    db().from("metrics").select("id, workflow_id").eq("workspace_id", ws).in("id", ids),
    db().from("series_values").select("metric_id").eq("kind", "target").in("metric_id", ids),
  ]);
  if (error || lost || none) throw new Error("What was made could not be read.");
  const flowOf = new Map(follows.flatMap((m): [number, number][] => (m.workflow_id === null ? [] : [[Number(m.id), Number(m.workflow_id)]])));
  const { data: sealed, error: unread } = await db().from("workflows").select("id, config").eq("workspace_id", ws).in("id", [...new Set(flowOf.values())]);
  if (unread) throw new Error("What was made could not be read.");
  const flows = new Map((await openWorkflowRows(ws, sealed)).map((w) => [Number(w.id), w.config as WorkflowConfig]));
  const clockNow = { today: clock.today, hour: clock.hour, timeZone: clock.timeZone, runHour: clock.runHour, todayRan: clock.todayRan };
  const submits = (id: string) => metrics.filter((m) => tokens.some((t) => Number(t.metric_id) === m.id && t.submitter_id === id));
  const asked = [...new Set(tokens.map((t) => String(t.submitter_id)))].flatMap((id) => {
    const who = people.get(id);
    if (!who) return [];
    const mine = submits(id);
    const days = mine.flatMap((m) => { const flow = flowOf.get(m.id); return flow === undefined ? [] : [nextRun(flows.get(flow), clockNow)]; }).sort();
    return [{ id, name: who.name, you: id === actor.personId, metrics: mine.map((m) => m.name), from: days[0] ?? null }];
  });
  // The same plan again, now that everyone typed is here, for whom to invite and what was left out.
  const plan = planStart(d, { ...room, metrics: null, trial: room.trial && { ...room.trial, others: START_METRICS_MAX } }, choices, context);
  const idOf = (ref: string) => (ref === "me" ? actor.personId : ref);
  const known = (ref: string) => { const who = people.get(idOf(ref)); return who ? { id: who.id, name: who.name, kind: who.kind } : null; };
  const targeted = new Set(plan.targets.map((t) => `${t.metric} ${t.line ?? ""}`));
  const system = startSteps(d, room).find((s) => s.step === "source");
  const wanted = new Set(choices.source === "system" && system?.step === "source" ? system.templates : []);
  const stoppedNote = await unsubscribedNote(actor, { metrics: asked.map((a) => ({ submitters: [a.id] })), people });
  return {
    pack: { installId, name: source.pack.name },
    metrics,
    dashboards: await named(actor, "dashboards", made),
    decks: await named(actor, "decks", made),
    workflows: await named(actor, "workflows", made),
    asked,
    unasked: metrics.filter((m) => m.takesValues && d.metrics.find((e) => e.key === m.key)?.comesFrom !== "target" && !tokens.some((t) => Number(t.metric_id) === m.id)).map(({ id, slug, name }) => ({ id, slug, name })),
    held: plan.held.flatMap((h) => {
      const who = known(h.for);
      return who ? [{ position: h.position, name: h.name, line: h.line, for: { id: who.id, name: who.name }, approves: h.places.includes("approve") }] : [];
    }),
    invite: plan.invite.flatMap((i) => { const who = known(i.person); return who?.kind === "contact" ? [{ id: who.id, name: who.name, role: i.role }] : []; }),
    leftOut: plan.leftOut,
    notes: [...plan.notes, ...(stoppedNote ? [stoppedNote] : [])],
    targets: metrics.filter((m) => targeted.has(`${m.key} ${m.line ?? ""}`) && series.some((s) => Number(s.metric_id) === m.id)).length,
    source: system ? choices.source ?? null : null,
    templates: feedTemplates().filter((t) => wanted.has(t.id)),
    needsFirstValue: trial !== null && !(await ownerHasOwnValue(ws)),
    mail,
  };
}

/** Why the Workspace cannot take so many more Contacts, or null. */
export async function contactRoom(actor: Actor, adding: number): Promise<string | null> {
  if (!adding) return null;
  const [{ count, error }, most] = await Promise.all([db().from("contacts").select("person_id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId), sendingLimit("contactsPerWorkspace")]);
  if (error) throw new Error("The Contacts could not be counted.");
  return (count ?? 0) + adding > most ? `A workspace keeps at most ${most} contacts.` : null;
}

/** A mark of who the answers name, in whatever order: the lines, who holds what and who provides. */
function peopleMark(packId: string, answers: StartChoices): string {
  const one = (p: StartPerson | undefined) => (p?.who === "new" ? `new ${asAddress(p.email)} ${p.name.trim()}` : p?.who === "here" ? `here ${p.id}` : p?.who ?? "");
  const lines = (answers.lines ?? []).map((l) => [l.repeat, l.name?.trim() ?? "", one(l.person), ...(l.others ?? []).map((o) => `${o.position} ${one(o.person)}`).sort()].join("|")).sort();
  const who = (answers.who ?? []).map((w) => `${w.position} ${one(w.person)}`).sort();
  return itemHash({ packId, lines, who, providers: (answers.providers ?? []).map(one).sort() });
}

/** Why the answers cannot finish a set-up that stopped, or null: what it made already holds the people it started with,
 * so it goes on only with them. Numbers, the source and the ticked Shares may change. */
const otherPeople = (open: SetupState, mark: string): string | null =>
  open.made && open.mark !== mark ? "This set-up stopped half way with other people. Name the same people to finish it; change or add people afterwards." : null;

/** The plan of the answers as the Workspace is now, with everything that can be checked before anything is written;
 * `open` is this person's set-up that stopped, whose Metrics are there already. */
async function checkedPlan(actor: Actor, source: Source, answers: StartChoices, open: SetupState | null): Promise<StartPlan> {
  const made = open ? (await stillMade(actor, open.id)).filter((m) => m.kind === "metric").length : 0;
  const plan = planStart(source.declarations, await roomOf(actor, made), answers, await contextOf(actor, answers));
  if (plan.problems.length) return plan;
  const more = plan.metrics.length - made;
  const why = (open ? otherPeople(open, peopleMark(source.pack.id, answers)) : null) ?? (more > 0 ? await roomFor(actor, more) : null) ?? (await contactRoom(actor, plan.contacts.length));
  return why ? { ...plan, problems: [why] } : plan;
}

/** What the check screen shows for these answers (Owners and Admins): the plan as `startPackStep` would make it, with
 * typed addresses found among the people here (one's own is “I do”) and the Workspace's real room. `problems` says why
 * it cannot be set up. Writes nothing. */
export async function checkStart(actor: Actor, ref: PackStartRef, choices: StartChoices): Promise<StartPlan> {
  assertSetsUp(actor);
  const answers = cleanChoices(choices);
  const source = await sourceOf(actor, ref);
  const states = source.installId === null ? [] : await setupStates(actor, source.installId);
  const open = states.find((s) => s.guided && !s.finished && s.by === actor.personId) ?? null;
  const plan = await checkedPlan(actor, source, answers, open);
  const taken = states.some((s) => s !== open && (s.finished || s.made > 0)) ? SET_UP : null;
  const why = source.blocked ?? taken ?? (await ended(actor));
  return why ? { ...plan, problems: [why, ...plan.problems] } : plan;
}

/** What the preview of a Pack draws: its entries for Sample Data, and its first dashboard, or, for a Pack without one,
 * the first slides of its first deck. */
export type PackStartDrawing = {
  sample: { pack: string; metrics: PackSampleEntry[] };
  dashboard: { name: string; slots: Slot[]; body: DashboardTemplateBody } | null;
  deck: { name: string; slots: Slot[]; slides: SlideBody[] } | null;
};

/** The most slides a preview draws. */
const PREVIEW_SLIDES = 3;

/** What the preview of a Pack draws (Owners and Admins), read from Ziffr's own file or the Workspace's install: the
 * Pack's own templates and entries, never a Metric or a number of the Workspace. Writes nothing. */
export async function startDrawing(actor: Actor, ref: PackStartRef): Promise<PackStartDrawing> {
  assertSetsUp(actor);
  return drawingOf(await sourceOf(actor, ref));
}

/** What a preview draws of a Pack's own templates and entries. */
export function drawingOf(source: Pick<Source, "pack" | "declarations" | "entries" | "templates">): PackStartDrawing {
  const { declarations: d } = source;
  const [preview] = startSteps(d, { metrics: null, trial: null, practice: false });
  const draws = preview.step === "preview" ? preview.draws : null;
  const template = draws ? source.templates.find((t) => t.kind === draws.kind && t.pack_key === draws.key) : undefined;
  // Only what a Slot is: an example Metric a template may keep is not sent.
  const slots = (template?.slots ?? []).map((s) => ({ label: s.label, multiple: s.multiple, ...(s.suggests ? { suggests: s.suggests } : {}) }));
  const repeats = new Map((d.repeats ?? []).map((r) => [r.key, r.name]));
  const per = new Map(d.metrics.map((m) => [m.key, m.per]));
  const metrics = source.entries.map((e) => ({
    key: e.pack_key, name: e.name, period: e.period, aggregation: e.aggregation, unit: e.unit, unit_position: e.unit_position, format: e.format, decimals: e.decimals, polarity: e.polarity,
    target_min: e.target_min, target_max: e.target_max, formula: e.formula, total: entryTotal(e), repeat: repeats.get(per.get(e.pack_key) ?? "") ?? null,
  }) as PackSampleEntry);
  let dashboard: PackStartDrawing["dashboard"] = null;
  let deck: PackStartDrawing["deck"] = null;
  if (template?.kind === "dashboard") {
    const body = template.body as DashboardTemplateBody;
    // A template's View Designs are checked again, as when it becomes a dashboard.
    assertWidgetDesigns(body.widgets);
    dashboard = { name: template.name, slots, body };
  } else if (template?.kind === "deck") {
    const slides = (template.body as DeckTemplateBody).slides.slice(0, PREVIEW_SLIDES);
    assertWidgetDesigns(slides);
    deck = { name: template.name, slots, slides };
  }
  return { sample: { pack: source.pack.id, metrics }, dashboard, deck };
}

/** Installs one of Ziffr's own Packs for the set-up; one installed a moment ago is used. */
async function install(actor: Actor, packId: string, choices: StartChoices): Promise<Source> {
  try {
    await installIncludedPack(actor, packId, choices.confirmed);
  } catch (e) {
    const now = await includedSource(actor, packId);
    if (now.installId === null) throw e;
    return now;
  }
  return includedSource(actor, packId);
}

/** What to say when the set-up stops: Ziffr's own words, and what was added before. Anything else goes to the log. */
function stopped(e: unknown, added: string[], installedNow: string | null): Error {
  const why = wordsForPeople(e);
  if (!why) console.error("A guided set-up stopped:", e);
  const also = [...(installedNow ? [`${installedNow} is installed.`] : []), ...(added.length ? [`Added as Contacts: ${listed(added)}.`] : [])];
  return new Error([why ?? "Setting up stopped on something unexpected.", ...also].join(" "));
}

// The set-up asked who provides the numbers, so First Steps does not ask it again (spec 0068): the fact is noted once, by
// the Owner, for a Workspace First Steps made. A note that cannot be written never fails the set-up.
async function noteProvidersAsked(actor: Actor): Promise<void> {
  if (actor.key || actor.role !== "owner" || actor.workspaceId === DEMO_WORKSPACE_ID) return;
  const now = new Date().toISOString();
  const { error } = await db().from("setup_guides").update({ providers_chosen_at: now, updated_at: now })
    .eq("workspace_id", actor.workspaceId).not("first_steps_at", "is", null).is("providers_chosen_at", null);
  if (error) console.error("The chosen providers could not be noted for First Steps:", error);
}

/** Takes one step of the guided set-up of a Pack (Owners and Admins). Everything is checked before anything is written.
 * While it answers `done: false`, send the same choices with its `run`. A step that stops leaves what was made, and
 * the same call without `run` (Try again) makes only what is missing; so does a second press. Sends nothing. */
export async function startPackStep(actor: Actor, ref: PackStartRef, choices: StartChoices, run: SetupRun | null = null): Promise<PackStartStep> {
  assertSetsUp(actor);
  const answers = cleanChoices(choices);
  let source = await sourceOf(actor, ref);
  const mark = itemHash({ pack: source.pack.id, answers: { ...answers, confirmed: null } });
  const people = peopleMark(source.pack.id, answers);
  const stands = await standing(actor, source.installId);
  const { done } = stands;
  if (done && done.by === actor.personId && done.mark === mark) return { done: true, result: await resultOf(actor, source, source.installId!, done.id, answers) };
  const refused = source.blocked ?? stands.blocked ?? (await ended(actor));
  if (refused) throw new Refused(refused);
  const { open } = stands;
  if (run && (!open || run.id !== open.id || run.step !== open.step)) throw new Refused(GONE);

  // 1. Check everything that can be checked.
  const plan = await checkedPlan(actor, source, answers, open);
  if (plan.problems.length) throw new Refused(plan.problems[0]);

  // 2. Install, if the Workspace does not have the Pack.
  let installedNow: string | null = null;
  if (source.installId === null) {
    source = await install(actor, source.included!, answers);
    installedNow = source.pack.name;
    if (source.blocked) throw new Refused(source.blocked);
  }
  const p = await installedForSetup(actor, source.installId!);
  const kept = await claimGuidedRecord(actor, p.install, { open: people, done: mark }, open);
  const added: string[] = [];
  try {
    // 3. Add the Contacts that are missing.
    const ids = await addContacts(actor, plan, answers, added, kept.beat);
    const id = (r: string) => ids.get(r) ?? r;
    const installId = p.install.id;
    // 4 to 6. Set up in steps; at the end the Workflows by period, the targets and the decks.
    const step = await setUpStep(actor, installId, setupInput(source.declarations, plan, answers, id), null, undefined, {
      record: kept,
      heldFor: new Map(plan.held.map((h) => [heldKey(h.line, h.position), id(h.for)])),
      after: async (b, metrics) => {
        await kept.beat();
        await joinPeriodWorkflows(actor, b.metrics.filter((m) => !isComputed(m.entry) && !m.workflow && m.submitters.length > 0).map((m) => madeId(metrics, m)));
        await writeTargets(actor, source.declarations, plan.targets, b, metrics, kept.beat);
        await makeDecks(actor, installId, source.declarations, b, metrics, kept);
      },
    });
    if (!step.done) {
      await kept.stop();
      return { done: false, run: { id: kept.id, step: kept.step }, made: step.made, of: step.of };
    }
    await noteProvidersAsked(actor);
    return { done: true, result: await resultOf(actor, source, installId, kept.id, answers) };
  } catch (e) {
    await kept.stop().catch((again: unknown) => console.error("A guided set-up's record could not be let go:", again));
    throw stopped(e, added, installedNow);
  }
}
