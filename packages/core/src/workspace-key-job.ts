// The re-encryption job (spec 0028, ticket #247; GLOSSARY: Workspace Key, Installation Admin): gives every Workspace a
// key, seals the plain rows of the sealed columns table by table in small batches, moves rows under an older key
// version to the current one, and checks each column off when nothing plain or old is left and every sealed value
// opens. It keeps no cursor: what is left to do is read from the data, so it can stop and start at any time, and every
// row is written only if it has not changed since it was read, so two jobs at once, or a person saving a row while it
// runs, never lose a write. Security: nothing here logs or returns a key, a value or a row; its answers are counts.
import { db } from "./db";
import { ROW_KEY, SEALED_COLUMNS, sealDetails, type SealedTable } from "./sealed-columns";
import { secretsKey } from "./secrets";
import { DEMO_WORKSPACE_ID } from "./team";
import { ensureWorkspaceKey, forgetWorkspaceKey, isSealed, sealedVersion, workspaceCipher, type WorkspaceCipher } from "./workspace-keys";

/** Rows sealed per batch (spec 0028). */
export const SEAL_BATCH = 500;

/** The tables in the order they are sealed. */
const TABLES = Object.keys(SEALED_COLUMNS) as SealedTable[];

type Row = Record<string, unknown>;

/** What one run did, as counts. `waiting` is true when the Installation has no ZIFFR_SECRETS_KEY yet. */
export type KeyJobResult = {
  waiting: boolean; workspaces: number; keysMade: number; rowsSealed: number; rowsMoved: number;
  heldBack: number; unopenable: number; columnsDone: number; errors: number; stoppedEarly: boolean;
};

const empty = (): KeyJobResult => ({ waiting: false, workspaces: 0, keysMade: 0, rowsSealed: 0, rowsMoved: 0, heldBack: 0, unopenable: 0, columnsDone: 0, errors: 0, stoppedEarly: false });

/** How one row came out. */
type Outcome = "sealed" | "moved" | "changed" | "held" | "unopenable" | "error";

/** One candidate row of seal_candidates: seals (or moves to the current key version) its columns, writing only if it is as it was read. */
export async function sealCandidate(cipher: WorkspaceCipher, workspaceId: string, table: SealedTable, row: Row, unopenableColumns: string[] = []): Promise<Outcome> {
  const key = String(row.key);
  const current = cipher.version as number;
  const at = (column: string) => ({ table, column, row: key });
  if (table === "audit_events") return sealEvent(cipher, key, row, current, unopenableColumns);
  const set: Row = {};
  const was: [string, string][] = [];
  let plainRow = false;
  let unopenable = false;
  const opened: Record<string, string> = {};
  for (const column of SEALED_COLUMNS[table]) {
    const v = row[column];
    if (typeof v !== "string") continue;
    if (!isSealed(v)) {
      set[column] = cipher.seal(at(column), v);
      was.push([column, v]);
      opened[column] = v;
      plainRow = true;
    } else {
      const text = cipher.open(at(column), v);
      // In the sealed format but not opening: counted apart, never overwritten.
      if (text === null) { unopenable = true; unopenableColumns.push(column); continue; }
      opened[column] = text;
      if ((sealedVersion(v) ?? current) < current) { set[column] = cipher.seal(at(column), text); was.push([column, v]); }
    }
  }
  // A Contact's blind indexes follow their address and handle: set when sealing it, and where one is missing.
  if (table === "contacts") {
    for (const [column, index] of [["email", "email_index"], ["slack_handle", "slack_index"]] as const) {
      const text = opened[column];
      if (text === undefined) continue;
      const wanted = cipher.blindIndex(`contacts.${column}`, text);
      if (wanted !== null && (column in set || row[index] === null || row[index] === undefined || String(row[index]).split(".")[1] !== String(current))) set[index] = wanted;
    }
  }
  if (!Object.keys(set).length) return unopenable ? "unopenable" : "changed";
  // A Contact's name: the database applies the scope again as it writes (still a Contact of this Workspace alone).
  if (table === "profiles") {
    const { data, error } = await db().rpc("seal_contact_name", { p_workspace: workspaceId, p_person: key, p_name_was: String(row.name), p_name: String(set.name) });
    if (error) return "error";
    return data === true ? (plainRow ? "sealed" : "moved") : "changed";
  }
  let q = db().from(table).update(set).eq(ROW_KEY[table], key);
  q = q.eq("workspace_id", workspaceId);
  for (const [column, text] of was) q = q.eq(column, text);
  // A blind index is of the value it was taken from: the row must still hold it, also where only the index is set.
  if (table === "contacts") for (const [column, index] of [["email", "email_index"], ["slack_handle", "slack_index"]] as const) if (index in set && !was.some(([c]) => c === column)) q = q.eq(column, String(row[column]));
  // A Contact's index only filled in: the row must still lack it.
  if (!was.length && table === "contacts") for (const index of ["email_index", "slack_index"]) if (index in set) q = q.is(index, null);
  const { data, error } = await q.select(ROW_KEY[table]);
  if (error) {
    // Two Contacts with the same address now share a blind index: held back and reported, never dropped.
    return error.code === "23505" ? "held" : "error";
  }
  if (!data?.length) return "changed";
  return plainRow ? "sealed" : "moved";
}

/** Seals an Audit Log event's object name and details: the database allows only this change, in this function. */
async function sealEvent(cipher: WorkspaceCipher, key: string, row: Row, current: number, unopenableColumns: string[]): Promise<Outcome> {
  const id = Number(key);
  const at = (column: string) => ({ table: "audit_events", column, row: key });
  const nameWas = typeof row.object_name === "string" ? row.object_name : null;
  let name = nameWas;
  let plain = false;
  if (nameWas !== null) {
    if (!isSealed(nameWas)) { name = cipher.seal(at("object_name"), nameWas); plain = true; }
    else {
      const text = cipher.open(at("object_name"), nameWas);
      if (text === null) { unopenableColumns.push("object_name"); return "unopenable"; }
      if ((sealedVersion(nameWas) ?? current) < current) name = cipher.seal(at("object_name"), text);
    }
  }
  const detailsWas = (row.details ?? {}) as Row;
  const wrapper = Object.keys(detailsWas).length === 1 && typeof detailsWas.sealed === "string" && isSealed(detailsWas.sealed) ? detailsWas.sealed : null;
  let details = detailsWas;
  if (wrapper === null) { details = sealDetails(cipher, { id, details: detailsWas }).details as Row; plain = true; }
  else {
    const text = cipher.open(at("details"), wrapper);
    if (text === null) { unopenableColumns.push("details"); return "unopenable"; }
    if ((sealedVersion(wrapper) ?? current) < current) details = { sealed: cipher.seal(at("details"), text) };
  }
  if (name === nameWas && details === detailsWas) return "changed";
  const { data, error } = await db().rpc("seal_audit_event", { p_id: id, p_name_was: nameWas, p_name: name, p_details_was: detailsWas, p_details: details });
  if (error) return "error";
  return data === true ? (plain ? "sealed" : "moved") : "changed";
}

/** How far the check that every sealed value of a column opens has come: how many did not, and the last row opened. */
type Verified = { bad: number; through: string | null; complete: boolean };

/** Opens the sealed values of one column, from the row after `resume.through`, to see that each one opens. Keeps to
 * the deadline and says where it stopped, so a column of millions of rows is checked over several runs. Null when a
 * read failed. */
async function verifyColumn(cipher: WorkspaceCipher, workspaceId: string, table: SealedTable, column: string, deadline: number, resume: { through: string | null; bad: number }): Promise<Verified | null> {
  const keyColumn = ROW_KEY[table];
  let bad = resume.bad;
  let through = resume.through;
  const check = (r: Row): void => {
    const place = { table, column, row: String(r[keyColumn]) };
    if (column === "details") {
      const d = r.details as Row | null;
      if (d && Object.keys(d).length === 1 && typeof d.sealed === "string" && isSealed(d.sealed) && cipher.open(place, d.sealed) === null) bad += 1;
    } else if (isSealed(r[column] as string) && cipher.open(place, r[column] as string) === null) bad += 1;
  };
  for (;;) {
    if (Date.now() > deadline) return { bad, through, complete: false };
    // A Contact's name sits in a person row of its own: the Workspace's Contacts in key order, a hundred at a time.
    if (table === "profiles") {
      let q = db().from("contacts").select("person_id").eq("workspace_id", workspaceId).order("person_id").limit(100);
      if (through !== null) q = q.gt("person_id", through);
      const { data: contacts, error: ce } = await q;
      if (ce) return null;
      const ids = (contacts ?? []).map((r) => String(r.person_id));
      if (!ids.length) return { bad, through: null, complete: true };
      const { data, error } = await db().from("profiles").select("id, name").eq("role", "Contact").in("id", ids);
      if (error) return null;
      for (const r of (data ?? []) as Row[]) check(r);
      through = ids[ids.length - 1];
      if (ids.length < 100) return { bad, through: null, complete: true };
      continue;
    }
    let q = db().from(table).select(`${keyColumn}, ${column}`).eq("workspace_id", workspaceId).order(keyColumn).limit(1000);
    if (through !== null) q = q.gt(keyColumn, through);
    const { data, error } = await q;
    if (error) return null;
    const rows = (data ?? []) as unknown as Row[];
    for (const r of rows) check(r);
    if (rows.length < 1000) return { bad, through: null, complete: true };
    through = String(rows[rows.length - 1][keyColumn]);
  }
}

type Count = { table_name: string; column_name: string; total: number; plain: number; old_version: number };

/** The longest one Workspace holds the job in a turn, so a big one cannot keep the others waiting. */
const WORKSPACE_SECONDS = 20;

/** One Workspace: its key made if it has none, then its tables sealed until none is left or the time is up. */
async function passWorkspace(id: string, globalDeadline: number, batch: number, out: KeyJobResult): Promise<void> {
  const claimed = await db().rpc("claim_seal_pass", { p_workspace: id, p_minutes: 10 });
  if (claimed.error || claimed.data !== true) return;
  const deadline = Math.min(globalDeadline, Date.now() + WORKSPACE_SECONDS * 1000);
  let full = false;
  try {
    // Read fresh: a key version made current by another process counts from this pass on.
    forgetWorkspaceKey(id);
    const hadKey = await db().from("workspace_keys").select("version", { count: "exact", head: true }).eq("workspace_id", id);
    if (!(await ensureWorkspaceKey(id))) return;
    if (!hadKey.count) out.keysMade += 1;
    const cipher = await workspaceCipher(id);
    if (!cipher.sealing || cipher.version === null) return;
    // Per "table.column": rows the pass held back (on the table's first column) and ones that would not open.
    const held: Record<string, number> = {};
    const unopenableSeen: Record<string, number> = {};
    for (const table of TABLES) {
      const skip: string[] = [];
      for (;;) {
        if (Date.now() > deadline) { out.stoppedEarly = true; return; }
        const { data, error } = await db().rpc("seal_candidates", { p_workspace: id, p_table: table, p_current: cipher.version, p_skip: skip, p_limit: batch });
        if (error) { out.errors += 1; break; }
        const rows = (data ?? []) as Row[];
        if (!rows.length) break;
        // Rows of a batch one after another: each is its own compare-and-swap, and the database is not hammered.
        for (const row of rows) {
          const bad: string[] = [];
          const outcome = await sealCandidate(cipher, id, table, row, bad);
          for (const column of bad) unopenableSeen[`${table}.${column}`] = (unopenableSeen[`${table}.${column}`] ?? 0) + 1;
          if (outcome === "sealed") out.rowsSealed += 1;
          else if (outcome === "moved") out.rowsMoved += 1;
          else {
            // Changed since it was read, held, unopenable or failed: left out for the rest of this run and looked at
            // again by the next one (a person's own change to a row is always sealed, so it is not seen again).
            skip.push(String(row.key));
            if (outcome === "held") { out.heldBack += 1; held[`${table}.${SEALED_COLUMNS[table][0]}`] = (held[`${table}.${SEALED_COLUMNS[table][0]}`] ?? 0) + 1; }
            if (outcome === "unopenable") out.unopenable += 1;
            if (outcome === "error") out.errors += 1;
          }
        }
        if (rows.length < batch) break;
      }
    }
    // The done check: one count per column.
    const { data: counts, error } = await db().rpc("seal_counts", { p_workspace: id, p_current: cipher.version });
    if (error || !counts) { out.errors += 1; return; }
    const { data: before } = await db().from("workspace_seal_progress").select("table_name, column_name, unopenable, verified_through, done_at").eq("workspace_id", id);
    const prior = new Map((before ?? []).map((r) => [`${r.table_name}.${r.column_name}`, r]));
    let unfinished = false;
    for (const c of counts as Count[]) {
      const name = `${c.table_name}.${c.column_name}`;
      const was = prior.get(name);
      let unopenable = Number(was?.unopenable ?? 0);
      let through: string | null = (was?.verified_through as string | null | undefined) ?? null;
      let doneAt: string | null = null;
      // Nothing plain, and nothing old but what would not open: the column is checked off once its sealed values are
      // all seen to open (those that do not are counted apart as unopenable). From then on the core refuses plain
      // values here. A big column is checked over several runs, from where the last one stopped.
      const clear = Number(c.plain) === 0 && Number(c.old_version) <= (unopenableSeen[name] ?? 0);
      if (clear && was?.done_at) doneAt = String(was.done_at);
      else if (clear) {
        const seen = await verifyColumn(cipher, id, c.table_name as SealedTable, c.column_name, deadline, { through, bad: through === null ? 0 : unopenable });
        if (seen === null) { out.errors += 1; unfinished = true; continue; }
        unopenable = seen.bad;
        through = seen.through;
        if (seen.complete) { doneAt = new Date().toISOString(); out.columnsDone += 1; } else { unfinished = true; out.stoppedEarly = true; }
      } else through = null;
      await db().from("workspace_seal_progress").upsert({
        workspace_id: id, table_name: c.table_name, column_name: c.column_name, total: Number(c.total), plain: Number(c.plain), old_version: Number(c.old_version),
        unopenable, held_back: held[name] ?? 0, verified_through: through, checked_at: new Date().toISOString(), done_at: doneAt,
      });
    }
    full = !unfinished;
  } catch {
    // Nothing logged: the message could only name a Workspace's key trouble; the page shows which Workspaces wait.
    out.errors += 1;
  } finally {
    await db().rpc("end_seal_pass", { p_workspace: id, p_full: full });
  }
}

/** The Workspaces to look at, most in need first: ones never gone through, ones with a column not yet checked off,
 * then the longest unchecked (a pass over a finished one is a handful of counts, once a day). The demo never. */
async function dueWorkspaces(limit: number): Promise<string[]> {
  const ids: string[] = [];
  const add = (rows: { id?: unknown; workspace_id?: unknown }[] | null) => { for (const r of rows ?? []) { const id = String(r.id ?? r.workspace_id); if (id !== DEMO_WORKSPACE_ID && !ids.includes(id)) ids.push(id); } };
  add((await db().from("workspaces").select("id").is("sealed_checked_at", null).neq("id", DEMO_WORKSPACE_ID).order("created_at").limit(limit)).data);
  add((await db().from("workspace_seal_progress").select("workspace_id").is("done_at", null).order("checked_at").limit(limit)).data);
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  add((await db().from("workspaces").select("id").lt("sealed_checked_at", dayAgo).neq("id", DEMO_WORKSPACE_ID).order("sealed_checked_at").limit(limit)).data);
  return ids.slice(0, limit);
}

/** Runs the job for up to `seconds`: the scheduler calls it every few minutes and what is left waits for the next call. */
export async function reencryptionJob(options: { seconds?: number; batch?: number; only?: string[] } = {}): Promise<KeyJobResult> {
  const out = empty();
  // Without ZIFFR_SECRETS_KEY nothing can be wrapped or sealed: the Installation works as before and the job waits.
  if (!secretsKey()) return { ...out, waiting: true };
  const deadline = Date.now() + (options.seconds ?? 45) * 1000;
  for (const id of options.only ? options.only.filter((w) => w !== DEMO_WORKSPACE_ID) : await dueWorkspaces(200)) {
    if (Date.now() > deadline) { out.stoppedEarly = true; break; }
    out.workspaces += 1;
    await passWorkspace(id, deadline, Math.min(Math.max(options.batch ?? SEAL_BATCH, 1), 1000), out);
  }
  return out;
}
