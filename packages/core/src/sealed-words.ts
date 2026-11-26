// Sealed words (spec 0028, ticket #334; GLOSSARY: Workspace Key, Finding, Snapshot, Version, View Link): the words people
// write on dashboards, in Findings and in Snapshots, and Metric descriptions, sealed with the Workspace Key and bound to
// the row and place they live in. Pure: it takes a cipher and rows and returns copies; reading and writing the
// database stays in the functions that own each table. A plain word written before passes through as it is until the
// re-encryption job (#247) seals it; a sealed one that does not open (another place, changed, key destroyed) reads as
// missing, never as its ciphertext. Security: the words of one place never open in another, so a copy of a sealed
// column in another row, Workspace or copy of a Version stays unreadable.
import { isSealed, type SealedAt, type WorkspaceCipher } from "./workspace-keys";
import { mapConfigNumbers } from "./sealed-workflow";

/** The words a widget keeps in its settings: a Finding's kicker, headline, subline, footnote and source. A widget's
 * title is a column of its own (`widgets.title`). Callouts and annotations are not in this list yet. */
export const SETTING_WORDS = ["kicker", "headline", "subline", "footnote", "source"] as const;

/** The words a Snapshot keeps editable: a widget's title and a Finding's words. */
export const WORD_KEYS = ["title", ...SETTING_WORDS] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** What a word becomes: the text for a place, or undefined to leave it out. */
type Change = (column: string, text: string) => string | undefined;

/** A copy of a widget's settings with each word passed through `change`, by the path it sits at below `base`. Words
 * live at the top and in the widget a free layout started from (`canvasSeed`); nothing else is touched. */
export function mapSettingsWords(settings: unknown, change: Change, base = "settings."): unknown {
  if (!isObj(settings)) return settings;
  const out: Obj = { ...settings };
  for (const key of SETTING_WORDS) {
    if (typeof out[key] !== "string") continue;
    const next = change(`${base}${key}`, out[key] as string);
    if (next === undefined) delete out[key];
    else out[key] = next;
  }
  const seed = out.canvasSeed;
  if (isObj(seed) && isObj(seed.settings)) out.canvasSeed = { ...seed, settings: mapSettingsWords(seed.settings, change, `${base}canvas_seed.settings.`) };
  return out;
}

/** The change that seals a word for a place; an empty word holds nothing and stays as it is. */
export function sealing(cipher: WorkspaceCipher, table: string, row: string | number): Change {
  return (column, text) => (text === "" ? text : cipher.seal({ table, column, row }, text));
}

/** The change that opens a word of a place: a plain one as it is, a sealed one that does not open left out. */
export function opening(cipher: WorkspaceCipher, table: string, row: string | number): Change {
  return (column, text) => (isSealed(text) ? cipher.open({ table, column, row }, text) ?? undefined : text);
}

/** A word that may be sealed, opened for its place: null when it does not open. */
export function openText(cipher: WorkspaceCipher, at: SealedAt, stored: unknown): string | null {
  if (typeof stored !== "string") return null;
  return isSealed(stored) ? cipher.open(at, stored) : stored;
}

/** Breakdown rows with each label passed through a change, at `<place>.<row>.label`; the parts of a row (spec 0041, ticket 12) are rows of its own, at `<place>.<row>.parts.<part>.label`. */
function mapRows(rows: unknown[], change: Change, place: string): unknown[] {
  return rows.map((r, i) => {
    if (!isObj(r) || typeof r.label !== "string") return r;
    const mapped = { ...r, label: change(`${place}.${i}.label`, r.label) ?? "" };
    return Array.isArray(r.parts) ? { ...mapped, parts: mapRows(r.parts, change, `${place}.${i}.parts`) } : mapped;
  });
}

/** A copy of kept data (a Snapshot's, a frozen View Link's) with each Breakdown row's label passed through a change, at
 * `<base>breakdowns.<metric>.<period>.<row>.label` (a period's dashes become underscores: a place has none). */
export function mapBreakdownLabels<T extends { breakdowns?: unknown }>(data: T, change: Change, base: string): T {
  if (!isObj(data.breakdowns)) return data;
  const breakdowns: Obj = {};
  for (const [metric, byPeriod] of Object.entries(data.breakdowns)) {
    if (!isObj(byPeriod)) { breakdowns[metric] = byPeriod; continue; }
    const periods: Obj = {};
    for (const [period, rows] of Object.entries(byPeriod)) {
      periods[period] = Array.isArray(rows) ? mapRows(rows, change, `${base}breakdowns.${metric.replace(/\W/g, "_")}.${period.replace(/\W/g, "_")}`) : rows;
    }
    breakdowns[metric] = periods;
  }
  return { ...data, breakdowns };
}

/** A widget-like thing (a row, a kept copy) with its title and settings words passed through a change. The title is
 * at `<base>title`, the settings words below `<base>settings.`. */
export function mapWidgetWords<T extends { title?: unknown; settings?: unknown }>(w: T, change: Change, base = ""): T {
  const out: Obj = { ...w };
  if (typeof out.title === "string") out.title = change(`${base}title`, out.title) ?? null;
  if ("settings" in out) out.settings = mapSettingsWords(out.settings, change, `${base}settings.`);
  return out as T;
}

/** A whole object of words sealed as one text, kept as an object ({"sealed": "w1..."}) so the checks on its column hold;
 * as it is where nothing is sealed. */
export function sealObject(cipher: WorkspaceCipher, at: SealedAt, words: unknown): Obj {
  const plain = isObj(words) ? words : {};
  return cipher.sealing ? { sealed: cipher.seal(at, JSON.stringify(plain)) } : plain;
}

/** An object of words opened: a sealed one is read back, a plain one passes as it is, one that does not open reads as
 * empty. Only the wrapper itself counts: plain words that happen to hold a "sealed" key stay as they are. */
export function openObject(cipher: WorkspaceCipher, at: SealedAt, stored: unknown): Obj {
  if (!isObj(stored)) return {};
  const keys = Object.keys(stored);
  if (keys.length !== 1 || keys[0] !== "sealed" || !isSealed(stored.sealed as string)) return stored;
  const text = cipher.open(at, stored.sealed as string);
  if (text === null) return {};
  try {
    const parsed = JSON.parse(text);
    return isObj(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** A kept copy (a Snapshot's frozen part, a frozen View Link) with its `data` sealed as one text, bound to the row and
 * the column `frozen.data`: the values, names, Targets and Breakdowns it froze are not readable beside the row. Plain where
 * nothing is sealed. Apply after the Breakdown labels are sealed (they stay inside, opened with the rest). */
export function sealFrozenData<T extends { data?: unknown }>(cipher: WorkspaceCipher, table: string, row: string | number, kept: T): T {
  return { ...kept, data: sealObject(cipher, { table, column: "frozen.data", row }, kept.data) };
}

/** A kept copy with its `data` opened; one frozen before sealing passes as it is. Null when the data does not open
 * (another row, changed, key destroyed): it reads as missing, never as its ciphertext. */
export function openFrozenData<T extends { data?: unknown }>(cipher: WorkspaceCipher, table: string, row: string | number, kept: T): T | null {
  const data = openObject(cipher, { table, column: "frozen.data", row }, kept.data);
  return Array.isArray(data.metrics) ? { ...kept, data } : null;
}

/** A View Link's frozen dashboard (or a Snapshot-free copy of one) with its words passed through a change: the
 * introduction and each widget's title and settings words, bound to the link and, for a widget, its id. */
export function mapViewWords<T extends { intro?: unknown; widgets?: unknown }>(view: T, change: Change): T {
  const out: Obj = { ...view };
  if (typeof out.intro === "string") out.intro = change("frozen.intro", out.intro) ?? "";
  if (Array.isArray(out.widgets)) out.widgets = out.widgets.map((w) => (isObj(w) ? mapWidgetWords(w, change, `frozen.widgets.${String(w.id)}.`) : w));
  if (isObj(out.data)) out.data = mapBreakdownLabels(out.data, change, "frozen.data.");
  return out as T;
}

/** A Metric Version's name, description, Calculation Note and Targets passed through a change, by their place in the Version. A Target is a
 * number: it goes through as text and comes back a number, or stays a number where the change leaves it plain; one that
 * does not open is left out, and so is a name that does not open, so a restore never writes a placeholder back. */
function mapMetricVersion(snapshot: Obj, change: Change): Obj {
  const out: Obj = { ...snapshot };
  if (typeof out.name === "string") {
    const name = change("snapshot.name", out.name);
    if (name === undefined) delete out.name; else out.name = name;
  }
  for (const column of ["description", "calculation_note"]) {
    const text = out[column];
    if (typeof text === "string") out[column] = change(`snapshot.${column}`, text) ?? "";
  }
  for (const column of ["target_min", "target_max"]) {
    const v = out[column];
    if (typeof v !== "number" && typeof v !== "string") continue;
    const text = String(v);
    const next = change(`snapshot.${column}`, text);
    const n = next === undefined || next.trim() === "" ? NaN : Number(next);
    const value = next === undefined ? undefined : next === text && typeof v === "number" ? v : isSealed(next) ? next : Number.isFinite(n) ? n : undefined;
    if (value === undefined) delete out[column]; else out[column] = value;
  }
  // A Metric's Tags (spec 0038) are Workspace words: each name sealed for its place in the Version; one that does not open is left out.
  if (Array.isArray(out.tags)) out.tags = out.tags.flatMap((t, i) => (typeof t === "string" ? [change(`snapshot.tags.${i}`, t)] : [])).filter((t): t is string => t !== undefined);
  return out;
}

/** What a Version keeps of an object, with its words passed through a change: a widget's, a dashboard's and its
 * widgets', a Snapshot's (whole), a Metric's name, description and Targets and a Workflow's numbers. Other kinds hold no words of this ticket. The places are
 * the Version's own (`snapshot.<path>`), so a copy of a sealed Version elsewhere does not open. */
export function mapVersionWords(type: string, snapshot: Obj, change: Change): Obj {
  if (type === "widget") return mapWidgetWords(snapshot, change, "snapshot.");
  if (type === "dashboard") {
    const out: Obj = { ...snapshot };
    if (typeof out.intro === "string") out.intro = change("snapshot.intro", out.intro) ?? "";
    if (Array.isArray(out.widgets)) out.widgets = out.widgets.map((w, i) => (isObj(w) ? mapWidgetWords(w, change, `snapshot.widgets.${i}.`) : w));
    return out;
  }
  if (type === "metric") return mapMetricVersion(snapshot, change);
  if (type === "workflow") return { ...snapshot, config: mapConfigNumbers(snapshot.config, change, "snapshot.config.") };
  return snapshot;
}
