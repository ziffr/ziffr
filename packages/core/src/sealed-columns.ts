// Sealed columns (spec 0028, ticket #246; GLOSSARY: Workspace Key): which columns hold a Workspace's words sealed with
// its key, and the few helpers every core function uses to write and read them. A row is written sealed, with its id
// taken first, so the sealed value is bound to that row; a row is read opened, plain rows written before passing
// through as they are until the re-encryption job (#247) seals them. Security: callers never write one of these
// columns by hand, and a Workspace whose key cannot be unwrapped or is gone is refused, never written in clear.
import { db } from "./db";
import { workspaceCipher, type WorkspaceCipher } from "./workspace-keys";

/** The columns sealed with the Workspace Key, by table (step 1: free text). The re-encryption job and its done check
 * read this list too. */
export const SEALED_COLUMNS = {
  thread_messages: ["body"],
  actions: ["question"],
} as const;

/** A table with sealed columns. */
export type SealedTable = keyof typeof SEALED_COLUMNS;

type Row = Record<string, unknown>;

/** Takes the ids the next rows of a table will have, from its own sequence. */
async function reserveIds(table: SealedTable, count: number): Promise<number[]> {
  const { data, error } = await db().rpc("reserve_row_ids", { p_table: table, p_count: count });
  if (error || !Array.isArray(data) || data.length !== count) throw new Error("The row could not be prepared.");
  return (data as (number | string)[]).map(Number);
}

/** A row's sealed columns sealed for it, the rest as they are. Columns left out of the row stay out. */
function sealed(cipher: WorkspaceCipher, table: SealedTable, row: Row): Row {
  const out: Row = { ...row };
  for (const column of SEALED_COLUMNS[table]) {
    const v = row[column];
    if (typeof v === "string") out[column] = cipher.seal({ table, column, row: row.id as number }, v);
  }
  return out;
}

/** Inserts rows into one Workspace with their sealed columns sealed: ids are taken first, the Workspace is set on
 * every row. Answers what `select` names of the inserted rows, opened, in the order given. */
export async function insertSealed(table: SealedTable, workspaceId: string, rows: Row[], select = "id"): Promise<Row[]> {
  if (!rows.length) return [];
  const cipher = await workspaceCipher(workspaceId);
  const ids = await reserveIds(table, rows.length);
  const prepared = rows.map((r, i) => sealed(cipher, table, { ...r, id: ids[i], workspace_id: workspaceId }));
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

/** Seals the values of an update to one row of a Workspace (only the sealed columns it names change form). */
export async function sealUpdate(table: SealedTable, workspaceId: string, rowId: number, values: Row): Promise<Row> {
  return sealed(await workspaceCipher(workspaceId), table, { ...values, id: rowId });
}

/** A row read from a table, its sealed columns opened (null for one that does not open). Rows without an id are
 * returned as they are: nothing sealed can be opened without knowing its row. */
export function openRow<T extends Row>(cipher: WorkspaceCipher, table: SealedTable, row: T): T {
  if (row === null || row === undefined || row.id === undefined || row.id === null) return row;
  const out: Row = { ...row };
  for (const column of SEALED_COLUMNS[table]) {
    if (column in row && typeof row[column] === "string") out[column] = cipher.open({ table, column, row: row.id as number }, row[column] as string);
  }
  return out as T;
}

/** Rows of one Workspace read from a table, their sealed columns opened, with one key lookup. */
export async function openRows<T extends Row>(table: SealedTable, workspaceId: string, rows: T[] | null | undefined): Promise<T[]> {
  if (!rows?.length) return rows ?? [];
  const cipher = await workspaceCipher(workspaceId);
  return rows.map((r) => openRow(cipher, table, r));
}
