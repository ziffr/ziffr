// Sealed columns (spec 0028, ticket #246; GLOSSARY: Workspace Key): which columns hold a Workspace's words sealed with
// its key, and the few helpers every core function uses to write and read them. A row is written sealed, with its id
// taken first, so the sealed value is bound to that row; a row is read opened, plain rows written before passing
// through as they are until the re-encryption job (#247) seals them. Security: callers never write one of these
// columns by hand, and a Workspace whose key cannot be unwrapped or is gone is refused, never written in clear.
import { db } from "./db";
import { isSealed, workspaceCipher, type WorkspaceCipher } from "./workspace-keys";

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
} as const;

/** Columns sealed together with a blind index, beside the table above on purpose: the re-encryption job seals every
 * column of SEALED_COLUMNS on its own, and a Breakdown label sealed without its `label_index` (and its history) could no
 * longer merge. A Breakdown row's label is written by submissions.ts through record_observation with its id taken
 * first and found again by its blind index (breakdown-labels.ts); breakdown_history.label is a copy of it with the row's
 * id in `row_id`. Old plain labels stay plain and keep merging until they are re-sealed with their index and history in
 * #250. */
export const INDEXED_COLUMNS = { breakdown_rows: ["label"] } as const;

const COLUMNS = { ...SEALED_COLUMNS, ...INDEXED_COLUMNS } as const;

/** The column that names a row of each table, which a sealed value is bound to. */
const ROW_KEY: Record<OpenedTable, string> = { thread_messages: "id", actions: "id", contacts: "person_id", profiles: "id", deliveries: "id", intake_log: "id", audit_events: "id", alerts: "id", webhooks: "id", webhook_external_ids: "id", breakdown_rows: "id" };

/** A table whose columns the re-encryption job seals. */
export type SealedTable = keyof typeof SEALED_COLUMNS;

/** A table with sealed columns, also one sealed with an index. */
export type OpenedTable = keyof typeof COLUMNS;

/** A table whose new rows insertSealed writes, ids taken from its sequence first. */
type InsertedTable = "thread_messages" | "actions" | "deliveries" | "intake_log" | "audit_events" | "alerts";

type Row = Record<string, unknown>;

/** Takes the ids the next rows of a table will have, from its own sequence. Breakdown rows take theirs here but are
 * written only by record_observation, which needs each row's blind index too (breakdown-labels.ts). */
export async function reserveIds(table: InsertedTable | "breakdown_rows", count: number): Promise<number[]> {
  const { data, error } = await db().rpc("reserve_row_ids", { p_table: table, p_count: count });
  if (error || !Array.isArray(data) || data.length !== count) throw new Error("The row could not be prepared.");
  return (data as (number | string)[]).map(Number);
}

/** A row's sealed columns sealed for it, the rest as they are. Columns left out of the row stay out. */
function sealed(cipher: WorkspaceCipher, table: OpenedTable, row: Row): Row {
  const out: Row = { ...row };
  for (const column of COLUMNS[table]) {
    const v = row[column];
    if (typeof v === "string") out[column] = cipher.seal({ table, column, row: row[ROW_KEY[table]] as string | number }, v);
  }
  return out;
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
  if (error || !data) throw new Error("It could not be saved.");
  // The database sets a row's Workspace from its parent (workspace_from_parent): one that differs from the Workspace
  // it was sealed for would never open, so the caller's mistake is refused here rather than stored.
  const rowsBack = data as unknown as Row[];
  if (rowsBack.some((r) => String(r.workspace_id).toLowerCase() !== workspaceId.toLowerCase())) {
    await db().from(table).delete().in("id", rowsBack.map((r) => r.id as number));
    throw new Error("It could not be saved.");
  }
  const byId = new Map(rowsBack.map((r) => [Number(r.id), r]));
  return ids.map((id) => openRow(cipher, table, byId.get(id) ?? { id }));
}

/** A row of a Workspace with its sealed columns sealed for it, to insert or update; the row's key must be in it. */
export async function sealRow(table: OpenedTable, workspaceId: string, row: Row): Promise<Row> {
  return sealed(await workspaceCipher(workspaceId), table, row);
}

/** A row read from a table, its sealed columns opened (null for one that does not open). Rows without an id are
 * returned as they are: nothing sealed can be opened without knowing its row. */
export function openRow<T extends Row>(cipher: WorkspaceCipher, table: OpenedTable, row: T): T {
  if (row === null || row === undefined) return row;
  const key = row[ROW_KEY[table]];
  const out: Row = { ...row };
  // Without its row nothing sealed can be opened, and it must not pass on as it is either: it reads as missing.
  if (key === undefined || key === null) {
    for (const column of COLUMNS[table]) if (isSealed(row[column] as string)) out[column] = null;
    return out as T;
  }
  for (const column of COLUMNS[table]) {
    if (column in row && typeof row[column] === "string") out[column] = cipher.open({ table, column, row: key as string | number }, row[column] as string);
  }
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

/** An event's details sealed for its row, as audit-log.ts stores them; as they are where nothing is sealed. */
export function sealDetails(cipher: WorkspaceCipher, row: Row): Row {
  return cipher.sealing ? { ...row, details: { sealed: cipher.seal({ table: "audit_events", column: "details", row: row.id as number }, JSON.stringify(row.details ?? {})) } } : row;
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
