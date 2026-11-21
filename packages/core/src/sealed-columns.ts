// Sealed columns (spec 0028, ticket #246; GLOSSARY: Workspace Key): which columns hold a Workspace's words sealed with
// its key, and the few helpers every core function uses to write and read them. A row is written sealed, with its id
// taken first, so the sealed value is bound to that row; a row is read opened, plain rows written before passing
// through as they are until the re-encryption job (#247) seals them. Security: callers never write one of these
// columns by hand, and a Workspace whose key cannot be unwrapped or is gone is refused, never written in clear.
import { db } from "./db";
import { mapSettingsWords, opening, sealing } from "./sealed-words";
import { isSealed, workspaceCipher, type SealedAt, type WorkspaceCipher } from "./workspace-keys";
import { ServerFault } from "./server-fault";

/** The columns sealed with the Workspace Key, by table (step 1: free text and personal data). The re-encryption job
 * and its done check read this list too. A Contact's name is sealed in their person row (`profiles`), which belongs to
 * that one Workspace; members' own profiles belong to the person and stay in clear (spec 0028). */
export const SEALED_COLUMNS = {
  thread_messages: ["body"],
  // A Question's text and the label of the Breakdown row it points at (sealed again for the Action's own row, so that
  // it opens with the Action, not with the Breakdown).
  actions: ["question", "breakdown_label"],
  contacts: ["email", "slack_handle", "phone"],
  profiles: ["name"],
  deliveries: ["subject", "body"],
  // A Prompt's text names the Metric it asks about (step 2, ticket #248); its id (a sequence) is taken first.
  prompts: ["text"],
  intake_log: ["sender", "raw", "detail"],
  // An event's details are sealed as a whole, in audit-log.ts: the column is an object the database checks.
  audit_events: ["object_name"],
  // An Alert's level (a value or a share), written by alerts.ts through create_alert with its id taken first.
  alerts: ["level"],
  // A Webhook's address (automation tools put a secret in its path), its secret and its previous secret (spec 0034),
  // written by webhooks.ts with its id (a uuid) made first.
  webhooks: ["url", "secret", "secret_previous"],
  // The external task an Action is in another system, per Webhook (spec 0034, ticket 5): its id and address, written by
  // webhook-inbound.ts with the row's uuid made first.
  webhook_external_ids: ["external_id", "url"],
  // The words of dashboards, Findings and Metrics (ticket #334): a dashboard's introduction, a widget's title (its
  // Finding's other words sit in `settings`, sealed by sealed-words.ts through sealRow and openRow), a Metric's
  // description. A Snapshot's words and the copies in Versions and View Links are sealed in their own functions.
  dashboards: ["intro"],
  widgets: ["title"],
  // Step 2 (ticket #248): a Metric's name is sealed beside its description, bound to its row.
  metrics: ["description", "name"],
  // A Condensed Value's numbers (the sum or last value, and the Target), as JSON (spec 0033); its id (a uuid) is made first.
  condensed_values: ["payload"],
} as const;

/** Columns sealed together with a blind index, beside the table above on purpose: the re-encryption job seals every
 * column of SEALED_COLUMNS on its own, and a Breakdown label sealed without its `label_index` (and its history) could no
 * longer merge. A Breakdown row's label is written by submissions.ts through record_observation with its id taken
 * first and found again by its blind index (breakdown-labels.ts); breakdown_history.label is a copy of it with the row's
 * id in `row_id`. Old plain labels stay plain and keep merging until the re-encryption job re-seals them with their index and
 * history (#250). */
export const INDEXED_COLUMNS = { breakdown_rows: ["label"], breakdown_history: ["label"] } as const;

/** The numbers sealed with the Workspace Key (step 2, ticket #248): each column is emptied and a text column beside it,
 * named `<column>_sealed`, holds the number as text, sealed for its place (see numberPlace). A row holds one of the two;
 * rows written before sealing keep the plain number until the re-encryption job seals it. The history tables keep a
 * value as it was stored, sealed for the row it was a value of. */
export const SEALED_NUMBERS = {
  observations: ["value", "original_value"],
  observation_history: ["value"],
  breakdown_rows: ["value"],
  breakdown_history: ["value"],
  series_values: ["value"],
  metrics: ["target_min", "target_max"],
  thread_messages: ["correction_value"],
} as const;

/** A table with sealed numbers. */
export type NumberTable = keyof typeof SEALED_NUMBERS;

/** The text column that holds a number sealed. */
export const sealedNumberColumn = (column: string): string => `${column}_sealed`;

/** Where a row's sealed number lives, which it is bound to: the history tables point at the row they copied the value
 * from (the trigger copies the sealed text as it is, so it opens with the original's id); a Target Series point is
 * named by its Metric, kind and day. Null when the row does not say (it was read without its key columns). */
export function numberPlace(table: NumberTable, column: string, row: Record<string, unknown>): SealedAt | null {
  const some = (v: unknown): v is string | number => (typeof v === "string" && v !== "") || typeof v === "number";
  switch (table) {
    case "observation_history":
      return some(row.observation_id) ? { table: "observations", column, row: row.observation_id } : null;
    case "breakdown_history":
      if (some(row.row_id)) return { table: "breakdown_rows", column, row: row.row_id };
      return some(row.id) ? { table, column, row: row.id } : null;
    case "series_values":
      return some(row.metric_id) && some(row.kind) && some(row.period_start) ? { table, column, row: `${row.metric_id}-${row.kind}-${row.period_start}` } : null;
    default:
      return some(row.id) ? { table, column, row: row.id } : null;
  }
}

/** The sealed columns the database never leaves null: unreadable ones read empty, not missing. */
const NEVER_NULL: Partial<Record<OpenedTable, readonly string[]>> = { dashboards: ["intro"], metrics: ["description"] };

/** Every table with sealed columns, also the ones sealed with an index: what the re-encryption job walks. */
export const ALL_SEALED_COLUMNS = { ...SEALED_COLUMNS, ...INDEXED_COLUMNS } as const;
const COLUMNS: Record<string, readonly string[]> = ALL_SEALED_COLUMNS;
const NUMBERS: Record<string, readonly string[] | undefined> = SEALED_NUMBERS;

/** The column that names a row of each table, which a sealed value is bound to. */
export const ROW_KEY: Record<OpenedTable, string> = { thread_messages: "id", actions: "id", contacts: "person_id", profiles: "id", deliveries: "id", prompts: "id", intake_log: "id", audit_events: "id", alerts: "id", webhooks: "id", webhook_external_ids: "id", condensed_values: "id", breakdown_rows: "id", breakdown_history: "id", dashboards: "id", widgets: "id", metrics: "id", observations: "id", observation_history: "id", series_values: "id" };

/** A table whose columns the re-encryption job seals. */
export type SealedTable = keyof typeof SEALED_COLUMNS;

/** A table with sealed columns, also one sealed with an index. */
export type OpenedTable = keyof typeof SEALED_COLUMNS | keyof typeof INDEXED_COLUMNS | NumberTable;

/** A table whose new rows insertSealed writes, ids taken from its sequence first. */
type InsertedTable = "thread_messages" | "actions" | "deliveries" | "prompts" | "intake_log" | "audit_events" | "alerts" | "dashboards" | "widgets" | "metrics";

/** A table whose row ids reserveIds hands out: the ones above, and those whose words sit in a column of their own. */
export type ReservedTable = InsertedTable | "dashboard_snapshots" | "view_links";

type Row = Record<string, unknown>;

/** Takes the ids the next rows of a table will have, from its own sequence. Breakdown rows take theirs here but are
 * written only by record_observation, which needs each row's blind index too (breakdown-labels.ts). */
export async function reserveIds(table: ReservedTable | "breakdown_rows" | "observations", count: number): Promise<number[]> {
  const words = table === "widgets" || table === "dashboards" || table === "metrics" || table === "dashboard_snapshots" || table === "view_links";
  const { data, error } = await db().rpc(words ? "reserve_word_row_ids" : "reserve_row_ids", { p_table: table, p_count: count });
  if (error || !Array.isArray(data) || data.length !== count) throw new ServerFault("The row could not be prepared.");
  return (data as (number | string)[]).map(Number);
}

/** A row's sealed columns sealed for it, the rest as they are. Columns left out of the row stay out. */
function sealed(cipher: WorkspaceCipher, table: OpenedTable, row: Row): Row {
  const out: Row = { ...row };
  for (const column of COLUMNS[table] ?? []) {
    const v = row[column];
    if (typeof v === "string") out[column] = cipher.seal({ table, column, row: row[ROW_KEY[table]] as string | number }, v);
  }
  sealNumbers(cipher, table, row, out);
  // A widget's Finding words sit in its settings, each sealed for its place there.
  if (table === "widgets" && "settings" in row) out.settings = mapSettingsWords(row.settings, sealing(cipher, "widgets", row[ROW_KEY[table]] as string | number));
  return out;
}

/** A row's numbers sealed for it: the number becomes text in the column beside it and the numeric one is emptied. A
 * number left out stays out; one set to null clears both; where the Workspace does not seal the number stays plain. */
export function sealNumbers(cipher: WorkspaceCipher, table: OpenedTable, row: Row, out: Row): void {
  for (const column of NUMBERS[table] ?? []) {
    if (!(column in row)) continue;
    const v = row[column];
    const text = sealedNumberColumn(column);
    if (typeof v !== "number") { out[column] = null; out[text] = null; continue; }
    if (!cipher.sealing) { out[text] = null; continue; }
    const place = numberPlace(table as NumberTable, column, row);
    // Without its row a number cannot be bound to it, and must not be stored in clear either.
    if (!place) throw new ServerFault("The value could not be prepared.");
    out[text] = cipher.seal(place, String(v));
    out[column] = null;
  }
}

/** Inserts rows into one Workspace with their sealed columns sealed: ids are taken first, the Workspace is set on
 * every row. Answers what `select` names of the inserted rows, opened, in the order given. */
export async function insertSealed(table: InsertedTable, workspaceId: string, rows: Row[], select = "id", prepare?: (cipher: WorkspaceCipher, row: Row) => Row): Promise<Row[]> {
  if (!rows.length) return [];
  const cipher = await workspaceCipher(workspaceId);
  const ids = await reserveIds(table, rows.length);
  // `prepare` seals what is not a plain column (an event's details), with the row's id already in it.
  const prepared = rows.map((r, i) => sealed(cipher, table, (prepare ?? ((_c, x) => x))(cipher, { ...r, id: ids[i], workspace_id: workspaceId })));
  const columns = select.split(",").map((c) => c.trim());
  const wanted = ["id", "workspace_id", ...columns.filter((c) => c !== "id" && c !== "workspace_id")].join(", ");
  const { data, error } = await db().from(table).insert(prepared).select(wanted);
  if (error || !data) throw new ServerFault("It could not be saved.");
  // The database sets a row's Workspace from its parent (workspace_from_parent): one that differs from the Workspace
  // it was sealed for would never open, so the caller's mistake is refused here rather than stored.
  const rowsBack = data as unknown as Row[];
  if (rowsBack.some((r) => String(r.workspace_id).toLowerCase() !== workspaceId.toLowerCase())) {
    await db().from(table).delete().in("id", rowsBack.map((r) => r.id as number));
    throw new ServerFault("It could not be saved.");
  }
  const byId = new Map(rowsBack.map((r) => [Number(r.id), r]));
  return ids.map((id) => openRow(cipher, table, byId.get(id) ?? { id }));
}

/** A row of a Workspace with its sealed columns sealed for it, to insert or update; the row's key must be in it. */
export async function sealRow(table: OpenedTable, workspaceId: string, row: Row): Promise<Row> {
  return sealed(await workspaceCipher(workspaceId), table, row);
}

/** The changed columns of one row, its words sealed for it, to update with: the row's id is not part of the answer.
 * Columns that hold no words pass as they are. */
export async function sealedPatch(table: SealedTable, workspaceId: string, id: number, patch: Row): Promise<Row> {
  const sealed = await sealRow(table, workspaceId, { ...patch, id });
  delete sealed.id;
  return sealed;
}

/** A row read from a table, its sealed columns opened (null for one that does not open). Rows without an id are
 * returned as they are: nothing sealed can be opened without knowing its row. */
export function openRow<T extends Row>(cipher: WorkspaceCipher, table: OpenedTable, row: T): T {
  if (row === null || row === undefined) return row;
  const key = row[ROW_KEY[table]];
  const out: Row = { ...row };
  openNumbers(cipher, table, row, out);
  // Without its row nothing sealed can be opened, and it must not pass on as it is either: it reads as missing.
  if (key === undefined || key === null) {
    for (const column of COLUMNS[table] ?? []) if (isSealed(row[column] as string)) out[column] = null;
    // A widget's words in its settings are left out too: they cannot be opened without their row either.
    if (table === "widgets" && "settings" in row) out.settings = mapSettingsWords(row.settings, (_c, text) => (isSealed(text) ? undefined : text));
    return out as T;
  }
  for (const column of COLUMNS[table] ?? []) {
    if (column in row && typeof row[column] === "string") out[column] = cipher.open({ table, column, row: key as string | number }, row[column] as string);
  }
  if (table === "widgets" && "settings" in row) out.settings = mapSettingsWords(row.settings, opening(cipher, "widgets", key as string | number));
  // A column that is never null (an introduction, a description) reads empty when it does not open, as it does when empty.
  for (const column of NEVER_NULL[table] ?? []) if (column in out && out[column] === null) out[column] = "";
  // A Metric's name that does not open reads as a placeholder, never as its ciphertext or as nothing.
  if (table === "metrics" && "name" in out && out.name === null) out.name = UNREADABLE_METRIC;
  // An event's details are an object holding them sealed ({"sealed": "w1..."}): opened back into the object; ones
  // that do not open read as none, never as their ciphertext.
  const details = table === "audit_events" ? (row.details as Row | null | undefined) : undefined;
  const sealedDetails = details && Object.keys(details).length === 1 ? details.sealed : undefined;
  // Only the wrapper itself counts: plain details that happen to hold a "sealed" key stay as they are.
  if (typeof sealedDetails === "string" && isSealed(sealedDetails)) {
    const text = cipher.open({ table, column: "details", row: key as number }, sealedDetails);
    try {
      out.details = text === null ? {} : JSON.parse(text);
    } catch {
      out.details = {};
    }
  }
  return out as T;
}

/** What a Metric's name reads as when it does not open (changed in the database, or under a destroyed key). */
export const UNREADABLE_METRIC = "A Metric";

/** A row's numbers opened: where the sealed text is set it is opened (a number that does not open reads as null), a
 * plain number written before sealing passes as a number, and the sealed column is left out of the answer. A column the
 * query did not ask for in both forms is left alone. */
function openNumbers(cipher: WorkspaceCipher, table: OpenedTable, row: Row, out: Row): void {
  for (const column of NUMBERS[table] ?? []) {
    const text = sealedNumberColumn(column);
    if (!(text in row)) continue;
    delete out[text];
    const place = numberPlace(table as NumberTable, column, row);
    const stored = row[text];
    const plain = row[column] === null || row[column] === undefined ? undefined : String(row[column]);
    // A plain number is read through the same door where it lives in its own table, so a column the job has finished
    // takes none in clear; a history entry's number is bound to the row it was copied from and is not asked.
    const opened = typeof stored === "string" ? (place ? cipher.open(place, stored) : null) : plain === undefined ? undefined : place && place.table === table ? cipher.open(place, plain) : plain;
    out[column] = opened === undefined ? null : opened === null || !Number.isFinite(Number(opened)) ? null : Number(opened);
  }
}

/** An event's details sealed for its row, as audit-log.ts stores them; as they are where nothing is sealed. */
export function sealDetails(cipher: WorkspaceCipher, row: Row): Row {
  return cipher.sealing ? { ...row, details: { sealed: cipher.seal({ table: "audit_events", column: "details", row: row.id as number }, JSON.stringify(row.details ?? {})) } } : row;
}

/** One row of a Workspace read from a table, its sealed columns opened; null stays null. */
export async function openOne<T extends Row>(table: SealedTable, workspaceId: string, row: T | null | undefined): Promise<T | null> {
  if (!row) return null;
  return (await openRows(table, workspaceId, [row]))[0] ?? null;
}

/** Rows of one Workspace read from a table, their sealed columns opened, with one key lookup. */
export async function openRows<T extends Row>(table: OpenedTable, workspaceId: string, rows: T[] | null | undefined): Promise<T[]> {
  if (!rows?.length) return rows ?? [];
  const cipher = await workspaceCipher(workspaceId);
  return rows.map((r) => openRow(cipher, table, r));
}

/** What a Contact's name reads as when it does not open (changed in the database, or under a destroyed key). */
export const UNREADABLE_NAME = "A Contact";

/** People's rows read in one Workspace, a Contact's sealed name opened. Members' names are never sealed and pass
 * through; a sealed name that does not open reads as UNREADABLE_NAME, never as its ciphertext. */
export async function openNames<T extends { id?: unknown; name?: unknown }>(workspaceId: string, people: T[] | null | undefined): Promise<T[]> {
  if (!people?.length) return people ?? [];
  if (!people.some((p) => isSealed(p.name as string))) return people;
  const cipher = await workspaceCipher(workspaceId);
  return people.map((p) => {
    if (!isSealed(p.name as string)) return p;
    const name = openRow(cipher, "profiles", p as Row).name;
    // Never its ciphertext: whatever did not open reads as a Contact.
    return { ...p, name: typeof name === "string" && !isSealed(name) ? name : UNREADABLE_NAME };
  });
}
