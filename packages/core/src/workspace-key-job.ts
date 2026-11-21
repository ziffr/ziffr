// The re-encryption job (spec 0028, ticket #247; GLOSSARY: Workspace Key, Installation Admin): gives every Workspace a
// key, seals the plain rows of the sealed columns table by table in small batches, moves rows under an older key
// version to the current one, and checks each column off when nothing plain or old is left and every sealed value
// opens. Beyond the sealed columns it also covers Breakdown labels with their index and history, a Webhook's external
// task id with its hash, and the words sealed inside JSON columns (Findings, Snapshots, Versions, View Links); it wraps
// Workspace Keys again after the Installation key changed and destroys a retired key version once nothing refers to it
// (spec 0028, ticket #250). It keeps no cursor: what is left to do is read from the data, so it can stop and start at any time, and every
// row is written only if it has not changed since it was read, so two jobs at once, or a person saving a row while it
// runs, never lose a write. Security: nothing here logs or returns a key, a value or a row; its answers are counts.
import { db } from "./db";
import { ALL_SEALED_COLUMNS, numberPlace, ROW_KEY, SEALED_NUMBERS, sealDetails, sealedNumberColumn, type NumberTable, type OpenedTable } from "./sealed-columns";
import { resealThing, SEALED_THINGS, type SealedThing } from "./sealed-things";
import { secretsKey } from "./secrets";
import { DEMO_WORKSPACE_ID } from "./team";
import { activateWorkspaceKeys, ensureWorkspaceKey, forgetWorkspaceKey, isSealed, KEY_SETTLE_SECONDS, keyVersions, rewrapInstallationKeys, sealedVersion, takeRewrapFailures, workspaceCipher, type WorkspaceCipher } from "./workspace-keys";

/** Rows sealed per batch (spec 0028). */
export const SEAL_BATCH = 500;

/** The tables in the order they are sealed: the sealed columns, then Breakdown rows and their history, then the tables
 * that hold only numbers (step 2, ticket #248). */
const TABLES = [...new Set([...Object.keys(ALL_SEALED_COLUMNS), ...Object.keys(SEALED_NUMBERS)])] as OpenedTable[];

const textColumns = (table: OpenedTable): readonly string[] => (ALL_SEALED_COLUMNS as Record<string, readonly string[]>)[table] ?? [];
const numberColumns = (table: OpenedTable): readonly string[] => (SEALED_NUMBERS as Record<string, readonly string[]>)[table] ?? [];

/** The tables whose rows carry a blind index beside a sealed column: [sealed column, index column]. The index is
 * recomputed with the value, under the current key version, so a row is found again whichever version wrote it. */
const INDEXES: Partial<Record<OpenedTable, readonly (readonly [string, string])[]>> = {
  contacts: [["email", "email_index"], ["slack_handle", "slack_index"]],
  breakdown_rows: [["label", "label_index"]],
  webhook_external_ids: [["external_id", "external_hash"]],
};

/** The blind index of a value for its row (the purposes and inputs the core's own writers use). */
function indexOf(cipher: WorkspaceCipher, table: OpenedTable, column: string, text: string, row: Row): string | null {
  if (table === "webhook_external_ids") return cipher.blindIndex("webhook_external_ids.external_id", `${String(row.webhook_id)}\0${String(row.system)}\0${Buffer.from(text, "utf8").toString("hex")}`);
  return cipher.blindIndex(`${table}.${column}`, text);
}

/** The key version a blind index ("b1.<version>.<hash>") names; 0 for none, or a plain hash from before sealing. */
const indexVersion = (v: unknown): number => (typeof v === "string" ? Number(/^b1\.([1-9][0-9]{0,8})\./.exec(v)?.[1] ?? 0) : 0);

/** Where a value of a row is sealed: a Breakdown history entry copies the label of the row it came from, so it is
 * sealed for that row; an older entry, with no row, for its own id. */
export function placeOf(table: OpenedTable, column: string, row: Row, key: string): { table: string; column: string; row: string } {
  if (table === "breakdown_history" && row.row_id !== null && row.row_id !== undefined) return { table: "breakdown_rows", column, row: String(row.row_id) };
  return { table, column, row: key };
}

type Row = Record<string, unknown>;

/** What one run did, as counts. `waiting` is true when the Installation has no ZIFFR_SECRETS_KEY yet. */
export type KeyJobResult = {
  waiting: boolean; workspaces: number; keysMade: number; rowsSealed: number; rowsMoved: number;
  heldBack: number; unopenable: number; columnsDone: number; errors: number; stoppedEarly: boolean;
  /** Workspace Keys wrapped again under the current Installation key, ones that could not be, ones still under the previous key. */
  rewrapped: number; rewrapFailed: number; rewrapLeft: number;
  /** Retired key versions destroyed because nothing refers to them any more. */
  keysDestroyed: number;
};

const empty = (): KeyJobResult => ({ waiting: false, workspaces: 0, keysMade: 0, rowsSealed: 0, rowsMoved: 0, heldBack: 0, unopenable: 0, columnsDone: 0, errors: 0, stoppedEarly: false, rewrapped: 0, rewrapFailed: 0, rewrapLeft: 0, keysDestroyed: 0 });

/** How one row came out. */
type Outcome = "sealed" | "moved" | "changed" | "held" | "unopenable" | "error";

/** One candidate row of seal_candidates: seals (or moves to the current key version) its columns, writing only if it is as it was read. */
export async function sealCandidate(cipher: WorkspaceCipher, workspaceId: string, table: OpenedTable, row: Row, unopenableColumns: string[] = []): Promise<Outcome> {
  const outcomes: Outcome[] = [];
  if (textColumns(table).length) outcomes.push(await sealTexts(cipher, workspaceId, table, row, unopenableColumns));
  if (numberColumns(table).length) outcomes.push(await sealNumbers(cipher, workspaceId, table as NumberTable, row, unopenableColumns));
  // The worst outcome of the parts counts, then the one that wrote.
  for (const o of ["error", "held"] as const) if (outcomes.includes(o)) return o;
  for (const o of ["sealed", "moved", "unopenable"] as const) if (outcomes.includes(o)) return o;
  return "changed";
}

/** The numbers of one row sealed, or moved to the current key version (spec 0028 step 2): each number is sealed as its
 * exact text for its place, and seal_number writes it only if the row still holds what the job read. */
async function sealNumbers(cipher: WorkspaceCipher, workspaceId: string, table: NumberTable, row: Row, unopenableColumns: string[]): Promise<Outcome> {
  const current = cipher.version as number;
  const key = String(row.key);
  const outcomes: Outcome[] = [];
  for (const column of SEALED_NUMBERS[table]) {
    const stored = row[sealedNumberColumn(column)];
    const plain = row[column];
    const place = numberPlace(table, column, { ...row, id: key });
    let was: string;
    let next: string;
    let done: Outcome;
    if (typeof stored === "string") {
      const text = place ? cipher.open(place, stored) : null;
      if (text === null) { unopenableColumns.push(column); outcomes.push("unopenable"); continue; }
      if ((sealedVersion(stored) ?? current) >= current) continue;
      [was, next, done] = [stored, cipher.seal(place!, text), "moved"];
    } else if (typeof plain === "string" && place) {
      [was, next, done] = [plain, cipher.seal(place, plain), "sealed"];
    } else continue;
    const { data, error } = await db().rpc("seal_number", { p_workspace: workspaceId, p_table: table, p_key: key, p_column: column, p_was: was, p_sealed: next });
    outcomes.push(error ? "error" : data === true ? done : "changed");
  }
  for (const o of ["error", "sealed", "moved", "unopenable"] as const) if (outcomes.includes(o)) return o;
  return "changed";
}

/** The sealed text columns of one row sealed, or moved to the current key version. */
async function sealTexts(cipher: WorkspaceCipher, workspaceId: string, table: OpenedTable, row: Row, unopenableColumns: string[]): Promise<Outcome> {
  const key = String(row.key);
  const current = cipher.version as number;
  const at = (column: string) => placeOf(table, column, row, key);
  if (table === "audit_events") return sealEvent(cipher, key, row, current, unopenableColumns);
  const set: Row = {};
  const was: [string, string][] = [];
  let plainRow = false;
  let unopenable = false;
  const opened: Record<string, string> = {};
  for (const column of textColumns(table)) {
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
  // A blind index follows the value it was taken from (a Contact's address and handle, a Breakdown label, a Webhook's
  // external task): set when sealing it, and where it is missing or of an older key version.
  const indexes = INDEXES[table] ?? [];
  for (const [column, index] of indexes) {
    const text = opened[column];
    if (text === undefined) continue;
    const wanted = indexOf(cipher, table, column, text, row);
    if (wanted !== null && (column in set || indexVersion(row[index]) !== current)) set[index] = wanted;
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
  // A blind index is of the value it was taken from: the row must still hold that value and that index, also where
  // only the index is set.
  for (const [column, index] of indexes) {
    if (!(index in set)) continue;
    if (!was.some(([c]) => c === column)) q = q.eq(column, String(row[column]));
    q = row[index] === null || row[index] === undefined ? q.is(index, null) : q.eq(index, String(row[index]));
  }
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
async function verifyColumn(cipher: WorkspaceCipher, workspaceId: string, table: OpenedTable, column: string, deadline: number, resume: { through: string | null; bad: number }): Promise<Verified | null> {
  const keyColumn = ROW_KEY[table];
  const isNumber = numberColumns(table).includes(column);
  let bad = resume.bad;
  let through = resume.through;
  const check = (r: Row): void => {
    if (isNumber) {
      const stored = r[sealedNumberColumn(column)];
      const at = numberPlace(table as NumberTable, column, { ...r, id: r[keyColumn] });
      if (typeof stored === "string" && (at === null || cipher.open(at, stored) === null)) bad += 1;
      return;
    }
    const place = placeOf(table, column, r, String(r[keyColumn]));
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
    const wanted = isNumber ? [keyColumn, sealedNumberColumn(column), ...(EXTRA_PLACE_COLUMNS[table] ?? [])].join(", ") : table === "breakdown_history" ? `${keyColumn}, ${column}, row_id` : `${keyColumn}, ${column}`;
    let q = db().from(table).select(wanted).eq("workspace_id", workspaceId).order(keyColumn).limit(1000);
    if (through !== null) q = q.gt(keyColumn, through);
    const { data, error } = await q;
    if (error) return null;
    const rows = (data ?? []) as unknown as Row[];
    for (const r of rows) check(r);
    if (rows.length < 1000) return { bad, through: null, complete: true };
    through = String(rows[rows.length - 1][keyColumn]);
  }
}

/** The columns besides its id that a history or series number's place needs (see numberPlace). */
const EXTRA_PLACE_COLUMNS: Partial<Record<OpenedTable, string[]>> = { observation_history: ["observation_id"], breakdown_history: ["row_id"], series_values: ["metric_id", "kind", "period_start"] };

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
    // A key version whose time has come takes over now; then read fresh, so this pass seals with it.
    await activateWorkspaceKeys(id);
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
            if (outcome === "held") { out.heldBack += 1; const first = `${table}.${textColumns(table)[0] ?? numberColumns(table)[0]}`; held[first] = (held[first] ?? 0) + 1; }
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
        const seen = await verifyColumn(cipher, id, c.table_name as OpenedTable, c.column_name, deadline, { through, bad: through === null ? 0 : unopenable });
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
    // The words sealed inside JSON columns: scanned row by row, since the database cannot count words inside JSON.
    const progress = await db().from("workspace_seal_progress").select("table_name, column_name, total, plain, unopenable, held_back, verified_through, done_at, done_version, scan_started_at").eq("workspace_id", id);
    const versions = await keyVersions(id);
    const now = await databaseNow();
    for (const thing of SEALED_THINGS) {
      const was = (progress.data ?? []).find((r) => r.table_name === thing.table && r.column_name === thing.column) as ProgressRow | undefined;
      if (!scanDue(was, cipher.version, versions, now)) continue;
      if (!(await scanThing(cipher, id, thing, deadline, was, now, out))) unfinished = true;
    }
    full = !unfinished;
    if (full) out.keysDestroyed += await destroySettledKeys(id, cipher.version, versions, now);
  } catch {
    // Nothing logged: the message could only name a Workspace's key trouble; the page shows which Workspaces wait.
    out.errors += 1;
  } finally {
    await db().rpc("end_seal_pass", { p_workspace: id, p_full: full });
  }
}

/** The database's clock in milliseconds, for the settle rules (key versions are retired by its clock, not this
 * server's); this server's when it cannot be asked. */
async function databaseNow(): Promise<number> {
  const { data, error } = await db().rpc("seal_now");
  const t = error || typeof data !== "string" ? NaN : Date.parse(data);
  return Number.isNaN(t) ? Date.now() : t;
}

/** One row of a sealed JSON column as the scan reads it. */
async function readThing(workspaceId: string, thing: SealedThing, id: number): Promise<{ id: number; value: unknown; object_type?: string; object_id?: number; version?: number } | null> {
  const select = thing.table === "versions" ? "id, object_type, object_id, version, snapshot" : `id, ${thing.column}`;
  const { data } = await db().from(thing.table).select(select).eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
  const r = data as unknown as Row | null;
  return r ? { id: r.id as number, value: r[thing.column], object_type: r.object_type as string | undefined, object_id: r.object_id as number | undefined, version: r.version as number | undefined } : null;
}

/** Writes a re-sealed value of a JSON column if the column still holds what was read: "sealed" when it did, "changed"
 * when not. A value that does not survive the trip through JavaScript (a number of more than 15 digits) never matches
 * what the database holds: the scan reads such a row once more and, if it fails again, counts it as held back. */
async function writeThing(workspaceId: string, thing: SealedThing, id: number, was: unknown, next: unknown): Promise<"sealed" | "changed" | "error"> {
  const { data, error } = await db().rpc("seal_json", { p_workspace: workspaceId, p_table: thing.table, p_column: thing.column, p_id: id, p_was: was, p_new: next });
  if (error) return "error";
  return data === true ? "sealed" : "changed";
}

/** What the job keeps of one scanned JSON column in workspace_seal_progress. */
type ProgressRow = { total: number; plain: number; unopenable: number; held_back: number; verified_through: string | null; done_at: string | null; done_version: number | null; scan_started_at: string | null };

/** The newest time a retired key version that still exists was retired; null when there is none. */
function lastRetired(versions: { version: number; retiredAt: string | null }[], current: number): number | null {
  const times = versions.filter((v) => v.version < current && v.retiredAt).map((v) => Date.parse(v.retiredAt as string));
  return times.length ? Math.max(...times) : null;
}

/** Whether a scanned column needs a scan now: never finished, finished under an older key version, or, once a retired
 * key version has been settled, not yet scanned since (a process that still held the old key set could have sealed
 * under it until then, so the destroying of that version waits for a scan that began after). Pure. */
export function scanDue(was: Pick<ProgressRow, "done_at" | "done_version" | "scan_started_at" | "verified_through"> | undefined, current: number, versions: { version: number; retiredAt: string | null }[], now: number): boolean {
  if (!was || !was.done_at || was.done_version !== current) return true;
  const retired = lastRetired(versions, current);
  if (retired === null) return false;
  const settled = retired + KEY_SETTLE_SECONDS * 1000;
  return now >= settled && Date.parse(was.scan_started_at ?? "1970-01-01") < settled;
}

/** The rows read per page of a scan. */
const SCAN_PAGE = 100;

/** Moves the words of one JSON column of one Workspace to the current key version, row by row, each written only if it
 * is as it was read. Goes on from where an earlier run stopped when that run was under the same key version. Records
 * how far it is; true when the whole column was gone through and no row was left behind. */
async function scanThing(cipher: WorkspaceCipher, workspaceId: string, thing: SealedThing, deadline: number, was: ProgressRow | undefined, now: number, out: KeyJobResult): Promise<boolean> {
  const current = cipher.version as number;
  const resuming = Boolean(was && !was.done_at && was.done_version === current && was.verified_through !== null);
  let through: string | null = resuming ? was!.verified_through : null;
  let total = resuming ? Number(was!.total) : 0;
  let bad = resuming ? Number(was!.unopenable) : 0;
  // Rows an earlier run of this scan left behind count too: a resumed scan is finished only if none was.
  let left = resuming ? Number(was!.plain) : 0;
  let stuck = resuming ? Number(was!.held_back) : 0;
  const startedAt = resuming && was!.scan_started_at ? was!.scan_started_at : new Date(now).toISOString();
  let complete = false;
  let failed = false;
  const select = thing.table === "versions" ? "id, object_type, object_id, version, snapshot" : `id, ${thing.column}`;
  for (;;) {
    if (Date.now() > deadline) { out.stoppedEarly = true; break; }
    let q = db().from(thing.table).select(select).eq("workspace_id", workspaceId).order("id").limit(SCAN_PAGE);
    if (through !== null) q = q.gt("id", Number(through));
    const { data, error } = await q;
    if (error) { out.errors += 1; failed = true; break; }
    const rows = (data ?? []) as unknown as Row[];
    for (const r of rows) {
      total += 1;
      const done = resealThing(cipher, thing, { id: r.id as number, value: r[thing.column], object_type: r.object_type as string | undefined, object_id: r.object_id as number | undefined, version: r.version as number | undefined });
      if (done.unopenable) { bad += 1; out.unopenable += 1; continue; }
      if (!done.changed) continue;
      const written = await writeThing(workspaceId, thing, r.id as number, r[thing.column], done.value);
      if (written === "error") { out.errors += 1; left += 1; } else if (written === "sealed") out.rowsSealed += 1;
      else {
        // Changed since it was read, by a person's own save (which seals) or another job: read it again once.
        const again = await readThing(workspaceId, thing, r.id as number);
        if (again === null) continue;
        const redone = resealThing(cipher, thing, again);
        if (redone.unopenable) { bad += 1; out.unopenable += 1; continue; }
        if (!redone.changed) continue;
        const second = await writeThing(workspaceId, thing, r.id as number, again.value, redone.value);
        if (second === "sealed") out.rowsSealed += 1;
        else if (second === "error") { out.errors += 1; left += 1; } else { stuck += 1; out.heldBack += 1; }
      }
    }
    if (rows.length) through = String(rows[rows.length - 1].id);
    if (rows.length < SCAN_PAGE) { complete = true; break; }
  }
  // A row left behind (changed while it was read, or a write that failed) is looked at again by the next scan.
  const finished = complete && !failed && left === 0 && stuck === 0;
  if (finished) out.columnsDone += 1;
  await db().from("workspace_seal_progress").upsert({
    workspace_id: workspaceId, table_name: thing.table, column_name: thing.column, total, plain: left, old_version: 0, unopenable: bad, held_back: stuck,
    verified_through: finished || complete ? null : through, checked_at: new Date(now).toISOString(), done_at: finished ? new Date(now).toISOString() : null, done_version: current, scan_started_at: startedAt,
  });
  return finished;
}

/** Destroys the retired key versions nothing refers to any more: retired for at least KEY_SETTLE_SECONDS, no sealed
 * value or blind index under an older version (counted now, in the database), and every JSON column scanned under the
 * current version by a scan that began after the version had settled. Strict on purpose: a value that does not open
 * keeps its old key alive, and the page says so. Returns how many were destroyed. */
async function destroySettledKeys(workspaceId: string, current: number, versions: { version: number; retiredAt: string | null }[], now: number): Promise<number> {
  const old = versions.filter((v) => v.version < current && v.retiredAt && Date.parse(v.retiredAt) + KEY_SETTLE_SECONDS * 1000 <= now);
  if (!old.length) return 0;
  const { data: counts, error } = await db().rpc("seal_counts", { p_workspace: workspaceId, p_current: current });
  if (error || !counts || (counts as Count[]).some((c) => Number(c.plain) > 0 || Number(c.old_version) > 0)) return 0;
  const { data: scans } = await db().from("workspace_seal_progress").select("table_name, column_name, plain, unopenable, held_back, done_at, done_version, scan_started_at").eq("workspace_id", workspaceId);
  // Every progress row of the Workspace must be clean: nothing in clear, nothing held back, nothing that does not open.
  if ((scans ?? []).some((s) => Number(s.plain) > 0 || Number(s.held_back) > 0 || Number(s.unopenable) > 0)) return 0;
  let destroyed = 0;
  for (const v of old) {
    const settled = Date.parse(v.retiredAt as string) + KEY_SETTLE_SECONDS * 1000;
    const scanned = SEALED_THINGS.every((t) => {
      const r = (scans ?? []).find((s) => s.table_name === t.table && s.column_name === t.column);
      return r && r.done_at && r.done_version === current && Number(r.unopenable) === 0 && Number(r.held_back) === 0 && Date.parse(String(r.scan_started_at)) >= settled;
    });
    if (!scanned) continue;
    const { data } = await db().rpc("destroy_key_version", { p_workspace: workspaceId, p_version: v.version, p_settle_seconds: KEY_SETTLE_SECONDS });
    if (data === true) destroyed += 1;
  }
  if (destroyed) forgetWorkspaceKey(workspaceId);
  return destroyed;
}

/** The Workspaces to look at, most in need first: ones never gone through, ones with a column not yet checked off,
 * then the longest unchecked (a pass over a finished one is a handful of counts, once a day). The demo never. */
async function dueWorkspaces(limit: number): Promise<string[]> {
  const ids: string[] = [];
  const add = (rows: { id?: unknown; workspace_id?: unknown }[] | null) => { for (const r of rows ?? []) { const id = String(r.id ?? r.workspace_id); if (id !== DEMO_WORKSPACE_ID && !ids.includes(id)) ids.push(id); } };
  add((await db().from("workspaces").select("id").is("sealed_checked_at", null).neq("id", DEMO_WORKSPACE_ID).order("created_at").limit(limit)).data);
  add((await db().from("workspace_seal_progress").select("workspace_id").is("done_at", null).order("checked_at").limit(limit)).data);
  // A Workspace with a retired key version is looked at every run: the version goes once it has settled.
  add((await db().from("workspace_keys").select("workspace_id").or("retired_at.not.is.null,pending_until.not.is.null").limit(limit)).data);
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
  // Keys wrapped under the previous Installation key first (a short list, one row per Workspace). Failures are counted,
  // the ones of earlier loads in this process together with this run's.
  out.rewrapFailed = takeRewrapFailures();
  const wrapped = await rewrapInstallationKeys().catch(() => null);
  takeRewrapFailures();
  if (wrapped) { out.rewrapped = wrapped.rewrapped; out.rewrapFailed += wrapped.failed; out.rewrapLeft = wrapped.left; } else out.errors += 1;
  for (const id of options.only ? options.only.filter((w) => w !== DEMO_WORKSPACE_ID) : await dueWorkspaces(200)) {
    if (Date.now() > deadline) { out.stoppedEarly = true; break; }
    out.workspaces += 1;
    await passWorkspace(id, deadline, Math.min(Math.max(options.batch ?? SEAL_BATCH, 1), 1000), out);
  }
  return out;
}
