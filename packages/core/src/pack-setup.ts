// Setting up from a Pack (spec 0030, ticket 277; GLOSSARY: Pack, Metric Catalog, Derived Metric, Dashboard Template,
// Slot, Workflow Template, Workspace Limit): after a Pack is installed, a person picks which of its Metric Catalog
// entries become Metrics, which of its Dashboard Templates becomes a dashboard with its Slots filled by them, and
// which of its Workflow Templates becomes a Workflow, with its people picked. Every function takes the Actor first.
// Security: only Owners and Admins, never through a key, and only with an install of their own Workspace; every
// Feed picked as Submitter must be a live Feed of this Workspace (checked before anything is made, set through
// addFeedToMetric, which also turns the API Source on). Every Metric is made through createMetric (the Workspace Limit, the trial's cap, the Audit Log), a Derived Metric's
// formula is checked against the Workspace's Metrics like any other, the dashboard through
// createDashboardFromTemplate (every Metric must be seen) and the Workflow through createWorkflowFromTemplate
// (Approvers must be members). Everything asked for is checked before anything is made. Keys from the browser are
// matched through Maps, never as fields of a plain object.
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { assertCan, Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { liveFeed, feedChoices, addFeedToMetric } from "./feeds";
import { addSubmitters, createMetric, deleteMetric, MetricKept } from "./metrics";
import { checkFormula, formulaInputs, type FormulaInput } from "./formula";
import { createDashboardFromTemplate, metricChoices } from "./dashboard-templates";
import { feedTemplates, type FeedTemplateInfo } from "./feed-template-download";
import { createWorkflowFromTemplate } from "./workflow-templates";
import { fromWorkflowTemplate } from "./team-templates";
import { recordVersion } from "./versions";
import { tagNamesOf, TAGS_PER_ENTRY } from "./tag-names";
import { getMetrics } from "./workspace-data";
import { peopleIn } from "./submissions";
import { graceNow, LimitReached, limitOf, limitRefusal, limitRule, metricCount, metricsAllowed, nextGraceOn } from "./workspace-limits";
import { trialLimitsInEffect } from "./trial-limits-in-effect";
import type { Slot, WorkflowTemplateBody } from "./types";

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

/** The Workspace's count of Metrics against its limit, as the set-up form shows it. `left` is what the Size still
 * holds; `allowed` is how many may be made now at all, the room and grace of spec 0029 included. A trial's cap is a
 * limit with no Size name. The core checks again when a set-up is asked for: these numbers are only for reading. */
export type PackSetupRoom = { count: number; limit: number; label: string | null; left: number; allowed: number; graceDays: number };

/** What a person asks to be set up. Slots an entry made here fills are filled with it; `fills` names Metrics they see
 * for the other Slots, by Slot. */
export type PackSetupInput = {
  metrics: string[];
  submitters?: string[];
  /** One of the Workspace's Feeds, made the Submitter of every Metric that takes values, with its API Source on. */
  feed?: string | null;
  dashboard?: { key: string; name?: string; fills?: (number[] | null)[] } | null;
  workflow?: { key: string; name?: string; approvers: string[] } | null;
};

/** What was made. */
export type PackSetupResult = { metrics: { id: number; slug: string; name: string; /** The Pack's key of the entry it was made from. */ key: string; /** False for a Derived Metric, which a Feed cannot fill. */ takesValues: boolean }[]; dashboardId: number | null; workflowId: number | null;
  /** The Tags of an entry that a limit kept off its Metric (the Metric is made either way), by Metric: the page says so. */
  tagsLeftOut: { metric: string; tags: string[] }[] };

/** The most entries one set-up makes: a Pack holds at most 50 of a kind. */
const MAX_ENTRIES = 50;
/** The most Submitters one set-up asks (each gets a first Prompt for every Metric): the page asks only the person. */
const MAX_SUBMITTERS = 5;
/** The most Approvers a Workflow's Approve step takes. */
const MAX_APPROVERS = 3;
/** The longest slug a Metric can get: a name of 120 characters, and a suffix when the slug is taken. */
const LONGEST_SLUG = 130;
const KEY = /^[a-z][a-z0-9-]{0,39}$/;

// A person who manages the Workspace, not a program: setting up creates Metrics and sends Prompts.
/** An error's words when they are Ziffr's own, written for people: a plain Error, a refusal or a limit. */
const wordsForPeople = (e: unknown): string | null =>
  e instanceof Error && e.message && (Object.getPrototypeOf(e) === Error.prototype || e instanceof Forbidden || e instanceof LimitReached || e instanceof MetricKept) ? e.message : null;

function assertManages(actor: Actor) {
  if ((actor as { key?: unknown }).key) throw new Forbidden();
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins set up from a Pack.");
  assertCan(actor, "create");
  refuseInDemo(actor);
}

type EntryRow = { id: number; pack_key: string; name: string; description: string; unit: string; unit_position: string; format: string; decimals: number; period: string; submission_rule: string; polarity: string; target_min: number | null; target_max: number | null; sources: string[]; aggregation: string; formula: string | null; tags: string[] | null };
type TemplateRow = { id: number; kind: "dashboard" | "workflow"; pack_key: string; name: string; slots: Slot[]; body: unknown };

/** The install of the actor's Workspace, with what it added that is still marked as from it. */
async function installed(actor: Actor, installId: number) {
  const ws = actor.workspaceId;
  if (!Number.isSafeInteger(installId) || installId <= 0) throw new Forbidden();
  const { data: install } = await db().from("pack_installs").select("id, version, manifest").eq("id", installId).eq("workspace_id", ws).maybeSingle();
  if (!install) throw new Forbidden();
  const [{ data: entries }, { data: templates }] = await Promise.all([
    db().from("catalog_metrics").select("id, pack_key, name, description, unit, unit_position, format, decimals, period, submission_rule, polarity, target_min, target_max, sources, aggregation, formula, tags").eq("workspace_id", ws).eq("pack_install_id", installId).order("id"),
    db().from("team_templates").select("id, kind, pack_key, name, slots, body").eq("workspace_id", ws).eq("pack_install_id", installId).in("kind", ["dashboard", "workflow"]).order("id"),
  ]);
  const byKey = <T extends { pack_key: string }>(rows: T[]) => new Map(rows.filter((r) => typeof r.pack_key === "string").map((r) => [r.pack_key, r]));
  const tpl = (templates ?? []) as TemplateRow[];
  return {
    install: { id: Number(install.id), name: String((install.manifest as { name?: unknown })?.name ?? ""), version: String(install.version) },
    feeds: feedsOf((install.manifest as { feeds?: unknown })?.feeds),
    entries: byKey((entries ?? []) as EntryRow[]),
    dashboards: byKey(tpl.filter((t) => t.kind === "dashboard")),
    workflows: byKey(tpl.filter((t) => t.kind === "workflow")),
  };
}

/** The templates a Pack's manifest names, read defensively: it was checked when installed, but it is a stored document. */
function feedsOf(raw: unknown): { template: string; fills: string[] }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f): { template: string; fills: string[] }[] => {
    const x = f as { template?: unknown; fills?: unknown } | null;
    return x && typeof x.template === "string" && Array.isArray(x.fills) ? [{ template: x.template, fills: x.fills.filter((k): k is string => typeof k === "string") }] : [];
  });
}

const approversWanted = (body: WorkflowTemplateBody) => body.steps.reduce((n, s) => (s.type === "approve" ? n + s.approvers : n), 0);

/** Why `n` more Metrics cannot be made now, in the limit's words, or null: the trial's cap, or the Workspace Limit
 * counted one Metric at a time as the database will. Checked first, so a set-up does not stop half-way. */
async function roomFor(actor: Actor, n: number): Promise<string | null> {
  const ws = actor.workspaceId;
  const [{ data: space }, limit, count] = await Promise.all([db().from("workspaces").select("trial_ends_at, over_limit_since, last_grace_started_at").eq("id", ws).maybeSingle(), limitOf(ws), metricCount(ws)]);
  if (space?.trial_ends_at) {
    const { count: all } = await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    const cap = (await trialLimitsInEffect()).metrics;
    return (all ?? 0) + n > cap ? `A trial holds at most ${cap} Metrics; it has ${all ?? 0}, and this makes ${n}. Pick fewer.` : null;
  }
  if (!limit) return null;
  let since = space?.over_limit_since ? new Date(space.over_limit_since as string) : null;
  const last = space?.last_grace_started_at ? new Date(space.last_grace_started_at as string) : null;
  const now = new Date();
  const grace = await graceNow();
  for (let i = 0; i < n; i++) {
    const rule = limitRule(count + i, limit.metrics, since, now, last, grace);
    const refusal = () => limitRefusal(count + i, limit, since ? null : nextGraceOn(last, now, grace.every), grace.days);
    if (rule === "refuse") return n === 1 || i === 0 ? refusal() : `${refusal()} This makes ${n} Metrics, room is left for ${i}.`;
    if (rule === "over" && !since) since = last && now.getTime() < last.getTime() + grace.days * 86_400_000 ? last : now;
  }
  return null;
}

/** The count, limit, what is left and what may be made now, or null when nothing limits the Workspace. */
async function roomNow(actor: Actor): Promise<PackSetupRoom | null> {
  const ws = actor.workspaceId;
  const [{ data: space }, limit, count, grace] = await Promise.all([
    db().from("workspaces").select("trial_ends_at, over_limit_since, last_grace_started_at").eq("id", ws).maybeSingle(),
    limitOf(ws), metricCount(ws), graceNow(),
  ]);
  if (space?.trial_ends_at) {
    const { count: all } = await db().from("metrics").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
    const cap = (await trialLimitsInEffect()).metrics;
    const left = Math.max(0, cap - (all ?? 0));
    return { count: all ?? 0, limit: cap, label: null, left, allowed: left, graceDays: 0 };
  }
  if (!limit) return null;
  const since = space?.over_limit_since ? new Date(space.over_limit_since as string) : null;
  const last = space?.last_grace_started_at ? new Date(space.last_grace_started_at as string) : null;
  const allowed = metricsAllowed(count, limit.metrics, since, new Date(), last, grace, MAX_ENTRIES);
  return { count, limit: limit.metrics, label: limit.label, left: Math.max(0, limit.metrics - count), allowed, graceDays: grace.days };
}

/** What setting up from one of the Workspace's installed Packs offers (Owners and Admins). */
export async function packSetupOptions(actor: Actor, installId: number): Promise<PackSetupOptions> {
  assertManages(actor);
  const p = await installed(actor, Number(installId));
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
    room: await roomNow(actor),
  };
}

/** Sets up from one of the Workspace's installed Packs (Owners and Admins): the picked entries as Metrics, a Derived
 * Metric after its inputs, which are made too; then, if asked, the Workflow (made first, so the Metrics take it) and
 * the dashboard with its Slots filled. Everything is checked before anything is made, the Workspace Limit included.
 * Audited, and each Metric as any new Metric. */
export async function setUpFromPack(actor: Actor, installId: number, input: PackSetupInput): Promise<PackSetupResult> {
  assertManages(actor);
  const p = await installed(actor, Number(installId));
  const asked = Array.isArray(input?.metrics) ? input.metrics.slice(0, MAX_ENTRIES + 1).map(String) : [];
  if (asked.length > MAX_ENTRIES || asked.some((k) => !KEY.test(k) || !p.entries.has(k))) throw new Error("Pick entries of this Pack's Metric Catalog.");

  // The entries to make: those picked, and every input of a Derived one; inputs first, in the Pack's order.
  const wanted = new Set(asked);
  for (const k of asked) {
    const f = p.entries.get(k)!.formula;
    if (!f) continue;
    for (const i of formulaInputs(f)) {
      const input = p.entries.get(i);
      if (!input) throw new Error(`“${p.entries.get(k)!.name}” is computed from an entry this Pack does not have.`);
      if (input.formula) throw new Error(`“${p.entries.get(k)!.name}” is computed from “${input.name}”, a Derived Metric itself: Ziffr computes from Metrics that take values.`);
      wanted.add(i);
    }
  }
  const order = [...p.entries.values()].filter((e) => wanted.has(e.pack_key));
  const plain = order.filter((e) => !e.formula);
  const derived = order.filter((e) => e.formula);

  // The Workflow: its template and the people its Approve step asks for, checked now.
  let workflow: { template: TemplateRow; name: string; approvers: string[] } | null = null;
  if (input?.workflow) {
    const t = typeof input.workflow.key === "string" ? p.workflows.get(input.workflow.key) : undefined;
    if (!t) throw new Error("Pick one of this Pack's Workflow Templates.");
    const approvers = Array.isArray(input.workflow.approvers) ? input.workflow.approvers.slice(0, MAX_APPROVERS + 1).map(String) : [];
    if (!fromWorkflowTemplate(t.body as WorkflowTemplateBody, approvers)) throw new Error("Pick each Approver the Workflow Template asks for, each person once.");
    workflow = { template: t, name: String(input.workflow.name ?? "").trim().slice(0, 120) || t.name, approvers };
  }

  // The dashboard: every Slot filled, by the entry it suggests when that is made here, else by Metrics picked.
  let dashboard: { template: TemplateRow; name: string; fills: (string | number[])[] } | null = null;
  if (input?.dashboard) {
    const t = typeof input.dashboard.key === "string" ? p.dashboards.get(input.dashboard.key) : undefined;
    if (!t) throw new Error("Pick one of this Pack's Dashboard Templates.");
    const given = Array.isArray(input.dashboard.fills) ? input.dashboard.fills : [];
    const fills = (t.slots ?? []).map((s, i): string | number[] => {
      if (s.suggests && wanted.has(s.suggests)) return s.suggests;
      const f = given[i];
      const ids = Array.isArray(f) ? f.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 50) : [];
      if (!ids.length) throw new Error(`Fill the Slot “${s.label}” with a Metric, or make the entry it suggests.`);
      return s.multiple ? ids : ids.slice(0, 1);
    });
    dashboard = { template: t, name: String(input.dashboard.name ?? "").trim().slice(0, 120) || t.name, fills };
  }

  // A Derived Metric's formula, by the Metrics' slugs, checked against the Workspace's Metrics as they will be, with
  // each slug as long as one can get, so the formula written later cannot be refused as too long.
  if (derived.length) {
    const existing = (await getMetrics(actor.workspaceId)).map((m): FormulaInput => m);
    const longest = (k: string) => `${k}-`.padEnd(LONGEST_SLUG, "x");
    const planned = plain.map((e): FormulaInput => ({ slug: longest(e.pack_key), name: e.name, period: e.period as FormulaInput["period"], formula: null, aggregation: e.aggregation as FormulaInput["aggregation"] }));
    for (const e of derived) {
      const why = checkFormula(withSlugs(e.formula!, longest), [...existing, ...planned], { slug: "-", period: e.period as FormulaInput["period"] });
      if (why) throw new Error(`“${e.name}” cannot be made: ${why}`);
    }
  }
  // The Metrics that fill the other Slots: ones the person sees and that are not archived, as the page offers.
  if (dashboard) {
    const { choices } = await metricChoices(actor);
    const offered = new Set(choices.map((m) => m.id));
    if (dashboard.fills.some((f) => typeof f !== "string" && f.some((id) => !offered.has(id)))) throw new Forbidden("Fill a Slot only with Metrics you see.");
  }
  // Submitters and Approvers are members of this Workspace: the page offers no one else.
  const submitters = [...new Set((Array.isArray(input?.submitters) ? input.submitters : []).slice(0, MAX_SUBMITTERS + 1).map(String))];
  if (submitters.length > MAX_SUBMITTERS) throw new Error(`Ask at most ${MAX_SUBMITTERS} people; add more on each Metric's page.`);
  await assertMembers(actor, [...submitters, ...(workflow?.approvers ?? [])]);
  // A Feed from the browser: a string naming a live Feed of this Workspace, or nothing.
  if (input?.feed != null && typeof input.feed !== "string") throw new Error("Pick one of this Workspace's Feeds.");
  const feed = input?.feed ? await liveFeed(actor.workspaceId, input.feed).then((f) => f.person_id, () => { throw new Forbidden("Pick one of this Workspace's Feeds."); }) : null;
  const refusal = order.length ? await roomFor(actor, order.length) : null;
  if (refusal) throw new Error(refusal);
  if (!order.length && !dashboard && !workflow) throw new Error("Pick something to set up.");

  // Made in order: the Workflow, the Metrics (inputs first), their Submitters, the dashboard. All of it was checked;
  // only a Metric made by someone else at the same moment can still meet the limit, and then the words say what was
  // made before it stopped.
  const made = new Map<string, PackSetupResult["metrics"][number]>();
  const tagsLeftOut: PackSetupResult["tagsLeftOut"] = [];
  let workflowId: number | null = null;
  let dashboardId: number | null = null;
  try {
    workflowId = workflow ? await createWorkflowFromTemplate(actor, { template: workflow.template.id, name: workflow.name, approvers: workflow.approvers }) : null;
    for (const e of [...plain, ...derived]) {
      const m = await createMetric(actor, {
        name: e.name, description: e.description, unit: e.unit, unitPosition: e.unit_position, format: e.format, decimals: e.decimals, period: e.period,
        submissionRule: e.submission_rule, polarity: e.polarity, aggregation: e.aggregation, targetMin: e.target_min, targetMax: e.target_max,
        // A Derived Metric takes no values, so no Source and no Workflow.
        sources: e.formula ? [] : e.sources, fromCatalogId: e.id, workflowId: e.formula ? null : workflowId,
      });
      // The entry's Tags were put on it by createMetric, as this person; a limit leaves words out, never the Metric.
      if (m.tagsLeftOut.length) tagsLeftOut.push({ metric: e.name, tags: m.tagsLeftOut });
      if (e.formula) await writeFormula(actor, { ...m, name: e.name }, withSlugs(e.formula, (k) => made.get(k)!.slug));
      made.set(e.pack_key, { id: m.id, slug: m.slug, name: e.name, key: e.pack_key, takesValues: !e.formula });
    }
    if (submitters.length) for (const e of plain) await addSubmitters(actor, made.get(e.pack_key)!.id, submitters);
    if (feed) for (const e of plain) await addFeedToMetric(actor, made.get(e.pack_key)!.id, feed);
    dashboardId = dashboard
      ? await createDashboardFromTemplate(actor, { template: dashboard.template.id, name: dashboard.name, fills: dashboard.fills.map((f) => (typeof f === "string" ? [made.get(f)!.id] : f)) })
      : null;
  } catch (e) {
    const so = [...[...made.values()].map((m) => m.name), ...(workflowId !== null ? ["the Workflow"] : [])];
    // Only Ziffr's own words reach a person; anything else (a database's or a provider's text) goes to the log.
    if (!wordsForPeople(e)) console.error("Set up from a Pack stopped:", e);
    const why = wordsForPeople(e) ?? "Setting up stopped on something unexpected.";
    throw new Error(`${why}${so.length ? ` Made before it stopped: ${so.join(", ")}.` : ""}`);
  }
  await audit(actor, { kind: "pack.set_up", object: { type: "pack", id: p.install.id, name: p.install.name }, details: { version: p.install.version, metrics: made.size, dashboard: dashboardId !== null, workflow: workflowId !== null, feed: feed !== null } });
  return { metrics: [...made.values()], dashboardId, workflowId, tagsLeftOut };
}

/** A formula of a Pack's entries ({key}) with each key replaced by a Metric's slug. */
export function withSlugs(formula: string, slug: (key: string) => string): string {
  return formula.replace(/\{([a-z0-9-]+)\}/g, (_all, k: string) => `{${slug(k)}}`);
}

// Refuses anyone who is not a member of the actor's Workspace.
async function assertMembers(actor: Actor, ids: string[]) {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return;
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).in("user_id", wanted);
  const found = new Set((data ?? []).map((m) => m.user_id as string));
  if (!wanted.every((id) => found.has(id))) throw new Forbidden("Pick members of this Workspace.");
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
