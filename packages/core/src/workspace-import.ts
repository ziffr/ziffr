// Importing a Workspace Export into a new Workspace (spec 0040, ticket 9; GLOSSARY: Workspace Export, Workspace Key,
// Import, Invitation): a job that reads the file twice. The first pass checks all of it, writing nothing: every line
// against the format, the sizes and counts against what this Installation allows. The second creates the Workspace,
// marked as importing, and writes into it through the core's ordinary operations, so every rule of the app applies and
// everything sensitive is sealed again under the new Workspace's own key; no ciphertext, wrapped key or key id is in
// the file or reaches it. A failure at any point deletes the Workspace with its key, so nothing half-made is left.
// Security: the file is untrusted whoever made it (AGENTS rule 4). The reader stops at the first problem and lets go
// of the input however reading ends. A label of the file is never a database id: it is replaced through a map that
// throws on a label it does not hold and never falls back to the label itself. Nothing from the file reaches a query
// as anything but a bound value; its names and titles are kept as data (the pages escape them, the emails quote them
// after fixed text). The job runs only on an Installation that is not hosted Ziffr, for a person who may make a
// Workspace, one at a time per person and two at a time on an Installation; the file is read from a temporary file the
// upload route wrote within the size limit, which is deleted however the job ends.
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";
import { db } from "./db";
import type { Actor } from "./actor";
import { audit } from "./audit-log";
import { hostedByCloud } from "./installation-days";
import { settingsInEffect } from "./settings-in-effect";
import { sendingLimit } from "./sending-limit";
import { assertMayOwnDefault, defaultLimitFrom } from "./workspace-limits";
import { destroyWorkspaceKeys, ensureWorkspaceKey, workspaceCipher } from "./workspace-keys";
import { readWorkspaceExport, WorkspaceExportProblem, DEFAULT_READER_LIMITS } from "./workspace-export-file";
import { knownTimeZone, setWorkspaceClock, workspaceClock } from "./workspace-clock";
import { setYearStart } from "./fiscal-year";
import { setAttainmentMethod } from "./workspace-settings";
import { STARTER_THEME } from "./themes";
import { addThemeFromFile, MAX_WORKSPACE_THEMES } from "./workspace-themes";
import { createGroup, setGroupMember } from "./team";
import { addSubmitters, createMetric, saveSeriesRows, type MetricEffects } from "./metrics";
import { setMetricTags } from "./tags";
import { shareWithGroup } from "./sharing";
import { createDashboardFromBody } from "./dashboard-templates";
import { dashboardTemplateFromFile, templateSlots } from "./dashboard-template-file";
import { deckTemplateFromFile } from "./deck-template-file";
import { workflowTemplateFromFile } from "./workflow-template-file";
import { createDeck, setDeckTheme } from "./decks";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { writeFormula, withSlugs } from "./pack-setup";
import { emptyPlan, holdInvitation, type ImportPlan } from "./workspace-import-people";
import { reserveIds } from "./sealed-columns";
import { planRows, written } from "./record-value";
import type { WorkspaceExportReaderLimits, WorkspaceExportRecord, HeaderRecord, MetricRecord, ValueRecord } from "@ziffr/pack/workspace-export";
import type { WorkflowConfig } from "./types";

/** The most imports running on one Installation at once: each holds a file open and writes for minutes. */
export const MAX_RUNNING_IMPORTS = 2;
/** Seconds without a sign of life after which a running import is taken for dead (its process stopped) and undone. */
export const STALE_SECONDS = 120;
/** Values written in one batch. */
const VALUE_BATCH = 500;
/** Target and Projection rows saved in one call (the operation takes at most 2,000). */
const SERIES_BATCH = 2000;

/** A problem with the file or with what this Installation allows, in words for the person, with its line when it has one. */
export class ImportProblem extends Error {
  constructor(message: string, readonly line: number | null = null) {
    super(message);
    this.name = "ImportProblem";
  }
}

/** Labels of one kind of record and what each became. `need` throws on a label that was never set: a label is never
 * used as an id, and a missing one is a problem of the file, never a value to fall back to. */
export class Labels<T> {
  private readonly rows = new Map<string, T>();
  constructor(private readonly what: string) {}
  /** Remembers what a label became; a label is listed once. */
  set(label: string, value: T): void {
    if (this.rows.has(label)) throw new ImportProblem(`The ${this.what} “${label}” is listed twice.`);
    this.rows.set(label, value);
  }
  /** What a label became, or a problem: the file names something it never listed. */
  need(label: string): T {
    if (!this.rows.has(label)) throw new ImportProblem(`The file names the ${this.what} “${label}”, which it never lists.`);
    return this.rows.get(label)!;
  }
  /** Everything remembered, in the order it was set. */
  all(): IterableIterator<T> {
    return this.rows.values();
  }
}

/** The reader's sizes: the defaults, lowered or raised by ZIFFR_IMPORT_MAX_FILE_MB and ZIFFR_IMPORT_MAX_TEXT_MB. */
export function importLimits(env: Record<string, string | undefined> = process.env): WorkspaceExportReaderLimits {
  const mb = (name: string, fallback: number) => {
    const n = Number(env[name]);
    return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n * 1024 * 1024 : fallback;
  };
  return { fileBytes: mb("ZIFFR_IMPORT_MAX_FILE_MB", DEFAULT_READER_LIMITS.fileBytes), textBytes: mb("ZIFFR_IMPORT_MAX_TEXT_MB", DEFAULT_READER_LIMITS.textBytes) };
}

/** Whether this Installation takes imports: any that is not hosted Ziffr (a new Workspace there is a trial). */
export const importOffered = (env: Record<string, string | undefined> = process.env): boolean => !hostedByCloud(env);

/** What an import did, as counts the progress page shows. Never a name or a number from the file. */
export type ImportCounts = Partial<Record<"groups" | "themes" | "people" | "metrics" | "dashboards" | "decks" | "workflows" | "shares" | "targets" | "projections" | "values", number>> & {
  /** Values of Derived Metrics, which are computed and take none. */
  derivedValuesSkipped?: number;
  /** Tags a limit kept off their Metric. */
  tagsLeftOut?: number;
};

/** An import as the progress page reads it. */
export type ImportStatus = {
  id: string;
  status: "checking" | "importing" | "done" | "failed";
  step: string;
  workspaceName: string | null;
  recordsDone: number;
  recordsTotal: number | null;
  counts: ImportCounts;
  problem: string | null;
  workspaceId: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type JobRow = { id: string; workspace_id: string | null; created_by: string; status: ImportStatus["status"]; step: string; workspace_name: string | null; records_done: number; records_total: number | null; counts: ImportCounts; problem: string | null; started_at: string; updated_at: string; finished_at: string | null };

const statusOf = (r: JobRow): ImportStatus => ({
  id: r.id, status: r.status, step: r.step, workspaceName: r.workspace_name, recordsDone: Number(r.records_done), recordsTotal: r.records_total === null ? null : Number(r.records_total),
  counts: r.counts ?? {}, problem: r.problem, workspaceId: r.status === "done" ? r.workspace_id : null, startedAt: r.started_at, finishedAt: r.finished_at,
});

/** The words of a failure that are Ziffr's own, or null: a file's problem, a limit or a refusal. Anything else (a
 * database's text) goes to the log and never to the page. */
function wordsOf(e: unknown): string | null {
  if (e instanceof ImportProblem) return `${e.line ? `Line ${e.line}: ` : ""}${e.message}`;
  if (e instanceof WorkspaceExportProblem) return e.message;
  if (e instanceof Error && e.message && (Object.getPrototypeOf(e) === Error.prototype || ["Forbidden", "LimitReached", "MetricKept", "DefaultWorkspaceTaken", "WorkflowRefused"].includes(e.name))) return e.message;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Starting a job and reading its state.

/** Refuses before a file is taken when this person may not import now: hosted Ziffr, a person who may not make a
 * Workspace, one import running already, or the Installation's limit of them. The upload route asks this first, so
 * nothing is written to disk for a person who would be refused. Words for the person. */
export async function assertMayImport(personId: string): Promise<void> {
  if (!importOffered()) throw new Error("A new Workspace on hosted Ziffr is a trial: import a Workspace Export on an Installation of your own.");
  await assertMayOwnDefault(personId);
  await endStaleImports();
  const { data: mine } = await db().from("workspace_imports").select("id").eq("created_by", personId).in("status", ["checking", "importing"]).limit(1);
  if (mine?.length) throw new Error("You are importing a Workspace already. Wait for it to finish.");
  const { count } = await db().from("workspace_imports").select("id", { count: "exact", head: true }).in("status", ["checking", "importing"]);
  if ((count ?? 0) >= MAX_RUNNING_IMPORTS) throw new Error("This Ziffr is importing as many Workspaces as it does at once. Try again in a few minutes.");
}

/** Starts an import of the file at `path` for a person, who becomes the Owner of the new Workspace, and answers at once
 * with the job's id and a promise that settles when the job ends (the upload route ignores it; tests wait for it). The
 * file at `path` is deleted when the job ends, whatever the outcome. Refused where hosted, when the person already has
 * an import running, when the Installation runs its limit of them, and where the person may not make a Workspace. */
export async function startWorkspaceImport(personId: string, path: string, options: { limits?: WorkspaceExportReaderLimits } = {}): Promise<{ id: string; done: Promise<void> }> {
  const refuse = async (message: string): Promise<never> => {
    await rm(path, { force: true });
    throw new Error(message);
  };
  try {
    await assertMayImport(personId);
  } catch (e) {
    await rm(path, { force: true });
    throw e;
  }
  // Claimed in one locked database step with the limits, so people starting at once cannot all pass them.
  const { data, error } = await db().rpc("start_workspace_import", { p_person: personId, p_max: MAX_RUNNING_IMPORTS, p_temp: path.slice(0, 300) }).single<{ job: string | null; refused: string | null }>();
  if (error) return refuse("The import could not be started.");
  if (data.refused === "mine") return refuse("You are importing a Workspace already. Wait for it to finish.");
  if (data.refused === "busy" || !data.job) return refuse("This Ziffr is importing as many Workspaces as it does at once. Try again in a few minutes.");
  const id = data.job;
  return { id, done: runImport(id, personId, path, options.limits ?? importLimits()) };
}

/** The state of an import of this person, for the progress page, or null when it is not theirs. A running import that
 * has shown no sign of life for a while is ended and undone first: its process stopped. */
export async function importStatus(personId: string, id: string): Promise<ImportStatus | null> {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  await endStaleImports();
  const { data } = await db().from("workspace_imports").select("*").eq("id", id).eq("created_by", personId).maybeSingle();
  return data ? statusOf(data as JobRow) : null;
}

/** The person's latest import, for the New Workspace page to point to one that runs. */
export async function latestImport(personId: string): Promise<ImportStatus | null> {
  await endStaleImports();
  const { data } = await db().from("workspace_imports").select("*").eq("created_by", personId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data ? statusOf(data as JobRow) : null;
}

/** Removes the upload of a job, only when its path has the form this module gives them, under the temporary folder. */
async function removeUpload(path: unknown): Promise<void> {
  if (typeof path !== "string" || dirname(path) !== tmpdir() || !/^ziffr-import-[0-9a-f-]{36}$/.test(basename(path))) return;
  await rm(path, { force: true });
}

/** Ends imports of any person whose process stopped (no sign of life for STALE_SECONDS), undoes what they made and
 * removes their upload; and tries again to undo a failed import whose half-made Workspace is still there (its key could
 * not be destroyed then). */
async function endStaleImports(): Promise<void> {
  const before = new Date(Date.now() - STALE_SECONDS * 1000).toISOString();
  const { data } = await db().from("workspace_imports").select("id, workspace_id, temp_path").in("status", ["checking", "importing"]).lt("updated_at", before);
  for (const j of data ?? []) {
    // Claimed by the update, so two readers do not both undo it.
    const { data: claimed } = await db().from("workspace_imports").update({ status: "failed", problem: "The import stopped before it finished (the server was restarted). Nothing was kept.", finished_at: new Date().toISOString() }).eq("id", j.id).in("status", ["checking", "importing"]).lt("updated_at", before).select("id");
    if (!claimed?.length) continue;
    await removeUpload(j.temp_path);
    if (j.workspace_id) await undoWorkspace(j.workspace_id as string).catch((e) => console.error("A stopped import could not be undone:", (e as Error)?.name));
  }
  const { data: left } = await db().from("workspace_imports").select("workspace_id").eq("status", "failed").not("workspace_id", "is", null).limit(20);
  for (const j of left ?? []) await undoWorkspace(j.workspace_id as string).catch((e) => console.error("A failed import could not be undone:", (e as Error)?.name));
}

/** Deletes a Workspace that is being imported, with its key and the person rows made for it. Only one marked importing. */
async function undoWorkspace(workspaceId: string): Promise<void> {
  const { data: marked } = await db().from("workspaces").select("id").eq("id", workspaceId).not("importing_at", "is", null).maybeSingle();
  if (!marked) return;
  await destroyWorkspaceKeys(workspaceId);
  const { error } = await db().from("workspaces").delete().eq("id", workspaceId).not("importing_at", "is", null);
  if (error) throw new Error("The half-made Workspace could not be deleted.");
}

// ---------------------------------------------------------------------------------------------------------------------
// The job.

/** Keeps the job row current, at most every second or so, and as a sign of life. */
function progressWriter(id: string) {
  let last = 0;
  let pending: Promise<unknown> = Promise.resolve();
  return {
    /** Writes `patch` now (a step changed) or, when `soft`, only if a second has passed. */
    async write(patch: Record<string, unknown>, soft = false): Promise<void> {
      if (soft && Date.now() - last < 1000) return;
      last = Date.now();
      pending = pending.then(() => db().from("workspace_imports").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).in("status", ["checking", "importing"]));
      await pending;
    },
  };
}

/** The whole job: check, create, write, finish, or undo and say why. Never throws: the job row says how it ended. */
async function runImport(id: string, personId: string, path: string, limits: WorkspaceExportReaderLimits): Promise<void> {
  const job = progressWriter(id);
  // A heartbeat, so a long step that writes no record is not taken for a dead job.
  const beat = setInterval(() => void job.write({}).catch(() => undefined), 20_000);
  let workspaceId: string | null = null;
  try {
    const checked = await checkPass(path, limits, job);
    await job.write({ status: "importing", step: "Creating the Workspace", records_done: 0, records_total: checked.records, workspace_name: checked.header.workspace.name });
    workspaceId = await createPlace(personId, checked.header);
    await job.write({ workspace_id: workspaceId });
    const counts = await writePass(path, limits, personId, workspaceId, checked.header, job);
    // Done: the Workspace stops being marked and appears in the Owner's list.
    const { error } = await db().from("workspaces").update({ importing_at: null }).eq("id", workspaceId);
    if (error) throw new Error("The Workspace could not be opened for use.");
    await audit({ personId, workspaceId, role: "owner" }, { kind: "workspace.imported", object: { type: "workspace", id: workspaceId }, details: { ...counts } });
    await db().from("workspace_imports").update({ status: "done", step: "Done", counts, records_done: checked.records, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).in("status", ["checking", "importing"]);
  } catch (e) {
    const words = wordsOf(e);
    if (!words) console.error("A Workspace import stopped on something unexpected:", (e as Error)?.name, (e as { code?: string })?.code);
    if (workspaceId) await undoWorkspace(workspaceId).catch((u) => console.error("A failed import could not be undone:", (u as Error)?.name));
    await db().from("workspace_imports").update({ status: "failed", problem: (words ?? "The import stopped on something unexpected. Nothing was kept.").slice(0, 600), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).in("status", ["checking", "importing"]);
  } finally {
    clearInterval(beat);
    await rm(path, { force: true });
  }
}

/** Reads a file from its path as records, within the sizes. The reader lets go of the file however reading ends. */
const records = (path: string, limits: WorkspaceExportReaderLimits) => readWorkspaceExport(createReadStream(path), limits);

// ---------------------------------------------------------------------------------------------------------------------
// Pass one: check everything, write nothing.

/** The first pass: every line is checked by the reader (stopping at the first problem), then what only this
 * Installation knows: the time zone by its database too, and the counts against its limits. Returns the header and the number of lines. */
async function checkPass(path: string, limits: WorkspaceExportReaderLimits, job: ReturnType<typeof progressWriter>): Promise<{ header: HeaderRecord; records: number }> {
  let header: HeaderRecord | null = null;
  let lines = 0;
  const counts = { persons: 0, metrics: 0, themes: 0 };
  for await (const { record, line } of records(path, limits)) {
    lines = line;
    if (record.kind === "header") header = record;
    else if (record.kind === "person") counts.persons++;
    else if (record.kind === "metric") counts.metrics++;
    else if (record.kind === "theme") counts.themes++;
    await job.write({ records_done: line }, true);
  }
  if (!header) throw new ImportProblem("The file has no header.", 1);
  const zone = header.workspace.timeZone;
  if (zone !== undefined) {
    // Node's list and Postgres's differ for a few names; the Workspace's time is kept by the database.
    const { data } = await db().rpc("timezone_known", { p_name: zone });
    if (!knownTimeZone(zone) || data !== true) throw new ImportProblem(`The time zone “${zone}” is not one this Installation knows.`, 1);
  }
  const limit = defaultLimitFrom(await settingsInEffect()).metrics;
  if (limit !== null && counts.metrics > limit) throw new ImportProblem(`The file holds ${counts.metrics.toLocaleString("en")} Metrics, and this Installation's Workspace Limit is ${limit.toLocaleString("en")}. Raise the limit or export fewer Metrics.`);
  if (counts.themes > MAX_WORKSPACE_THEMES - 1) throw new ImportProblem(`The file holds ${counts.themes} Themes; a Workspace keeps at most ${MAX_WORKSPACE_THEMES - 1} besides its starting Theme.`);
  const most = await sendingLimit("contactsPerWorkspace");
  if (counts.persons > most) throw new ImportProblem(`The file lists ${counts.persons.toLocaleString("en")} people; this Installation holds at most ${most.toLocaleString("en")} for a Workspace.`);
  return { header, records: lines };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pass two: the Workspace and what goes into it.

/** Makes the Workspace, marked importing, with its Owner, its key and the starting Theme: what createWorkspace makes,
 * and not shown to anyone until the job ends. The key is made before anything is written to it. */
async function createPlace(personId: string, header: HeaderRecord): Promise<string> {
  const { data: ws, error } = await db().from("workspaces").insert({ name: header.workspace.name, importing_at: new Date().toISOString() }).select("id").single();
  if (error || !ws) throw new Error("The Workspace could not be created.");
  const id = ws.id as string;
  try {
    const { error: e1 } = await db().from("memberships").insert({ workspace_id: id, user_id: personId, role: "owner" });
    if (e1) throw new Error("The Workspace could not be created.");
    // Its own key, never one carried by the file: everything written from here on is sealed under it.
    await ensureWorkspaceKey(id);
    await db().from("themes").insert({ ...STARTER_THEME, owner_id: personId, is_default: true, workspace_id: id });
  } catch (e) {
    await undoWorkspace(id).catch(() => undefined);
    throw e;
  }
  return id;
}

/** What the import knows of a Metric it made. */
type MadeMetric = { id: number; slug: string; derived: boolean; polarity: string; rule: string };
/** What the import knows of a person of the file: the Owner themself, or a held invitation. */
type Person = { self: boolean; role: "admin" | "member" | "guest"; email: string; plan: ImportPlan; groups: string[] };

/** The second pass: writes the records in the order the file lists them. Returns what was made. */
async function writePass(path: string, limits: WorkspaceExportReaderLimits, personId: string, workspaceId: string, header: HeaderRecord, job: ReturnType<typeof progressWriter>): Promise<ImportCounts> {
  const actor: Actor = { personId, workspaceId, role: "owner" };
  const counts: ImportCounts = {};
  const bump = (k: keyof ImportCounts, n = 1) => void (counts[k] = (counts[k] ?? 0) + n);
  const { data: me } = await db().from("profiles").select("email").eq("id", personId).maybeSingle();
  const myEmail = typeof me?.email === "string" ? me.email.trim().toLowerCase() : "";

  const groups = new Labels<number>("Group");
  const themes = new Labels<number>("Theme");
  const people = new Labels<Person>("person");
  const metrics = new Labels<MadeMetric>("Metric");
  const dashboards = new Labels<number>("dashboard");
  const decks = new Labels<number>("deck");
  const workflows = new Labels<number>("Workflow");
  const keys = new Map<string, string>();
  const formulas: { id: number; name: string; formula: string }[] = [];
  const noEffects: MetricEffects = { recordCreated: async () => undefined, promptSubmitter: async () => undefined };
  const objectOf = (kind: "dashboard" | "deck" | "metric", label: string): number => (kind === "dashboard" ? dashboards.need(label) : kind === "deck" ? decks.need(label) : metrics.need(label).id);

  // The Workspace's settings first: the year start decides where periods begin, and cannot change once Metrics exist.
  const w = header.workspace;
  if (w.yearStart !== undefined && w.yearStart !== 1) await setYearStart(actor, w.yearStart);
  if (w.timeZone !== undefined) await setWorkspaceClock(actor, { timeZone: w.timeZone, runHour: (await workspaceClock(actor)).runHour });
  if (w.attainmentMethod !== undefined) await setAttainmentMethod(actor, w.attainmentMethod);

  const writeFormulas = async () => {
    for (const f of formulas.splice(0)) await writeFormula(actor, { id: f.id, name: f.name }, withSlugs(f.formula, (k) => keys.get(k) ?? "-"));
  };
  const series = new SeriesBuffer(actor);
  const values = new ValueWriter(workspaceId);

  const apply = async (r: WorkspaceExportRecord): Promise<void> => {
    switch (r.kind) {
      case "header":
      case "end":
        return;
      case "group":
        groups.set(r.id, await createGroup(actor, r.name));
        return bump("groups");
      case "theme":
        themes.set(r.id, (await addThemeFromFile(actor, r.theme, "Imported from a Workspace Export")).id);
        return bump("themes");
      case "person": {
        // The person who imports is the Owner already: never invited, they own what the file says they owned.
        const self = r.email.trim().toLowerCase() === myEmail && myEmail !== "";
        people.set(r.id, { self, role: r.role, email: r.email, plan: emptyPlan(r.name), groups: r.groups ?? [] });
        return bump("people");
      }
      case "metric":
        return metric(r);
      case "dashboard": {
        await writeFormulas();
        const t = dashboardTemplateFromFile(r.dashboard);
        const fills = r.slots.map((list) => list.map((l) => metrics.need(l).id));
        dashboards.set(r.id, await createDashboardFromBody(actor, { name: r.dashboard.name, slots: t.slots, body: t.body }, r.dashboard.name, fills, "Imported from a Workspace Export"));
        return bump("dashboards");
      }
      case "deck": {
        // A deck's slides are laid out by the editor from today's values, as for any Deck Template: the deck is made
        // empty with the template and its fills beside it, and its first opening lays it out.
        const themeId = r.theme === undefined ? null : themes.need(r.theme);
        const fills = r.slots.map((list) => list.map((l) => metrics.need(l).id));
        const body = deckTemplateFromFile(r.deck, new Map(), themeId);
        const { data: tpl, error } = await db().from("team_templates").insert({ name: r.deck.name.slice(0, 80), description: "", kind: "deck", view: "deck", slots: templateSlots(r.deck.slots), body, w: 0, h: 0, owner_id: personId, workspace_id: workspaceId }).select("id").single();
        if (error || !tpl) throw new Error("A deck could not be kept.");
        const deckId = await createDeck(actor, r.deck.name);
        if (themeId !== null) await setDeckTheme(actor, deckId, themeId);
        await db().from("decks").update({ document: { importSeed: { template: tpl.id, fills } } }).eq("id", deckId).eq("workspace_id", workspaceId);
        decks.set(r.id, deckId);
        return bump("decks");
      }
      case "workflow": {
        const body = workflowTemplateFromFile(r.workflow);
        // The file holds how many Approvers there are, never who: until people join, the Owner approves.
        const config: WorkflowConfig = { dueWorkingDays: body.dueWorkingDays, steps: body.steps.map((s) => (s.type === "approve" ? { type: "approve" as const, approvers: [personId], values: s.values ?? "unusual", ...(s.nobodyElse ? { nobodyElse: s.nobodyElse } : {}) } : s)) };
        const id = await saveWorkflow(actor, null, r.workflow.name, config, { message: "Imported from a Workspace Export" });
        workflows.set(r.id, id);
        for (const l of r.metrics) {
          const m = metrics.need(l);
          if (!m.derived) await setMetricWorkflow(actor, m.id, id);
        }
        return bump("workflows");
      }
      case "share": {
        const id = objectOf(r.of.kind, r.of.id);
        if (r.with.kind === "group") await shareWithGroup(actor, r.of.kind, id, groups.need(r.with.id), "viewer");
        else {
          const p = people.need(r.with.id);
          // Nothing is shared with the Owner: they own it. Everyone else gets it when they join.
          if (!p.self) p.plan.shares.push({ type: r.of.kind, id });
        }
        return bump("shares");
      }
      case "target":
      case "projection": {
        await values.flush();
        const m = metrics.need(r.metric);
        // A Target Series point is one number: the upper end for a Metric where lower is better, the lower end otherwise.
        const v = r.kind === "projection" ? r.value : m.polarity === "lower" ? (r.max ?? r.min) : (r.min ?? r.max);
        await series.add(r.kind, r.metric, m.id, r.period, v as number);
        return bump(r.kind === "target" ? "targets" : "projections");
      }
      case "value": {
        await series.flush();
        const m = metrics.need(r.metric);
        // A Derived Metric is computed: a file that carries values for one has them left out, and says so.
        if (m.derived) return bump("derivedValuesSkipped");
        await values.add(m.id, r);
        return bump("values");
      }
    }
  };

  const metric = async (r: MetricRecord) => {
    const f = r.metric;
    const derived = f.formula !== undefined;
    if (keys.has(r.key)) throw new ImportProblem(`The Metric key “${r.key}” is listed twice.`);
    const made = await createMetric(actor, {
      name: f.name, description: f.description ?? "", unit: f.unit ?? "", unitPosition: f.unitPosition, format: f.valueFormat, decimals: f.decimals, period: f.period,
      submissionRule: f.submissionRule, polarity: f.polarity, aggregation: f.aggregation, targetMin: f.targetMin ?? null, targetMax: f.targetMax ?? null,
      attainmentMethod: f.attainmentMethod ?? null,
      // A Derived Metric takes no values, so no Source.
      sources: derived ? [] : f.sources,
    }, noEffects);
    keys.set(r.key, made.slug);
    // The Owner owns every Metric: the file's owner is applied when that person joins (never a Guest).
    metrics.set(r.id, { id: made.id, slug: made.slug, derived, polarity: f.polarity, rule: f.submissionRule ?? "overwrite" });
    if (derived) formulas.push({ id: made.id, name: f.name, formula: f.formula! });
    if (r.tags?.length) {
      try {
        await setMetricTags(actor, made.id, r.tags);
      } catch {
        bump("tagsLeftOut", r.tags.length);
      }
    }
    const submitters: string[] = [];
    for (const label of r.submitters ?? []) {
      const p = people.need(label);
      if (p.self) submitters.push(personId);
      else p.plan.submits.push(made.id);
    }
    if (submitters.length && !derived) await addSubmitters(actor, made.id, submitters, noEffects);
    if (r.owner !== undefined) {
      const o = people.need(r.owner);
      if (!o.self && o.role !== "guest") o.plan.owns.push(made.id);
    }
    bump("metrics");
  };

  let done = 0;
  for await (const { record, line } of records(path, limits)) {
    if (record.kind !== "metric") await writeFormulas();
    await apply(record);
    if (++done % 50 === 0) await job.write({ step: stepOf(record.kind), records_done: line }, true);
  }
  await writeFormulas();
  await series.flush();
  await values.flush();

  // The people last: their plans are complete. The Owner themself joins their Groups now; everyone else is a held invitation.
  await job.write({ step: "Keeping the people as invitations", counts });
  for (const p of people.all()) {
    for (const g of p.groups) {
      if (p.self) await setGroupMember(actor, groups.need(g), personId, true);
      else p.plan.groups.push(groups.need(g));
    }
    if (!p.self) await holdInvitation(workspaceId, personId, p, p.plan);
  }
  return counts;
}

/** The words of the step a kind of record belongs to, for the progress page. */
const stepOf = (kind: WorkspaceExportRecord["kind"]): string =>
  ({ header: "Reading the file", group: "Groups", theme: "Themes", person: "People", metric: "Metrics", dashboard: "Dashboards", deck: "Decks", workflow: "Workflows", share: "Shares", target: "Targets", projection: "Projections", value: "Values", end: "Finishing" })[kind];

/** Target Series or Projection points of one Metric, held until a call can take them, in rising order as the file lists them. */
class SeriesBuffer {
  private held: { kind: "target" | "projection"; label: string; id: number; rows: { period: string; value: number }[] } | null = null;
  constructor(private readonly actor: Actor) {}
  async add(kind: "target" | "projection", label: string, id: number, period: string, value: number): Promise<void> {
    if (this.held && (this.held.kind !== kind || this.held.label !== label || this.held.rows.length >= SERIES_BATCH)) await this.flush();
    this.held ??= { kind, label, id, rows: [] };
    this.held.rows.push({ period, value });
  }
  async flush(): Promise<void> {
    const h = this.held;
    this.held = null;
    if (h?.rows.length) await saveSeriesRows(this.actor, h.id, h.kind, h.rows, "Imported from a Workspace Export");
  }
}

/** Values written in batches, each sealed for its row under the Workspace's key as every value is, as Imports. */
class ValueWriter {
  private rows: { metric: number; r: ValueRecord }[] = [];
  constructor(private readonly workspaceId: string) {}
  async add(metric: number, r: ValueRecord): Promise<void> {
    this.rows.push({ metric, r });
    if (this.rows.length >= VALUE_BATCH) await this.flush();
  }
  async flush(): Promise<void> {
    const batch = this.rows.splice(0);
    if (!batch.length) return;
    const cipher = await workspaceCipher(this.workspaceId);
    const ids = await reserveIds("observations", batch.length);
    const parts = batch.reduce((n, b) => n + (b.r.breakdown?.length ?? 0), 0);
    const partIds = parts ? await reserveIds("breakdown_rows", parts) : [];
    let next = 0;
    const observations = batch.map((b, i) => ({
      id: ids[i], metric_id: b.metric, period_start: b.r.period, ...written(cipher, "observations", ids[i], b.r.value),
      // Every value is an Import (history), whatever Source the file says.
      submitter_id: null, source: "web_form", imported: true, created_at: b.r.recordedAt ?? new Date().toISOString(),
      // Who sent it stays as a name, sealed for the value's row (an id of the old Workspace would mean nothing here).
      submitted_by_name: b.r.submittedBy === undefined ? null : cipher.seal({ table: "observations", column: "submitted_by_name", row: ids[i] }, b.r.submittedBy),
    }));
    const { error } = await db().from("observations").insert(observations);
    if (error) throw new Error("Values could not be written.");
    const breakdown = batch.flatMap((b, i) => {
      if (!b.r.breakdown?.length) return [];
      const planned = planRows(cipher, false, [], b.r.breakdown, partIds.slice(next, (next += b.r.breakdown.length)));
      return planned.map((p, position) => ({ id: p.id, observation_id: ids[i], label: p.label, label_index: p.index, value: p.value, value_sealed: p.value_sealed, position }));
    });
    for (let i = 0; i < breakdown.length; i += 1000) {
      const { error: e2 } = await db().from("breakdown_rows").insert(breakdown.slice(i, i + 1000));
      if (e2) throw new Error("Values could not be written.");
    }
  }
}

