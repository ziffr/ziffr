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
import { feedTemplates, type FeedTemplateInfo } from "./feed-template-download";
import { saveWorkflow, setSendSnapshot, setStandIn } from "./workflows";
import { share } from "./sharing";
import { startSetupRecord, type SetupRecord } from "./pack-setup-record";
import { recordVersion } from "./versions";
import { tagNamesOf, TAGS_PER_ENTRY } from "./tag-names";
import { getMetrics } from "./workspace-data";
import { peopleIn } from "./submissions";
import { LimitReached } from "./workspace-limits";
import { buildSetup, placeMaps, SETUP_METRICS_MAX, tickedShares, withSlugs, type Blueprint, type PackSetupInput, type PlannedWorkflow, type ProposedShare } from "./pack-setup-build";
import { PACK_POSITION_LIMITS } from "@ziffr/pack/pack-positions";
import { assertSetsUp, installedForSetup, roomFor, roomNow, type PackSetupRoom } from "./pack-setup-install";
import type { Slot, WorkflowTemplateBody } from "./types";

export type { PackSetupInput, PackSetupRoom };

/** An entry of the Pack's part of the Metric Catalog, as the set-up page offers it. `inputs` are the keys a Derived
 * Metric's formula names: picking it makes them too, first. */
export type SetupEntry = { key: string; name: string; period: string; unit: string; derived: boolean; inputs: string[]; tags: string[]; /** The Repeat that makes it once for each line, or null. */ repeat: string | null; /** Whether a Position says who submits it. */ asksPosition: boolean };
/** What setting up from an installed Pack offers: its entries and templates, the members who may approve, and the
 * Metrics this person sees to fill a Slot no entry fills. Names and ids only. */
export type PackSetupOptions = {
  install: { id: number; name: string; version: string };
  /** The Automation Templates the Pack says fill its entries (spec 0043), by template id and entry key. */
  suggestedFeeds: { template: string; fills: string[] }[];
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
  return {
    install: p.install,
    suggestedFeeds: p.feeds,
    entries: [...p.entries.values()].map((e) => ({ key: e.pack_key, name: e.name, period: e.period, unit: e.unit, derived: Boolean(e.formula), inputs: e.formula ? formulaInputs(e.formula) : [], tags: tagNamesOf(e.tags, TAGS_PER_ENTRY), repeat: places.metrics.get(e.pack_key)?.per ?? null, asksPosition: Boolean(places.metrics.get(e.pack_key)?.submitters) })),
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

/** Makes the Metrics, a Derived Metric after its inputs. */
async function makeMetrics(actor: Actor, b: Blueprint, record: SetupRecord, done: Progress) {
  const made: PackSetupResult["metrics"][number][] = [];
  for (const planned of b.metrics) {
    const e = planned.entry;
    const m = await createMetric(actor, {
      name: planned.name, description: e.description, unit: e.unit, unitPosition: e.unit_position, format: e.format, decimals: e.decimals, period: e.period,
      submissionRule: e.submission_rule, polarity: e.polarity, aggregation: e.aggregation, targetMin: e.target_min, targetMax: e.target_max,
      // A Derived Metric takes no values, so no Source and no Workflow.
      sources: e.formula ? [] : e.sources, fromCatalogId: e.id, workflowId: planned.workflow ? done.workflows.get(planned.workflow)! : null,
    });
    // The entry's Tags were put on it by createMetric, as this person; a limit leaves words out, never the Metric.
    if (m.tagsLeftOut.length) done.tagsLeftOut.push({ metric: planned.name, tags: m.tagsLeftOut });
    // Its inputs are made before it, in its own line or outside every Repeat, so the formula names them by their slugs.
    if (e.formula) {
      const slug = (key: string) => made.find((x) => x.key === key && (x.line === planned.line?.name || x.line === null))!.slug;
      await writeFormula(actor, { ...m, name: planned.name }, withSlugs(e.formula, slug));
    }
    const one = { id: m.id, slug: m.slug, name: planned.name, key: e.pack_key, line: planned.line?.name ?? null, takesValues: !e.formula };
    made.push(one);
    done.metrics.set(planned.plan, one);
    await record.made({ kind: "metric", key: e.pack_key, line: planned.line, id: m.id });
  }
}

/** Puts the people and the Feed on the Metrics: Submitters, who are asked at once only when they set up themselves or
 * asking now was ticked, then their Stand-ins. */
async function addPeople(actor: Actor, b: Blueprint, askNow: boolean, done: Progress) {
  const effects: MetricEffects = {
    ...metricEffects,
    promptSubmitter: async (metricId, submitter, by) => {
      if (submitter !== actor.personId && !askNow) return false;
      const sent = await metricEffects.promptSubmitter(metricId, submitter, by);
      if (sent) done.messages++;
      return sent;
    },
  };
  const taking = b.metrics.filter((m) => !m.entry.formula).map((m) => ({ ...m, id: done.metrics.get(m.plan)!.id }));
  for (const m of taking) for (let i = 0; i < m.submitters.length; i += SUBMITTERS_PER_CHANGE) await addSubmitters(actor, m.id, m.submitters.slice(i, i + SUBMITTERS_PER_CHANGE), effects);
  for (const m of taking) if (m.standIn) for (const s of m.submitters) if (s !== m.standIn) await setStandIn(actor, m.id, s, m.standIn);
  if (b.feed) for (const m of taking) await addFeedToMetric(actor, m.id, b.feed);
}

/** Makes the dashboards, then the Shares ticked, then gives each Send Snapshot step its dashboard. */
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
}

/** Sets up from one of the Workspace's installed Packs (Owners and Admins): the picked entries as Metrics, a Derived
 * Metric after its inputs, which are made too; the Workflows (made first, so the Metrics take them) and the dashboards
 * with their Slots filled; the people of each Position written into the ordinary places, and the Shares ticked, no
 * others. Everything is checked before anything is made, the Workspace Limit included. A record keeps what was made.
 * Audited with counts, and each thing as any other. */
export async function setUpFromPack(actor: Actor, installId: number, input: PackSetupInput): Promise<PackSetupResult> {
  assertSetsUp(actor);
  const p = await installedForSetup(actor, Number(installId));
  const b = await buildSetup(actor, p, input);
  if (b.problems.length) throw new Error(b.problems[0]);

  // Made in order: Workflows, Metrics (inputs first), Submitters, Stand-ins, dashboards, Shares, the Send Snapshot
  // step. All of it was checked; only what changed at the same moment can still refuse a step, and then the words say
  // what was made before it stopped.
  const done: Progress = { workflows: new Map(), metrics: new Map(), dashboards: new Map(), shares: 0, messages: 0, tagsLeftOut: [] };
  const record = await startSetupRecord(actor, p.install, b.lines, b.fills);
  try {
    await makeWorkflows(actor, b, record, done);
    await makeMetrics(actor, b, record, done);
    await addPeople(actor, b, input?.askNow === true, done);
    await makeDashboards(actor, b, tickedShares(b, input?.shares), record, done);
  } catch (e) {
    const so = [...[...done.metrics.values()].map((m) => m.name), ...[...done.workflows.keys()].map((w) => `the Workflow ${w.name}`), ...[...done.dashboards.values()].map((d) => `the dashboard ${d.name}`)];
    if (!so.length) await record.drop();
    // Only Ziffr's own words reach a person; anything else (a database's or a provider's text) goes to the log.
    if (!wordsForPeople(e)) console.error("Set up from a Pack stopped:", e);
    const why = wordsForPeople(e) ?? "Setting up stopped on something unexpected.";
    throw new Error(`${why}${so.length ? ` Made before it stopped: ${so.join(", ")}.` : ""}`);
  }
  const workflows = [...done.workflows].map(([w, id]) => ({ id, name: w.name }));
  const dashboards = [...done.dashboards.values()];
  // Counts only: who was put where is in each change's own record.
  const positions = [b.fills, ...b.lines.map((l) => l.fills)].flatMap((f) => [...f.values()].filter((ids) => ids.length)).length;
  await audit(actor, { kind: "pack.set_up", object: { type: "pack", id: p.install.id, name: p.install.name }, details: { version: p.install.version, metrics: done.metrics.size, dashboard: dashboards.length > 0, workflow: workflows.length > 0, feed: b.feed !== null, positions, lines: b.lines.length, shares: done.shares, messages: done.messages } });
  const metrics = [...done.metrics.values()];
  return { metrics, dashboardId: dashboards[0]?.id ?? null, workflowId: workflows[0]?.id ?? null, dashboards, workflows, shares: done.shares, messages: done.messages, tagsLeftOut: done.tagsLeftOut };
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
