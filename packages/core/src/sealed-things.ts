// Sealed words inside JSON columns (spec 0028, ticket #250; GLOSSARY: Workspace Key, Finding, Snapshot, Version, View
// Link): the places where the core seals single words or whole objects of words inside a jsonb column. The
// re-encryption job walks these rows and moves each to the current key version, or seals what was written in clear
// before. Pure: it takes a cipher and a row and answers the new value, never touching the database. Security: a word
// is bound to the place it lives in, so the job seals each one for the same place the core would; a row holding a
// sealed word that does not open is left alone entirely (counted by the job), never half rewritten.
import { mapBreakdownLabels, mapSettingsWords, mapVersionWords, mapViewWords } from "./sealed-words";
import { isSealed, sealedVersion, type WorkspaceCipher } from "./workspace-keys";

/** The JSON columns that hold sealed words, by table. The job, its progress and the drift test read this list, and
 * SEALED_LABELS says each one in words. */
export const SEALED_THINGS = [
  { table: "widgets", column: "settings" },
  { table: "dashboard_snapshots", column: "words" },
  { table: "dashboard_snapshots", column: "frozen" },
  { table: "versions", column: "snapshot" },
  { table: "view_links", column: "frozen" },
  { table: "view_links", column: "snapshot_words" },
] as const;

/** One of those columns. */
export type SealedThing = (typeof SEALED_THINGS)[number];

/** A row of one of those tables as the job reads it: its id, the column, and for a Version what names it. */
export type ThingRow = { id: number | string; value: unknown; object_type?: string; object_id?: number; version?: number };

/** What came of one row: the value to store, whether it differs from what was read, and whether a sealed word in it
 * did not open (then nothing is to be written). */
export type Resealed = { value: unknown; changed: boolean; unopenable: boolean };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** A word moved to the current key version for its place: sealed if it was plain, sealed again if its version is older,
 * as it is otherwise. An empty word holds nothing and stays. */
function mover(cipher: WorkspaceCipher, table: string, row: string | number, state: { changed: boolean; unopenable: boolean }) {
  const current = cipher.version as number;
  return (column: string, text: string): string => {
    if (text === "") return text;
    const at = { table, column, row };
    if (!isSealed(text)) { state.changed = true; return cipher.seal(at, text); }
    const plain = cipher.open(at, text);
    if (plain === null) { state.unopenable = true; return text; }
    if ((sealedVersion(text) ?? current) < current) { state.changed = true; return cipher.seal(at, plain); }
    return text;
  };
}

/** A whole object of words (kept as {"sealed": "w1..."}) moved to the current key version, or sealed if it is plain. */
function moveObject(cipher: WorkspaceCipher, table: string, column: string, row: string | number, stored: unknown, state: { changed: boolean; unopenable: boolean }): unknown {
  if (!isObj(stored)) return stored;
  const at = { table, column, row };
  const keys = Object.keys(stored);
  if (keys.length === 1 && keys[0] === "sealed" && typeof stored.sealed === "string" && isSealed(stored.sealed)) {
    const text = cipher.open(at, stored.sealed);
    if (text === null) { state.unopenable = true; return stored; }
    if ((sealedVersion(stored.sealed) ?? 0) < (cipher.version as number)) { state.changed = true; return { sealed: cipher.seal(at, text) }; }
    return stored;
  }
  state.changed = true;
  return { sealed: cipher.seal(at, JSON.stringify(stored)) };
}

/** The new value of one row of a sealed JSON column: every word sealed under the current key version, for the place
 * the core seals it for. Nothing changes where the Workspace does not seal. */
export function resealThing(cipher: WorkspaceCipher, thing: SealedThing, row: ThingRow): Resealed {
  const state = { changed: false, unopenable: false };
  if (!cipher.sealing || cipher.version === null) return { value: row.value, changed: false, unopenable: false };
  const id = row.id;
  let value: unknown = row.value;
  if (thing.table === "widgets") value = mapSettingsWords(row.value, mover(cipher, "widgets", id, state));
  else if (thing.table === "dashboard_snapshots" && thing.column === "words") value = moveObject(cipher, "dashboard_snapshots", "words", id, row.value, state);
  else if (thing.table === "dashboard_snapshots") {
    // Only the Breakdown labels it froze are words: the widgets' own words are kept apart.
    const frozen = row.value;
    if (isObj(frozen) && isObj(frozen.data)) value = { ...frozen, data: mapBreakdownLabels(frozen.data as { breakdowns?: unknown }, mover(cipher, "dashboard_snapshots", id, state), "frozen.data.") };
  } else if (thing.table === "view_links" && thing.column === "snapshot_words") value = moveObject(cipher, "view_links", "snapshot_words", id, row.value, state);
  else if (thing.table === "view_links") {
    if (isObj(row.value)) value = mapViewWords(row.value, mover(cipher, "view_links", id, state));
  } else if (isObj(row.value) && row.object_type !== undefined) {
    // A Version: its words are bound to `<type>-<object>-<version>`, the Version's own place.
    const place = `${row.object_type}-${row.object_id}-${row.version}`;
    if (row.object_type === "snapshot") {
      value = { ...row.value, words: moveObject(cipher, "versions", "snapshot.words", place, row.value.words, state) };
    } else value = mapVersionWords(row.object_type, row.value, mover(cipher, "versions", place, state));
  }
  return { value, changed: state.changed && !state.unopenable, unopenable: state.unopenable };
}
