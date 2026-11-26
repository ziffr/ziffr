// Setting up from a Pack (spec 0030, ticket 277; GLOSSARY: Pack, Metric Catalog, Derived Metric, Dashboard Template,
// Slot, Workflow Template, Workspace Limit): after a Pack is installed, a person picks which of its Metric Catalog
// entries become Metrics, which of its Dashboard Templates becomes a dashboard with its Slots filled by them, and
// which of its Workflow Templates becomes a Workflow, with its people picked. Every function takes the Actor first.
// What is asked for is checked and laid out by pack-setup-build.ts, which the plan of a Set up reads too.
// Security: only Owners and Admins, never through a key, and only with an install of their own Workspace; every
// Feed picked as Submitter must be a live Feed of this Workspace. Everything is made through the core operation a
// person uses by hand, so permissions, limits and the Audit Log apply: createMetric (the Workspace Limit, the trial's
// cap), addSubmitters and setStandIn, addFeedToMetric (which also turns the API Source on), saveWorkflow (people of
// this Workspace only), createDashboardFromTemplate (every Metric must be seen) and share (only what the actor owns,
// only with members). A Share is made only when ticked, and nobody but the actor is messaged unless asked. A Derived
// Metric's formula is checked like any other. Everything asked for is checked before anything is made.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { feedChoices, addFeedToMetric } from "./feeds";
import { addSubmitters, createMetric, deleteMetric, metricEffects, MetricKept, SUBMITTERS_PER_CHANGE, type MetricEffects } from "./metrics";
import { checkFormula, formulaInputs } from "./formula";
import { createDashboardFromTemplate, metricChoices } from "./dashboard-templates";
import { editableWidget, updateWidget } from "./dashboards";
import { feedTemplates, type FeedTemplateInfo } from "./feed-template-download";
import { saveWorkflow, setSendSnapshot, setStandIn } from "./workflows";
import { share } from "./sharing";
import { resumeSetupRecord, startSetupRecord, type MadeThing, type SetupRecord } from "./pack-setup-record";
import { itemHash } from "./packs";
import { recordVersion } from "./versions";
import { tagNamesOf, TAGS_PER_ENTRY } from "./tag-names";
import { getMetrics } from "./workspace-data";
import { peopleIn } from "./submissions";
import { LimitReached } from "./workspace-limits";
import { buildSetup, placeMaps, SETUP_METRICS_MAX, tickedShares, withSlugs, type Blueprint, type BuiltLine, type PackSetupInput, type PlannedMetric, type PlannedWorkflow, type ProposedShare } from "./pack-setup-build";
import { PACK_POSITION_LIMITS } from "@ziffr/pack/pack-positions";
import { assertSetsUp, installedForSetup, roomFor, roomNow, type PackSetupRoom } from "./pack-setup-install";
import type { Slot, WorkflowTemplateBody } from "./types";
import type { KeptOverview, PackNumber } from "@ziffr/pack/comes-from";

export type { PackSetupInput, PackSetupRoom };

/** An entry of the Pack's part of the Metric Catalog, as the set-up page offers it. `inputs` are the keys a Derived
 * Metric's formula names: picking it makes them too, first. */
export type SetupEntry = { key: string; name: string; period: string; unit: string; derived: boolean; inputs: string[]; tags: string[]; /** The Repeat that makes it once for each line, or null. */ repeat: string | null; /** Whether a Position says who submits it. */ asksPosition: boolean; /** Where the Pack says its number comes from (comes-from.ts); null for an install that keeps none. */ comesFrom: PackNumber | null };
/** What setting up from an installed Pack offers: its entries and templates, the members who may approve, and the
 * Metrics this person sees to fill a Slot no entry fills. Names and ids only. */
export type PackSetupOptions = {
  install: { id: number; name: string; version: string };
  /** The Automation Templates the Pack says fill its entries (spec 0043), by template id and entry key. */
  suggestedFeeds: { template: string; fills: string[] }[];
  /** What the Pack brings and where its numbers come from, or null for an install that keeps none. */
  overview: KeptOverview | null;
  entries: SetupEntry[];
  dashboards: { key: string; name: string; slots: Pick<Slot, "label" | "multiple" | "suggests">[]; repeat: string | null }[];
  /** `approvers`: how many are picked beside Positions; 0 where the Pack's Positions name them. */
  workflows: { key: string; name: string; approvers: number; repeat: string | null }[];
  /** Whether the Pack names Positions or Repeats: the form then asks who fills them and shows the plan. */
  positions: boolean;
  repeats: { key: string; name: string; max: number }[];
  people: { id: string; name: string }[];
  /** The Workspace's live Feeds (names and ids), one of which may be the Submitter of every Metric made. */
  feeds: { id: string; name: string }[];
  /** The n8n templates that fill Metrics from another system (spec 0043), for the page after Set up. */
  templates: FeedTemplateInfo[];
  metrics: { id: number; name: string }[];
  /** Why no Metric can be made now (the Workspace Limit), or null. */
  refusal: string | null;
  /** What the Workspace's limit leaves, for the form to say before it asks; null where there is none. Counts only. */
  room: PackSetupRoom | null;
};

/** What was made. `dashboardId` and `workflowId` are the first of each. */
export type PackSetupResult = { metrics: { id: number; slug: string; name: string; /** The Pack's key of the entry it was made from. */ key: string; /** The name of the Repeat's line it was made for, or null. */ line: string | null; /** False for a Derived Metric, which a Feed cannot fill. */ takesValues: boolean }[]; dashboardId: number | null; workflowId: number | null;
  dashboards: { id: number; name: string }[]; workflows: { id: number; name: string }[];
  /** How many Shares were made, and how many requests for values went out at once. */
  shares: number; messages: number;
  /** Adding a line: how many widgets took its Metrics, and what is left to do by hand. */
  widgets: number; byHand: string[];
  /** The Tags of an entry that a limit kept off its Metric (the Metric is made either way), by Metric: the page says so. */
  tagsLeftOut: { metric: string; tags: string[] }[] };

/** An error's words when they are Ziffr's own, written for people: a plain Error, a refusal or a limit. */
const wordsForPeople = (e: unknown): string | null =>
  e instanceof Error && e.message && (Object.getPrototypeOf(e) === Error.prototype || e instanceof Forbidden || e instanceof LimitReached || e instanceof MetricKept) ? e.message : null;

const approversWanted = (body: WorkflowTemplateBody) => body.steps.reduce((n, s) => (s.type === "approve" ? n + s.approvers : n), 0);

/** What setting up from one of the Workspace's installed Packs offers (Owners and Admins). */
export async function packSetupOptions(actor: Actor, installId: number): Promise<PackSetupOptions> {
  assertSetsUp(actor);
  const p = await installedForSetup(actor, Number(installId));
  const [{ choices }, people, { data: members }] = await Promise.all([
    metricChoices(actor),
    peopleIn(actor.workspaceId),
    db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId),
  ]);
  const memberIds = new Set((members ?? []).map((m) => m.user_id as string));
  const places = placeMaps(p.places, p.workflows);
  const numbers = new Map((p.overview?.numbers ?? []).map((n) => [n.key, n]));
  return {
    install: p.install,
    suggestedFeeds: p.feeds,
    overview: p.overview,
    entries: [...p.entries.values()].map((e) => ({ key: e.pack_key, name: e.name, period: e.period, unit: e.unit, derived: Boolean(e.formula), inputs: e.formula ? formulaInputs(e.formula) : [], tags: tagNamesOf(e.tags, TAGS_PER_ENTRY), repeat: places.metrics.get(e.pack_key)?.per ?? null, asksPosition: Boolean(places.metrics.get(e.pack_key)?.submitters), comesFrom: numbers.get(e.pack_key) ?? null })),
    dashboards: [...p.dashboards.values()].map((t) => ({ key: t.pack_key, name: t.name, slots: (t.slots ?? []).map((s) => ({ label: s.label, multiple: s.multiple, ...(s.suggests ? { suggests: s.suggests } : {}) })), repeat: places.dashboards.get(t.pack_key)?.per ?? null })),
    workflows: [...p.workflows.values()].map((t) => ({ key: t.pack_key, name: t.name, approvers: places.workflows.get(t.pack_key)?.steps.some((s) => s.by) ? 0 : approversWanted(t.body as WorkflowTemplateBody), repeat: places.workflows.get(t.pack_key)?.per ?? null })),
    positions: places.positions.size > 0 || places.repeats.size > 0,
    repeats: [...places.repeats.values()].map((r) => ({ key: r.key, name: r.name, max: Math.min(r.max ?? PACK_POSITION_LIMITS.lines, PACK_POSITION_LIMITS.lines) })),
    // Members only, by name: Approvers must be members; Submitters may be Contacts too, but the set-up asks the
    // person themselves or their team, and Contacts are added on each Metric's page.
    people: people.filter((x) => memberIds.has(x.id)).map((x) => ({ id: x.id, name: x.name })),
    feeds: await feedChoices(actor),
    templates: feedTemplates(),
    metrics: choices,
    refusal: await roomFor(actor, 1),
    room: await roomNow(actor, SETUP_METRICS_MAX),
  };
}

/** What a Set up has made so far, by the numbers that stood for it. */
type Progress = {
  workflows: Map<PlannedWorkflow, number>;
  metrics: Map<number, PackSetupResult["metrics"][number]>;
  dashboards: Map<number, { id: number; name: string }>;
  shares: number;
  widgets: number;
  messages: number;
  tagsLeftOut: PackSetupResult["tagsLeftOut"];
};

/** Makes the Workflows, so the Metrics can take them. */
async function makeWorkflows(actor: Actor, b: Blueprint, record: SetupRecord, done: Progress) {
  for (const w of b.workflows) {
    const id = await saveWorkflow(actor, null, w.name, w.config, { message: `Made from the Workflow Template “${w.templateName}”` });
    done.workflows.set(w, id);
    await record.made({ kind: "workflow", key: w.key, line: w.line, id });
  }
}

/** Makes some of the Metrics, in the order given: a Derived Metric after its inputs. */
async function makeMetrics(actor: Actor, b: Blueprint, todo: PlannedMetric[], record: SetupRecord, done: Progress) {
  for (const planned of todo) {
    const e = planned.entry;
    const m = await createMetric(actor, {
      name: planned.name, description: e.description, calculationNote: e.calculation_note, unit: e.unit, unitPosition: e.unit_position, format: e.format, decimals: e.decimals, period: e.period,
      submissionRule: e.submission_rule, polarity: e.polarity, aggregation: e.aggregation, targetMin: e.target_min, targetMax: e.target_max,
      // A Derived Metric takes no values, so no Source and no Workflow.
      // One that takes values and has no Workflow of this run may join the one ticked of what was set up before.
      sources: e.formula ? [] : e.sources, fromCatalogId: e.id, workflowId: planned.workflow ? done.workflows.get(planned.workflow)! : e.formula ? null : b.additions.join,
    });
    // The entry's Tags were put on it by createMetric, as this person; a limit leaves words out, never the Metric.
    if (m.tagsLeftOut.length) done.tagsLeftOut.push({ metric: planned.name, tags: m.tagsLeftOut });
    // Its inputs are made before it, in its own line or outside every Repeat, so the formula names them by their slugs.
    if (e.formula) {
      const slug = (key: string) => [...done.metrics.values()].find((x) => x.key === key && (x.line === planned.line?.name || x.line === null))?.slug ?? b.given.get(key)!;
      await writeFormula(actor, { ...m, name: planned.name }, withSlugs(e.formula, slug));
    }
    const one = { id: m.id, slug: m.slug, name: planned.name, key: e.pack_key, line: planned.line?.name ?? null, takesValues: !e.formula };
    done.metrics.set(planned.plan, one);
    await record.made({ kind: "metric", key: e.pack_key, line: planned.line, id: m.id });
  }
}

/** Puts the people and the Feed on the Metrics just made: Submitters, who are asked at once only when they set up
 * themselves or asking now was ticked, then their Stand-ins. */
async function addPeople(actor: Actor, todo: PlannedMetric[], feed: string | null, askNow: boolean, done: Progress) {
  const effects: MetricEffects = {
    ...metricEffects,
    promptSubmitter: async (metricId, submitter, by) => {
      if (submitter !== actor.personId && !askNow) return false;
      const sent = await metricEffects.promptSubmitter(metricId, submitter, by);
      if (sent) done.messages++;
      return sent;
    },
  };
  const taking = todo.filter((m) => !m.entry.formula).map((m) => ({ ...m, id: done.metrics.get(m.plan)!.id }));
  for (const m of taking) for (let i = 0; i < m.submitters.length; i += SUBMITTERS_PER_CHANGE) await addSubmitters(actor, m.id, m.submitters.slice(i, i + SUBMITTERS_PER_CHANGE), effects);
  for (const m of taking) if (m.standIn) for (const s of m.submitters) if (s !== m.standIn) await setStandIn(actor, m.id, s, m.standIn);
  if (feed) for (const m of taking) await addFeedToMetric(actor, m.id, feed);
}

/** Makes the dashboards, then the Shares ticked, then gives each Send Snapshot step its dashboard, then adds the new
 * Metrics to the widgets ticked of what was set up before. */
async function makeDashboards(actor: Actor, b: Blueprint, ticked: ProposedShare[], record: SetupRecord, done: Progress) {
  for (const d of b.dashboards) {
    const id = await createDashboardFromTemplate(actor, { template: d.template.id, name: d.name, fills: d.fills.map((f) => f.map((x) => (x < 0 ? done.metrics.get(x)!.id : x))) });
    done.dashboards.set(d.plan, { id, name: d.name });
    await record.made({ kind: "dashboard", key: d.key, line: d.line, id });
  }
  for (const s of ticked) {
    await share(actor, s.object, s.object === "metric" ? done.metrics.get(s.plan)!.id : done.dashboards.get(s.plan)!.id, s.person, s.role);
    done.shares++;
  }
  for (const w of b.workflows) if (w.send) await setSendSnapshot(actor, done.workflows.get(w)!, done.dashboards.get(w.send.dashboard)!.id, w.send.people);
  for (const w of b.additions.widgets) {
    // Read again as it is now, and changed as by hand: only someone who may edit it gets this far.
    const now = await editableWidget(actor, w.id);
    await updateWidget(actor, w.id, { metricIds: [...now.metric_ids, ...w.add.map((plan) => done.metrics.get(plan)!.id)] });
    done.widgets++;
  }
}

/** Whether a recorded thing was made for this line. */
const forLine = (made: MadeThing, line: BuiltLine | null) => (made.line === null || line === null ? made.line === line : made.line.repeat === line.repeat && made.line.name === line.name);

/** Takes up what earlier steps made, so this one makes only the rest. */
async function takeUp(actor: Actor, b: Blueprint, made: MadeThing[], done: Progress) {
  const now = new Map((await getMetrics(actor.workspaceId)).map((m) => [m.id, m]));
  for (const w of b.workflows) {
    const was = made.find((x) => x.kind === "workflow" && x.key === w.key && forLine(x, w.line));
    if (was) done.workflows.set(w, was.id);
  }
  for (const m of b.metrics) {
    const was = made.find((x) => x.kind === "metric" && x.key === m.entry.pack_key && forLine(x, m.line));
    if (!was) continue;
    const metric = now.get(was.id);
    if (!metric) throw new Error(`“${m.name}” was deleted meanwhile.`);
    done.metrics.set(m.plan, { id: was.id, slug: metric.slug, name: m.name, key: m.entry.pack_key, line: m.line?.name ?? null, takesValues: !m.entry.formula });
  }
}

/** What to say when a Set up stops: Ziffr's own words, and what was made before. Only they reach a person; anything
 * else (a database's or a provider's text) goes to the log. */
function stoppedWords(e: unknown, done: Progress, earlier: number): Error {
  const so = [...[...done.metrics.values()].map((m) => m.name), ...[...done.workflows.keys()].map((w) => `the Workflow ${w.name}`), ...[...done.dashboards.values()].map((d) => `the dashboard ${d.name}`)];
  if (!wordsForPeople(e)) console.error("Set up from a Pack stopped:", e);
  const why = wordsForPeople(e) ?? "Setting up stopped on something unexpected.";
  const made = so.length ? so.join(", ") : earlier ? `${earlier} things in earlier steps` : "";
  return new Error(`${why}${made ? ` Made before it stopped: ${made}.` : ""}`);
}

/** The most Metrics one step of a Set up makes, so that no request takes long. */
export const SETUP_STEP_METRICS = 20;
/** A Set up that is not finished: which record it is and how far it is. Sent back to take the next step. */
export type SetupRun = { id: number; step: number };
/** What one step did: the whole Set up, or how far it is. */
export type PackSetupStep =
  | { done: false; run: SetupRun; made: number; of: number; tagsLeftOut: PackSetupResult["tagsLeftOut"] }
  | { done: true; result: PackSetupResult };

/** Takes one step of setting up from one of the Workspace's installed Packs (Owners and Admins): the first, without
 * `run`, checks everything, the Workspace Limit for the whole set included, makes the Workflows and the first Metrics;
 * each further one, with the `run` the last answered and the same choices, makes the next Metrics; the last makes the
 * dashboards and the ticked Shares. A step that stops ends the Set up and says what was made. */
export async function setUpStep(actor: Actor, installId: number, input: PackSetupInput, run: SetupRun | null = null, size = SETUP_STEP_METRICS): Promise<PackSetupStep> {
  assertSetsUp(actor);
  const p = await installedForSetup(actor, Number(installId));
  const mark = itemHash(input);
  const resumed = run ? await resumeSetupRecord(actor, p.install.id, run, mark) : null;
  let record = resumed?.record ?? null;
  // Made in order: Workflows, then Metric by Metric (inputs first) with their Submitters and Stand-ins, then
  // dashboards, Shares and the Send Snapshot step. All of it was checked; only what changed meanwhile can still refuse.
  const done: Progress = { workflows: new Map(), metrics: new Map(), dashboards: new Map(), shares: 0, widgets: 0, messages: resumed?.messages ?? 0, tagsLeftOut: [] };
  let b: Blueprint;
  try {
    b = await buildSetup(actor, p, input, resumed ? { record: resumed.record.id, metrics: resumed.made.filter((x) => x.kind === "metric").length } : undefined);
    // Taken up first, so a step that is refused still says what was made.
    if (resumed) await takeUp(actor, b, resumed.made, done);
    if (b.problems.length) throw new Error(b.problems[0]);
    if (!resumed) {
      record = await startSetupRecord(actor, p.install, b.lines, b.fills, mark);
      await makeWorkflows(actor, b, record, done);
    }
    const todo = b.metrics.filter((m) => !done.metrics.has(m.plan)).slice(0, size);
    await makeMetrics(actor, b, todo, record!, done);
    await addPeople(actor, todo, b.feed, input?.askNow === true, done);
    if (done.metrics.size < b.metrics.length) {
      await record!.keep(done.messages);
      return { done: false, run: { id: record!.id, step: record!.step }, made: done.metrics.size, of: b.metrics.length, tagsLeftOut: done.tagsLeftOut };
    }
    await makeDashboards(actor, b, tickedShares(b, input?.shares), record!, done);
    await record!.finish(done.messages);
  } catch (e) {
    // Nothing made leaves no record; else it is ended, and what was made stays.
    const nothing = !resumed && !done.metrics.size && !done.workflows.size && !done.dashboards.size;
    if (record) await (nothing ? record.drop() : record.finish(done.messages));
    throw resumed || record ? stoppedWords(e, done, resumed?.made.length ?? 0) : e;
  }
  const workflows = [...done.workflows].map(([w, id]) => ({ id, name: w.name }));
  const dashboards = [...done.dashboards.values()];
  // Counts only: who was put where is in each change's own record.
  const positions = [b.fills, ...b.lines.map((l) => l.fills)].flatMap((f) => [...f.values()].filter((ids) => ids.length)).length;
  await audit(actor, { kind: "pack.set_up", object: { type: "pack", id: p.install.id, name: p.install.name }, details: { version: p.install.version, metrics: done.metrics.size, dashboard: dashboards.length > 0, workflow: workflows.length > 0, feed: b.feed !== null, positions, lines: b.lines.length, shares: done.shares, messages: done.messages, ...(input.adding ? { added_line: true, widgets: done.widgets, joined_workflow: b.additions.join !== null } : {}) } });
  const metrics = [...done.metrics.values()];
  return { done: true, result: { metrics, dashboardId: dashboards[0]?.id ?? null, workflowId: workflows[0]?.id ?? null, dashboards, workflows, shares: done.shares, messages: done.messages, widgets: done.widgets, byHand: b.additions.byHand, tagsLeftOut: done.tagsLeftOut } };
}

/** Sets up from one of the Workspace's installed Packs (Owners and Admins) in one go: the picked entries as Metrics, a
 * Derived Metric after its inputs, which are made too; the Workflows (made first, so the Metrics take them) and the
 * dashboards with their Slots filled; the people of each Position written into the ordinary places, and the Shares
 * ticked, no others. Everything is checked before anything is made, the Workspace Limit included. A record keeps what
 * was made. Audited with counts, and each thing as any other. */
export async function setUpFromPack(actor: Actor, installId: number, input: PackSetupInput): Promise<PackSetupResult> {
  const step = await setUpStep(actor, installId, input, null, Number.POSITIVE_INFINITY);
  if (!step.done) throw new Error("Setting up stopped on something unexpected.");
  return step.result;
}

/** Sets the formula of a Derived Metric just made, checked again against the Workspace's Metrics as they are now. Refused,
 * the Metric goes again (it was made a moment ago and holds nothing), so no Metric that looks derived is left
 * without its formula. */
export async function writeFormula(actor: Actor, m: { id: number; name: string }, formula: string) {
  const metrics = await getMetrics(actor.workspaceId);
  const self = metrics.find((x) => x.id === m.id);
  const why = self ? checkFormula(formula, metrics, self) : "it is gone";
  const { error } = why ? { error: null } : await db().from("metrics").update({ formula, sources: [] }).eq("id", m.id).eq("workspace_id", actor.workspaceId);
  if (why || error) {
    if (self) await deleteMetric(actor, m.id, self.name).catch(() => undefined);
    throw new Error(`“${m.name}” could not be made${why ? `: ${why}` : "."}`);
  }
  await recordVersion("metric", m.id, actor.personId, { message: "Made a Derived Metric from its Pack's entry" });
}
