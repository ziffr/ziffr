// Setting up from a Pack (spec 0030, ticket 277; GLOSSARY: Pack, Metric Catalog, Derived Metric, Dashboard Template,
// Slot, Workflow Template, Workspace Limit): after a Pack is installed, a person picks which of its Metric Catalog
// entries become Metrics, which of its Dashboard Templates becomes a dashboard with its Slots filled by them, and
// which of its Workflow Templates becomes a Workflow, with its people picked. Every function takes the Actor first.
// What is asked for is checked and laid out by pack-setup-build.ts, which the plan of a Set up reads too.
// Security: only Owners and Admins, never through a key, and only with an install of their own Workspace; every
// Feed picked as Submitter must be a live Feed of this Workspace (checked before anything is made, set through
// addFeedToMetric, which also turns the API Source on). Every Metric is made through createMetric (the Workspace Limit, the trial's cap, the Audit Log), a Derived Metric's
// formula is checked against the Workspace's Metrics like any other, the dashboard through
// createDashboardFromTemplate (every Metric must be seen) and the Workflow through createWorkflowFromTemplate
// (Approvers must be members). Everything asked for is checked before anything is made.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { feedChoices, addFeedToMetric } from "./feeds";
import { addSubmitters, createMetric, deleteMetric, MetricKept } from "./metrics";
import { checkFormula, formulaInputs } from "./formula";
import { createDashboardFromTemplate, metricChoices } from "./dashboard-templates";
import { feedTemplates, type FeedTemplateInfo } from "./feed-template-download";
import { createWorkflowFromTemplate } from "./workflow-templates";
import { recordVersion } from "./versions";
import { tagNamesOf, TAGS_PER_ENTRY } from "./tag-names";
import { getMetrics } from "./workspace-data";
import { peopleIn } from "./submissions";
import { LimitReached } from "./workspace-limits";
import { buildSetup, SETUP_METRICS_MAX, withSlugs, type PackSetupInput } from "./pack-setup-build";
import { assertSetsUp, installedForSetup, roomFor, roomNow, type PackSetupRoom } from "./pack-setup-install";
import type { Slot, WorkflowTemplateBody } from "./types";

export type { PackSetupInput, PackSetupRoom };

/** An entry of the Pack's part of the Metric Catalog, as the set-up page offers it. `inputs` are the keys a Derived
 * Metric's formula names: picking it makes them too, first. */
export type SetupEntry = { key: string; name: string; period: string; unit: string; derived: boolean; inputs: string[]; tags: string[] };
/** What setting up from an installed Pack offers: its entries and templates, the members who may approve, and the
 * Metrics this person sees to fill a Slot no entry fills. Names and ids only. */
export type PackSetupOptions = {
  install: { id: number; name: string; version: string };
  /** The Automation Templates the Pack says fill its entries (spec 0043), by template id and entry key. */
  suggestedFeeds: { template: string; fills: string[] }[];
  entries: SetupEntry[];
  dashboards: { key: string; name: string; slots: Pick<Slot, "label" | "multiple" | "suggests">[] }[];
  workflows: { key: string; name: string; approvers: number }[];
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

/** What was made. */
export type PackSetupResult = { metrics: { id: number; slug: string; name: string; /** The Pack's key of the entry it was made from. */ key: string; /** False for a Derived Metric, which a Feed cannot fill. */ takesValues: boolean }[]; dashboardId: number | null; workflowId: number | null;
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
  return {
    install: p.install,
    suggestedFeeds: p.feeds,
    entries: [...p.entries.values()].map((e) => ({ key: e.pack_key, name: e.name, period: e.period, unit: e.unit, derived: Boolean(e.formula), inputs: e.formula ? formulaInputs(e.formula) : [], tags: tagNamesOf(e.tags, TAGS_PER_ENTRY) })),
    dashboards: [...p.dashboards.values()].map((t) => ({ key: t.pack_key, name: t.name, slots: (t.slots ?? []).map((s) => ({ label: s.label, multiple: s.multiple, ...(s.suggests ? { suggests: s.suggests } : {}) })) })),
    workflows: [...p.workflows.values()].map((t) => ({ key: t.pack_key, name: t.name, approvers: approversWanted(t.body as WorkflowTemplateBody) })),
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

/** Sets up from one of the Workspace's installed Packs (Owners and Admins): the picked entries as Metrics, a Derived
 * Metric after its inputs, which are made too; then, if asked, the Workflow (made first, so the Metrics take it) and
 * the dashboard with its Slots filled. Everything is checked before anything is made, the Workspace Limit included.
 * Audited, and each Metric as any new Metric. */
export async function setUpFromPack(actor: Actor, installId: number, input: PackSetupInput): Promise<PackSetupResult> {
  assertSetsUp(actor);
  const p = await installedForSetup(actor, Number(installId));
  // Positions and Repeats are planned (planPackSetup) but not written yet (#1180): the Pack is set up as one without.
  if (input?.people?.length || input?.lines?.length || input?.lineDashboards?.length || input?.lineWorkflows?.length) throw new Error("Setting up with Positions and Repeats comes in a later version of Ziffr.");
  const b = await buildSetup(actor, { ...p, places: null }, input);
  if (b.problems.length) throw new Error(b.problems[0]);

  // Made in order: the Workflow, the Metrics (inputs first), their Submitters, the dashboard. All of it was checked;
  // only a Metric made by someone else at the same moment can still meet the limit, and then the words say what was
  // made before it stopped.
  const made = new Map<number, PackSetupResult["metrics"][number]>();
  const tagsLeftOut: PackSetupResult["tagsLeftOut"] = [];
  const flow = b.workflows[0] ?? null;
  const board = b.dashboards[0] ?? null;
  let workflowId: number | null = null;
  let dashboardId: number | null = null;
  try {
    workflowId = flow ? await createWorkflowFromTemplate(actor, { template: p.workflows.get(flow.key)!.id, name: flow.name, approvers: flow.approvers }) : null;
    for (const planned of b.metrics) {
      const e = planned.entry;
      const m = await createMetric(actor, {
        name: planned.name, description: e.description, unit: e.unit, unitPosition: e.unit_position, format: e.format, decimals: e.decimals, period: e.period,
        submissionRule: e.submission_rule, polarity: e.polarity, aggregation: e.aggregation, targetMin: e.target_min, targetMax: e.target_max,
        // A Derived Metric takes no values, so no Source and no Workflow.
        sources: e.formula ? [] : e.sources, fromCatalogId: e.id, workflowId: planned.workflow ? workflowId : null,
      });
      // The entry's Tags were put on it by createMetric, as this person; a limit leaves words out, never the Metric.
      if (m.tagsLeftOut.length) tagsLeftOut.push({ metric: planned.name, tags: m.tagsLeftOut });
      // Its inputs are made before it, so the formula names them by the slugs they got.
      if (e.formula) await writeFormula(actor, { ...m, name: planned.name }, withSlugs(e.formula, (k) => [...made.values()].find((x) => x.key === k)!.slug));
      made.set(planned.plan, { id: m.id, slug: m.slug, name: planned.name, key: e.pack_key, takesValues: !e.formula });
    }
    for (const m of b.metrics) if (!m.entry.formula && m.submitters.length) await addSubmitters(actor, made.get(m.plan)!.id, m.submitters);
    if (b.feed) for (const m of b.metrics) if (!m.entry.formula) await addFeedToMetric(actor, made.get(m.plan)!.id, b.feed);
    dashboardId = board
      ? await createDashboardFromTemplate(actor, { template: board.template.id, name: board.name, fills: board.fills.map((f) => f.map((id) => (id < 0 ? made.get(id)!.id : id))) })
      : null;
  } catch (e) {
    const so = [...[...made.values()].map((m) => m.name), ...(workflowId !== null ? ["the Workflow"] : [])];
    // Only Ziffr's own words reach a person; anything else (a database's or a provider's text) goes to the log.
    if (!wordsForPeople(e)) console.error("Set up from a Pack stopped:", e);
    const why = wordsForPeople(e) ?? "Setting up stopped on something unexpected.";
    throw new Error(`${why}${so.length ? ` Made before it stopped: ${so.join(", ")}.` : ""}`);
  }
  await audit(actor, { kind: "pack.set_up", object: { type: "pack", id: p.install.id, name: p.install.name }, details: { version: p.install.version, metrics: made.size, dashboard: dashboardId !== null, workflow: workflowId !== null, feed: b.feed !== null } });
  return { metrics: [...made.values()], dashboardId, workflowId, tagsLeftOut };
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
