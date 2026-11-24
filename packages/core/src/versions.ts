// Versions (GLOSSARY: Version): what people build keeps its history, git-like but inside Ziffr. Callers check who
// acts before recording; these only read and write the history.
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { mapVersionWords, opening, openObject, sealing, sealObject } from "./sealed-words";
import { workspaceCipher } from "./workspace-keys";
import { openWorkflowRow } from "./workflow-rows";
import { tagNamesOfMetric } from "./tag-rows";
import { madeBySeed } from "./demo-seeded-rows";
import { DemoLimit } from "./demo";
import { DemoSizeRefused } from "./demo-visitor-limits";
import { DEMO_STORE_MAX } from "./demo-limits";
import { visitHeaders } from "./demo-visit-scope";
import { mayRecordAutoVersion } from "./demo-creation";

// Changes a program makes through an Access Key go through the same core functions as people's (spec 0014), and those
// record Versions deep inside. Rather than thread a note through every signature, the key's call runs inside
// withVersionNote, and every Version recorded during it names the key. Changes with one note within ten minutes
// still merge into one Version, so an assistant's twenty small changes are one thing to restore.
const note = new AsyncLocalStorage<string>();

/** Runs fn so that every Version it records carries this note, such as "Changed through the API (key «x»)". */
export function withVersionNote<T>(text: string, fn: () => Promise<T>): Promise<T> {
  return note.run(text.slice(0, 200), fn);
}

/** The kinds of objects that keep versions. */
export type VersionType = "widget" | "dashboard" | "deck" | "metric" | "template" | "theme" | "workflow" | "snapshot";

/** Every kind of object that keeps versions; a type sent by a browser must be one of these. */
export const VERSION_TYPES: VersionType[] = ["widget", "dashboard", "deck", "metric", "template", "theme", "workflow", "snapshot"];
const COALESCE_MS = 10 * 60 * 1000;

/** What a version stores for each kind of object: everything needed to restore it, nothing it does not own, with its
 * words as plain text (they are sealed in the object, and sealed again for the Version when it is stored), and the
 * Workspace it belongs to. */
async function loadSnapshot(type: VersionType, id: number): Promise<{ snapshot: Record<string, unknown>; ws: string } | null> {
  const loaded = async (data: Record<string, unknown> | null, drop: string[] = []) => {
    if (!data) return null;
    const ws = String(data.workspace_id);
    const keep = Object.fromEntries(Object.entries(data).filter(([k]) => k !== "workspace_id" && !drop.includes(k)));
    return { snapshot: keep, ws };
  };
  if (type === "widget") {
    const { data } = await db().from("widgets").select("id, workspace_id, template, metric_ids, settings, title").eq("id", id).single();
    const ws = data ? String(data.workspace_id) : "";
    return loaded(data ? (await openRows("widgets", ws, [data]))[0] : null, ["id"]);
  }
  if (type === "dashboard") {
    const [{ data: d }, { data: rows }] = await Promise.all([
      db().from("dashboards").select("id, workspace_id, name, theme_id, intro").eq("id", id).single(),
      db().from("widgets").select("id, workspace_id, template, metric_ids, settings, title, x, y, w, h").eq("dashboard_id", id).order("y").order("x"),
    ]);
    if (!d) return null;
    const ws = String(d.workspace_id);
    const [dash] = await openRows("dashboards", ws, [d]);
    // Their ids and Workspace are not part of what a Version keeps (the words are sealed for the Version, not the row).
    const widgets = (await openRows("widgets", ws, rows)).map((w) => { const kept: Record<string, unknown> = { ...w }; delete kept.id; delete kept.workspace_id; return kept; });
    return { snapshot: { name: dash.name, theme_id: dash.theme_id, intro: dash.intro ?? "", widgets }, ws };
  }
  if (type === "deck") return loaded((await db().from("decks").select("workspace_id, name, theme_id, footer, document").eq("id", id).single()).data);
  if (type === "workflow") {
    // The config is opened here (its numbers are sealed in the row) and sealed again for the Version when stored.
    const { data } = await db().from("workflows").select("id, workspace_id, name, config").eq("id", id).single();
    return loaded(await openWorkflowRow(String(data?.workspace_id), data), ["id"]);
  }
  if (type === "snapshot") {
    // Only a Snapshot's words keep Versions: its numbers never change (spec 0013).
    const { data } = await db().from("dashboard_snapshots").select("workspace_id, words").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!data) return null;
    const ws = String(data.workspace_id);
    return { snapshot: { words: openObject(await workspaceCipher(ws), { table: "dashboard_snapshots", column: "words", row: id }, data.words) }, ws };
  }
  if (type === "theme") return loaded((await db().from("themes").select("workspace_id, name, tokens, slides").eq("id", id).single()).data);
  if (type === "template") return loaded((await db().from("team_templates").select("workspace_id, kind, name, description, view, slots, body, w, h").eq("id", id).single()).data);
  if (type !== "metric") throw new Error(`Unknown version type: ${String(type)}`);
  const { data } = await db().from("metrics").select("id, workspace_id, name, description, unit, unit_position, format, decimals, period, submission_rule, polarity, target_min, target_max, target_min_sealed, target_max_sealed, attainment_method, sources, aggregation, formula").eq("id", id).single();
  const metric = await loaded(data ? (await openRows("metrics", String(data.workspace_id), [data]))[0] : null, ["id"]);
  // A Metric's Tags are part of its description (spec 0038): a Version keeps their names as they were then.
  return metric && { ...metric, snapshot: { ...metric.snapshot, tags: await tagNamesOfMetric(metric.ws, id) } };
}

/** What a version stores for each kind of object: everything needed to restore it, nothing it does not own, words as
 * plain text. */
export async function snapshotOf(type: VersionType, id: number): Promise<Record<string, unknown> | null> {
  return (await loadSnapshot(type, id))?.snapshot ?? null;
}

/** A Version's snapshot with its words sealed for it: bound to the Workspace, the object and the version number, so a
 * copy in another Version, object or Workspace does not open (spec 0028). As it is where nothing is sealed. */
async function sealedSnapshot(ws: string, type: VersionType, id: number, version: number, snapshot: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cipher = await workspaceCipher(ws);
  const row = `${type}-${id}-${version}`;
  if (type === "snapshot") return { ...snapshot, words: sealObject(cipher, { table: "versions", column: "snapshot.words", row }, snapshot.words) };
  return mapVersionWords(type, snapshot, sealing(cipher, "versions", row));
}

/** A stored Version's snapshot opened for reading: plain words as they are, sealed ones opened (left out when they do
 * not open). */
export async function openVersionSnapshot(ws: string, type: VersionType, id: number, version: number, stored: unknown): Promise<Record<string, unknown>> {
  const snapshot = (stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}) as Record<string, unknown>;
  const cipher = await workspaceCipher(ws);
  const row = `${type}-${id}-${version}`;
  if (type === "snapshot") return { ...snapshot, words: openObject(cipher, { table: "versions", column: "snapshot.words", row }, snapshot.words) };
  return mapVersionWords(type, snapshot, opening(cipher, "versions", row));
}

/** Records the object's current state. Edits by the same person within ten minutes merge into one version. */
export async function recordVersion(type: VersionType, id: number, author: string, given: { message?: string; name?: string; always?: boolean } = {}) {
  const noted = note.getStore();
  const opts = noted ? { ...given, message: given.message ? `${given.message}; ${noted.charAt(0).toLowerCase()}${noted.slice(1)}` : noted } : given;
  const loaded = await loadSnapshot(type, id);
  if (!loaded) return;
  const { snapshot, ws } = loaded;
  const { data: latest } = await db().from("versions").select("*").eq("object_type", type).eq("object_id", id).order("version", { ascending: false }).limit(1);
  const last = latest?.[0];
  // Nothing changed: no new version, unless it records an event of its own (a name, or a handover with `always`). Compared
  // as plain words: a sealed word differs each time it is written, whether or not it changed.
  if (last && JSON.stringify(await openVersionSnapshot(ws, type, id, last.version, last.snapshot)) === JSON.stringify(snapshot) && !opts.name && !opts.always) return;
  // Merge only into a plain edit: never into a named version, the baseline or a restore.
  // A key's note merges into a version with the same note, so a program's burst of changes is one version too.
  // In a demo visit an automatic Version is a courtesy: one too large, or one the demo has no room for, is not recorded, and
  // never fails the edit it follows. A named one is the visitor's own request, asked for (and counted) before this is called.
  const inVisit = visitHeaders() !== null;
  if (inVisit && new TextEncoder().encode(JSON.stringify(snapshot)).length > DEMO_STORE_MAX.versionSnapshotBytes) {
    // A named one is asked for: it is refused in words, before it is written, not left out.
    if (opts.name) throw new DemoSizeRefused("This is too large to name as a version in the demo.");
    return;
  }
  const sameNote = Boolean(noted && !given.message && last?.message === noted);
  let fresh = last && last.author_id === author && !last.name && !opts.name && (sameNote || (!last.message && !opts.message)) && Date.now() - new Date(last.updated_at).getTime() < COALESCE_MS;
  // A visitor's edit never merges into a Version the seed made: its words are the seed's (spec 0051), so it gets a Version of its own.
  if (fresh && visitHeaders() !== null && await madeBySeed("versions", last?.id ?? 0).catch(() => true)) fresh = false;
  if (fresh) {
    await db().from("versions").update({ snapshot: await sealedSnapshot(ws, type, id, last.version, snapshot), updated_at: new Date().toISOString(), message: opts.message ?? last.message }).eq("id", last.id);
    return;
  }
  // An address's share of the demo's Versions is counted before an automatic one is written (final review D2): past it the Version is left out.
  if (inVisit && !opts.name && !(await mayRecordAutoVersion({ workspaceId: ws }))) return;
  const version = (last?.version ?? 0) + 1;
  try {
    await db().from("versions").insert({
      object_type: type, object_id: id, version, snapshot: await sealedSnapshot(ws, type, id, version, snapshot), author_id: author,
      message: opts.message ?? null, name: opts.name ?? null,
    });
  } catch (e) {
    if (inVisit && !opts.name && e instanceof DemoLimit) return;
    throw e;
  }
}

/** Before the first tracked change, keep the state as it was, so there is always something to go back to. */
export async function ensureBaseline(type: VersionType, id: number, author: string) {
  const { count } = await db().from("versions").select("*", { count: "exact", head: true }).eq("object_type", type).eq("object_id", id);
  if (count) return;
  const loaded = await loadSnapshot(type, id);
  if (!loaded) return;
  if (visitHeaders() !== null && !(await mayRecordAutoVersion({ workspaceId: loaded.ws }))) return;
  try {
    await db().from("versions").insert({ object_type: type, object_id: id, version: 1, snapshot: await sealedSnapshot(loaded.ws, type, id, 1, loaded.snapshot), author_id: author, message: "Before version history" });
  } catch (e) {
    // The demo has no room for more Versions: the edit goes on without a baseline, it is never refused for one.
    if (visitHeaders() !== null && e instanceof DemoLimit) return;
    throw e;
  }
}

/** Top-level fields that differ between two snapshots, in words a person can scan. */
export function diffSummary(type: VersionType, a: Record<string, unknown> | null, b: Record<string, unknown>): string[] {
  if (!a) return ["Created"];
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    if (type === "dashboard" && k === "widgets") {
      const wa = (a.widgets as unknown[]) ?? [], wb = (b.widgets as unknown[]) ?? [];
      out.push(wa.length !== wb.length ? `${wb.length - wa.length > 0 ? "added" : "removed"} ${Math.abs(wb.length - wa.length)} widget(s)` : "widgets rearranged or restyled");
    } else if (k === "settings") {
      const sa = (a.settings ?? {}) as Record<string, unknown>, sb = (b.settings ?? {}) as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].filter((x) => JSON.stringify(sa[x]) !== JSON.stringify(sb[x]));
      out.push(`settings: ${keys.join(", ") || "changed"}`);
    } else if (k === "tokens") {
      const ta = (a.tokens ?? {}) as Record<string, unknown>, tb = (b.tokens ?? {}) as Record<string, unknown>;
      out.push(`changed ${[...new Set([...Object.keys(ta), ...Object.keys(tb)])].filter((x) => JSON.stringify(ta[x]) !== JSON.stringify(tb[x])).join(", ") || "look"}`);
    } else if (type === "metric" && k === "tags") {
      const had = new Set(((a.tags as string[] | undefined) ?? []).map(String)), has = new Set(((b.tags as string[] | undefined) ?? []).map(String));
      const added = [...has].filter((t) => !had.has(t)), removed = [...had].filter((t) => !has.has(t));
      out.push(`tags: ${[...added.map((t) => `+${t}`), ...removed.map((t) => `-${t}`)].join(", ") || "changed"}`);
    } else if (k === "theme_id") out.push("theme");
    else if (k === "body") out.push("content replaced");
    else if (k === "document") out.push("slides edited");
    else if (k === "logo" || k === "background_image") out.push(`${k.replace("_", " ")} ${b[k] ? "changed" : "removed"}`);
    else out.push(k.replace(/_/g, " "));
  }
  return out;
}
