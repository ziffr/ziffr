// A Metric Record (spec 0065; GLOSSARY: Metric Record, Metric, Metric Owner, Observation, Breakdown, Target Series,
// Projection, Question, Task, Audit Log): everything Ziffr keeps about some Metrics, as CSV files in one ZIP, which
// their Metric Owner downloads before deleting them. The download is written in the Audit Log with a fingerprint of
// what it held, and the deletion asks for that fingerprint again, so it is allowed only while nothing changed.
// Visibility: only the Metric Owner gets it, and of it only what they may see (an input of a formula or a part of a
// Total that is not theirs to see stays unnamed; calculated numbers are what the app shows them).
import { noteEntries, noteThreads, wordsShown } from "./value-note-store";
import { createHash } from "node:crypto";
import { getCanvasData, visibleMetricIds } from "./access";
import { Forbidden, Refused, type Actor } from "./actor";
import { auditOrRefuse } from "./audit-log";
import { condensedFor } from "./condensed-values";
import { inCondensed, partOfCondensed, valueOfParts } from "./condensed-parts";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { spreadsheetCells } from "./spreadsheet-cells";
import { formulaInputs, withoutUnseenInputs } from "./formula";
import { DELETE_METRICS } from "./metric-delete-rules";
import type { NumberStyle } from "./number-style";
import { openNames, openRows } from "./sealed-columns";
import { tagSight } from "./tag-sight";
import { readParts } from "./total-parts";
import { countsFromFirstValue } from "./total-rules";
import type { Aggregation, Metric } from "./types";
import { valueStateWords } from "./value-state";
import { allRows, getMetrics, mustRead } from "./workspace-data";
import { numberStyleOf } from "./workspace-settings";
import { zipFile } from "./zip";

/** The most values, replaced ones included, one Metric Record holds; over it the person picks fewer Metrics. Nothing is
 * ever cut short. */
export const RECORD_ROWS = 500_000;
/** How long a download unlocks the deletion, in hours, while what it held is unchanged. */
export const RECORD_HOURS = 24;

const UNREAD = "The record could not be read whole, so nothing was made. Try again in a moment.";
const AT_A_TIME = 500;
/** Spreadsheets need it to read a CSV file as UTF-8; the same mark every CSV file Ziffr hands out starts with. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

type Row = Record<string, unknown>;

/** One CSV file of a record. */
export type RecordFile = { name: string; text: string };
/** One Metric of a record: its files, the fingerprint of their contents, and one of only what is stored for it and
 * would be lost with it (its values, targets, Projections and conversations, not its settings or calculated numbers). */
export type RecordedMetric = { id: number; name: string; folder: string; files: RecordFile[]; digest: string; stored: string };
/** The record of a set of Metrics: each of them, one fingerprint of exactly this set, and how many values it holds. */
export type MetricRecord = { metrics: RecordedMetric[]; digest: string; rows: number };

const sha = (parts: unknown) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

/** The Metrics asked for, if the actor may have their record: a person (never a key, never in the demo) who is the
 * Metric Owner of every one of them. Ids come from a browser and are untrusted. */
export async function ownedForRecord(actor: Actor, ids: readonly number[]): Promise<Metric[]> {
  if (actor.key || !actor.personId) throw new Forbidden();
  refuseInDemo(actor);
  const wanted = Array.isArray(ids) ? [...new Set(ids)] : [];
  if (!wanted.length || wanted.length > DELETE_METRICS || !wanted.every((id) => Number.isSafeInteger(id))) throw new Refused(`Pick between 1 and ${DELETE_METRICS} Metrics.`);
  const { data: member } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  if (!member) throw new Forbidden();
  const all = await getMetrics(actor.workspaceId);
  const mine = all.filter((m) => wanted.includes(m.id) && m.owner_id === actor.personId).sort((a, b) => a.id - b.id);
  if (mine.length !== wanted.length) throw new Forbidden("Only a Metric's owner downloads its record to delete it.");
  return mine;
}

/** Refuses a record too large to make at once, counted by the database before any value is read. */
async function assertFits(ws: string, ids: number[]): Promise<void> {
  const counts = await Promise.all(["observations", "observation_history"].map(async (table) => {
    const { count, error } = await db().from(table).select("id", { count: "exact", head: true }).eq("workspace_id", ws).in("metric_id", ids);
    if (error || count === null) throw new Error(UNREAD);
    return count;
  }));
  if (counts.reduce((a, b) => a + b, 0) > RECORD_ROWS) throw new Refused("There are too many values for one record. Pick fewer Metrics and delete them in parts.");
}

/** Every row of a table for these ids, in a fixed order, opened; a read that fails throws. */
async function rowsFor(ws: string, table: "observations" | "observation_history" | "series_values" | "actions" | "breakdown_rows" | "breakdown_history" | "thread_messages", column: string, ids: readonly number[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += AT_A_TIME) {
    const chunk = ids.slice(i, i + AT_A_TIME);
    const rows = await allRows<Row>((from, to) => mustRead<Row>(db().from(table).select("*").eq("workspace_id", ws).in(column, chunk).order("id").range(from, to), UNREAD));
    out.push(...((await openRows(table, ws, rows)) as Row[]));
  }
  return out;
}

/** The names of the people these rows point at, by id. */
async function namesOf(ws: string, ids: unknown[]): Promise<(id: unknown) => string> {
  const wanted = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))].sort();
  const names = new Map<string, string>();
  for (let i = 0; i < wanted.length; i += 200) {
    const { data } = await mustRead<{ id: string; name: string }>(db().from("profiles").select("id, name").in("id", wanted.slice(i, i + 200)), UNREAD);
    for (const p of await openNames(ws, data)) names.set(String(p.id), String(p.name));
  }
  return (id) => (typeof id === "string" ? names.get(id) ?? "Someone who left" : "");
}

/** What the files of one record share: the Workspace's way of writing numbers, its Metrics and what the actor sees. */
type Shared = { actor: Actor; style: NumberStyle; all: Metric[]; seen: Set<number>; tags: Map<number, string[]> };

/** A cell: text a person typed (guarded against formulas), or one of Ziffr's numbers. */
type Cell = string | { number: unknown };
const num = (v: unknown): Cell => ({ number: v });
const word = (v: unknown): Cell => (v === null || v === undefined ? "" : String(v));
/** A sealed number as written: one that does not open says so, so nothing goes missing without a word. */
const value = (v: unknown): Cell => (typeof v === "number" ? num(v) : v === null || v === undefined ? "" : "could not be read");

function csv(style: NumberStyle, name: string, header: string[], rows: Cell[][]): RecordFile {
  const cells = spreadsheetCells(style);
  const line = (row: Cell[]) => row.map((c) => (typeof c === "string" ? cells.text(c) : cells.number(c.number))).join(cells.sep);
  return { name, text: `${BYTE_ORDER_MARK}${[header, ...rows].map(line).join("\r\n")}\r\n` };
}

/** A stored Retention in words; nothing where none is set. */
function retentionWords(stored: unknown): string {
  const r = stored as { keep_months?: unknown; then?: unknown; into?: unknown } | null | undefined;
  return r?.keep_months ? `keep ${r.keep_months} months, then ${r.then}${r.into ? ` into ${r.into}s` : ""}` : "";
}

/** The Metric Description and what else is set on the Metric, one setting a row. */
async function definitionFile(s: Shared, m: Metric & Row): Promise<RecordFile> {
  const ws = s.actor.workspaceId;
  const [{ data: tokens }, { data: workflow }, parts] = await Promise.all([
    mustRead<Row>(db().from("tokens").select("id, submitter_id, stands_in_for").eq("workspace_id", ws).eq("metric_id", m.id).order("id"), UNREAD),
    m.workflow_id ? db().from("workflows").select("name").eq("id", m.workflow_id as number).eq("workspace_id", ws).maybeSingle() : Promise.resolve({ data: null }),
    m.total ? readParts(ws) : Promise.resolve({} as Awaited<ReturnType<typeof readParts>>),
  ]);
  const name = await namesOf(ws, [m.owner_id, ...(tokens ?? []).flatMap((t) => [t.submitter_id, t.stands_in_for])]);
  const seenSlugs = new Set(s.all.filter((x) => s.seen.has(x.id)).map((x) => x.slug));
  const named = (found: Metric | undefined) => (found && s.seen.has(found.id) ? found.name : "A Metric you cannot see");
  const formula = m.formula && !m.total ? withoutUnseenInputs([m], seenSlugs)[0].formula ?? "" : "";
  const rows: [string, Cell][] = [
    ["name", word(m.name)], ["short name", word(m.slug)], ["description", word(m.description)], ["how it is calculated", word(m.calculation_note)],
    ["owner", name(m.owner_id)], ["period", word(m.period)], ["unit", word(m.unit)], ["unit stands", word(m.unit_position)], ["format", word(m.format)], ["decimals", word(m.decimals)],
    ["submission rule", word(m.submission_rule)], ["good direction", word(m.polarity)], ["aggregation", word(m.aggregation)],
    ["target from", value(m.target_min)], ["target to", value(m.target_max)], ["attainment", word(m.attainment_method ?? "as the Workspace computes it")],
    ["sources", (m.sources ?? []).join(", ")], ["tags", [...(s.tags.get(m.id) ?? [])].sort().join(", ")],
    ["workflow", word((workflow as { name?: string } | null)?.name)], ["retention", retentionWords(m.retention)], ["archived on", word(m.archived_at)],
  ];
  if (formula) {
    rows.push(["formula", formula]);
    for (const slug of formulaInputs(formula)) {
      const input = s.all.find((x) => x.slug === slug);
      if (input && s.seen.has(input.id)) rows.push([`formula reads {${slug}}`, input.name]);
    }
  }
  if (m.total) {
    rows.push(["total takes its target", m.total.targets === "parts" ? "from the Metrics it adds up" : "of its own"], ["total is open to everyone who sees it", m.total.open ? "yes" : "no"]);
    for (const p of parts[m.id] ?? []) rows.push(["adds up", `${named(s.all.find((x) => x.id === p.part))}, from ${countsFromFirstValue(p.first) ? "its first value" : p.first}${p.last ? ` to ${p.last}` : ""}`]);
  }
  for (const t of tokens ?? []) rows.push(t.stands_in_for ? ["stand-in", `${name(t.submitter_id)} for ${name(t.stands_in_for)}`] : ["submitter", name(t.submitter_id)]);
  return csv(s.style, "definition.csv", ["setting", "value"], rows.map(([k, v]) => [k, v]));
}

/** The values with their history and their Breakdowns. */
async function valueFiles(s: Shared, m: Metric): Promise<{ files: RecordFile[]; rows: number }> {
  const ws = s.actor.workspaceId;
  const [observations, history, condensed, states] = await Promise.all([
    rowsFor(ws, "observations", "metric_id", [m.id]),
    rowsFor(ws, "observation_history", "metric_id", [m.id]),
    condensedFor(ws, [m.id], UNREAD),
    allRows<{ period_start: string; state: string }>((from, to) => mustRead(db().from("period_states").select("period_start, state").eq("workspace_id", ws).eq("metric_id", m.id).order("period_start").range(from, to), UNREAD)),
  ]);
  const valueIds = [...new Set([...observations.map((o) => o.id as number), ...history.map((h) => h.observation_id as number)])].sort((a, b) => a - b);
  const [breakdown, replacedBreakdown] = await Promise.all([rowsFor(ws, "breakdown_rows", "observation_id", valueIds), rowsFor(ws, "breakdown_history", "observation_id", valueIds)]);
  const name = await namesOf(ws, [...observations, ...history].flatMap((o) => [o.submitter_id, o.entered_by]));
  // An imported value has no person, only the name it came with.
  const by = (id: unknown, kept: unknown) => (typeof id === "string" ? name(id) : typeof kept === "string" ? kept : "");
  const stateOf = new Map(states.map((p) => [p.period_start, p.state]));
  const periodOf = new Map<unknown, string>([...history.map((h) => [h.observation_id, String(h.period_start)] as const), ...observations.map((o) => [o.id, String(o.period_start)] as const)]);
  const spans = condensed[m.id] ?? [];
  const current: Cell[][] = observations.filter((o) => !inCondensed(spans, String(o.period_start))).map((o) => [
    word(o.id), word(o.period_start), "", value(o.value), word(m.unit), value(o.original_value), word(o.source), by(o.submitter_id, o.submitted_by_name), by(o.entered_by, o.entered_by_name),
    word(o.created_at), o.imported ? "yes" : "", valueStateWords(stateOf.get(String(o.period_start))), stateOf.get(String(o.period_start)) === "locked" ? "yes" : "", "",
  ]);
  for (const c of spans) {
    const v = valueOfParts(m.aggregation as Aggregation, [partOfCondensed(c)], c.of);
    current.push(["", c.period, c.periodEnd, v === undefined ? "" : num(v), word(m.unit), "", "condensed", "", "", c.condensedOn, "", valueStateWords(null), c.locked ? "yes" : "", num(c.held)]);
  }
  const labels = new Map(breakdown.map((b) => [b.id, b.label]));
  const rowOrder = (a: Row, b: Row) => (a.observation_id as number) - (b.observation_id as number) || Number(a.position ?? 0) - Number(b.position ?? 0) || (a.id as number) - (b.id as number);
  return {
    rows: current.length + history.length,
    files: [
      csv(s.style, "values.csv", ["value_id", "period_start", "period_end", "value", "unit", "value_as_entered", "source", "submitted_by", "entered_by", "recorded_at", "imported", "state", "locked", "condensed_from"], current),
      csv(s.style, "value-history.csv", ["value_id", "period_start", "earlier_value", "change", "source", "submitted_by", "entered_by", "recorded_at", "replaced_at"],
        history.map((h) => [word(h.observation_id), word(h.period_start), value(h.value), word(h.change), word(h.source), name(h.submitter_id), name(h.entered_by), word(h.recorded_at), word(h.superseded_at)])),
      csv(s.style, "breakdowns.csv", ["value_id", "period_start", "row_id", "part_of_row_id", "part_of", "label", "value"],
        [...breakdown].sort(rowOrder).map((b) => [word(b.observation_id), word(periodOf.get(b.observation_id)), word(b.id), word(b.parent_id), word(labels.get(b.parent_id)), word(b.label), value(b.value)])),
      csv(s.style, "breakdown-history.csv", ["value_id", "period_start", "row_id", "part_of_row_id", "label", "earlier_value", "replaced_at"],
        replacedBreakdown.map((b) => [word(b.observation_id), word(periodOf.get(b.observation_id)), word(b.row_id), word(b.parent_row_id), word(b.label), value(b.value), word(b.superseded_at)])),
    ],
  };
}

/** The Target Series and Projections. */
async function seriesFiles(s: Shared, m: Metric): Promise<RecordFile[]> {
  const rows = await rowsFor(s.actor.workspaceId, "series_values", "metric_id", [m.id]);
  const sorted = rows.sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)) || (a.id as number) - (b.id as number));
  return (["target", "projection"] as const).map((kind) => csv(s.style, `${kind}s.csv`, ["period_start", "value", "note", "saved_at"],
    sorted.filter((r) => r.kind === kind).map((r) => [word(r.period_start), value(r.value), word(r.note), word(r.created_at)])));
}

/** The Questions and Tasks about the Metric with their replies. A Metric's owner reads every one of them
 * (canReadThread), and only the owner gets here. */
async function conversationFile(s: Shared, m: Metric): Promise<RecordFile> {
  const ws = s.actor.workspaceId;
  const actions = await rowsFor(ws, "actions", "metric_id", [m.id]);
  const messages = await rowsFor(ws, "thread_messages", "action_id", actions.map((a) => a.id as number));
  const name = await namesOf(ws, [...actions.flatMap((a) => [a.asker_id, a.assignee_id]), ...messages.map((x) => x.author_id)]);
  const rows: Cell[][] = actions.flatMap((a) => {
    const head: Cell[] = [word(a.id), word(a.kind), word(a.period_start), word(a.breakdown_label), word(a.status), name(a.asker_id), name(a.assignee_id), word(a.due_date)];
    return [
      [...head, "question", name(a.asker_id), word(a.created_at), "", word(a.question), "", ""],
      ...messages.filter((x) => x.action_id === a.id).map((x): Cell[] => [...head, "reply", name(x.author_id), word(x.created_at), word(x.via), word(x.body), value(x.correction_value), word(x.correction_status)]),
    ];
  });
  return csv(s.style, "questions-and-tasks.csv", ["thread_id", "kind", "period_start", "breakdown_row", "status", "asked_by", "asked_to", "due_date", "entry", "written_by", "written_at", "via", "text", "proposed_value", "proposal"], rows);
}

/** The Value Notes and their history. A calculated Metric's only for the periods whose number the actor is shown, so
 * that a Total's notes never reach someone who may not see what is added up. */
async function notesFile(s: Shared, m: Metric): Promise<RecordFile> {
  const ws = s.actor.workspaceId;
  const [entries, data] = await Promise.all([noteEntries(ws, m.id), m.formula ? getCanvasData(ws, s.actor.personId, { seriesOf: [m.id] }) : null]);
  const shown = data ? new Set((data.series[m.slug] ?? []).map((p) => p.period)) : null;
  const threads = noteThreads(shown ? entries.filter((e) => shown.has(e.period_start)) : entries).reverse();
  const name = await namesOf(ws, entries.map((e) => e.author_id));
  const rows: Cell[][] = threads.flatMap((t) => t.entries.map((e): Cell[] => [
    word(e.period_start), word(t.first.id), word(e.kind), name(e.author_id), word(e.created_at), word(e.source), word(wordsShown(e, t)),
    value(e.said_of), word(e.added_later ? "yes" : ""), word(t.replaced ? "yes" : ""), word(t.erased ? "yes" : ""),
  ]));
  return csv(s.style, "value-notes.csv", ["period_start", "note_id", "entry", "written_by", "written_at", "via", "words", "said_of", "added_later", "value_since_replaced", "words_deleted_for_good"], rows);
}

/** The numbers of a Derived Metric or a Total as the app shows them to the actor now. */
async function calculatedFile(s: Shared, m: Metric): Promise<RecordFile> {
  const data = await getCanvasData(s.actor.workspaceId, s.actor.personId, { seriesOf: [m.id] });
  return csv(s.style, "calculated-values.csv", ["period_start", "value", "unit"], (data.series[m.slug] ?? []).map((p) => [p.period, num(p.value), word(m.unit)]));
}

const fingerprint = (files: RecordFile[]) => sha(files.map((f) => [f.name, f.text]));

/** The record of one Metric the actor owns. */
async function recordOf(s: Shared, m: Metric): Promise<{ metric: RecordedMetric; rows: number }> {
  const { data: stored } = await mustRead<Row>(db().from("metrics").select("*").eq("workspace_id", s.actor.workspaceId).eq("id", m.id), UNREAD);
  if (!stored?.length) throw new Refused("One of these Metrics is gone already. Look again.");
  // The list carries the opened words, and for a Total its parts; the stored row the columns it does not.
  const full = { ...stored[0], ...m } as Metric & Row;
  const values = await valueFiles(s, m);
  // What is stored for the Metric and goes with it, apart from how it is set up and what is calculated from others.
  const kept = [...values.files, ...(await seriesFiles(s, m)), await conversationFile(s, m), await notesFile(s, m)];
  const files = [await definitionFile(s, full), ...kept, ...(m.formula ? [await calculatedFile(s, m)] : [])];
  const folder = m.slug.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "metric";
  return { metric: { id: m.id, name: m.name, folder, files, digest: fingerprint(files), stored: fingerprint(kept) }, rows: values.rows };
}

/** The record of exactly these Metrics as it is now, for their Metric Owner. */
export async function buildMetricRecord(actor: Actor, ids: readonly number[]): Promise<MetricRecord> {
  const mine = await ownedForRecord(actor, ids);
  await assertFits(actor.workspaceId, mine.map((m) => m.id));
  const all = await getMetrics(actor.workspaceId);
  const [style, seen, sight] = await Promise.all([numberStyleOf(actor.workspaceId), visibleMetricIds(actor.workspaceId, actor.personId, all), tagSight(actor)]);
  const shared: Shared = { actor, style, all, seen, tags: sight.namesByMetric };
  const metrics: RecordedMetric[] = [];
  let rows = 0;
  // One after the other: a record is bounded, and this keeps what it holds in memory and asks of the database small.
  for (const m of mine) {
    const one = await recordOf(shared, m);
    metrics.push(one.metric);
    rows += one.rows;
  }
  return { metrics, digest: sha(metrics.map((m) => [m.id, m.digest])), rows };
}

const readme = (record: MetricRecord, at: Date) => [
  "Ziffr: the record of Metrics, downloaded before deleting them.",
  `Made on ${at.toISOString()}.`,
  "",
  "One folder per Metric:",
  ...record.metrics.map((m) => `  ${m.folder}/  ${m.name.replace(/[\r\n]+/g, " ")}`),
  "",
  "definition.csv           what the Metric is, who owns it and how it is set",
  "values.csv               its values now, with who sent each and when",
  "value-history.csv        values that were replaced or removed",
  "breakdowns.csv           the labelled rows of its values",
  "breakdown-history.csv    rows that were replaced",
  "targets.csv              its Target Series",
  "projections.csv          its Projections",
  "questions-and-tasks.csv  Questions and Tasks about it, with their replies",
  "calculated-values.csv    for a calculated Metric or a Total: its numbers as shown to you",
  "",
  "Numbers are written in your Workspace's Number Style. Ziffr cannot read this file back in.",
  "",
].join("\r\n");

/** The record of these Metrics as a ZIP file, for their Metric Owner. It is written in the Audit Log with the
 * record's fingerprint, which unlocks deleting exactly this set while it stays as it is. */
export async function exportMetricRecord(actor: Actor, ids: readonly number[]): Promise<{ zip: Buffer; filename: string; metrics: number; rows: number }> {
  const record = await buildMetricRecord(actor, ids);
  const at = new Date();
  const zip = zipFile([
    { name: "README.txt", data: Buffer.from(readme(record, at), "utf8") },
    ...record.metrics.flatMap((m) => m.files.map((f) => ({ name: `${m.folder}/${f.name}`, data: Buffer.from(f.text, "utf8") }))),
  ], at);
  // No file leaves Ziffr without its line in the Audit Log, and without that line nothing can be deleted.
  await auditOrRefuse(actor, { kind: "export.metric_record", object: { type: "workspace", id: actor.workspaceId }, details: { metrics: record.metrics.length, rows: record.rows, record: record.digest } });
  const day = at.toISOString().slice(0, 10);
  return { zip, filename: record.metrics.length === 1 ? `ziffr-record-${record.metrics[0].folder}-${day}.zip` : `ziffr-record-${record.metrics.length}-metrics-${day}.zip`, metrics: record.metrics.length, rows: record.rows };
}

/** Whether the actor downloaded this record lately: "yes", "changed" (they downloaded a record, but not one of this set
 * as it is now) or "no". Read from the Audit Log, which only the core writes. */
export async function recordDownloaded(actor: Actor, digest: string, now = Date.now()): Promise<"yes" | "changed" | "no"> {
  const { data, error } = await db().from("audit_events").select("id, details").eq("workspace_id", actor.workspaceId).eq("actor_id", actor.personId).eq("kind", "export.metric_record")
    .gte("at", new Date(now - RECORD_HOURS * 3_600_000).toISOString()).order("id", { ascending: false }).limit(100);
  if (error) throw new Error("Whether the record was downloaded could not be read, so nothing was deleted. Try again in a moment.");
  const events = (await openRows("audit_events", actor.workspaceId, (data ?? []) as Row[])) as { details?: { record?: unknown } }[];
  if (events.some((e) => e.details?.record === digest)) return "yes";
  return events.length ? "changed" : "no";
}
