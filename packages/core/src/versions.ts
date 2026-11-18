// Versions (GLOSSARY: Version): what people build keeps its history, git-like but inside Ziffr. Callers check who
// acts before recording; these only read and write the history.
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "./db";

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

/** What a version stores for each kind of object: everything needed to restore it, nothing it does not own. */
export async function snapshotOf(type: VersionType, id: number): Promise<Record<string, unknown> | null> {
  if (type === "widget") {
    const { data } = await db().from("widgets").select("template, metric_ids, settings, title").eq("id", id).single();
    return data;
  }
  if (type === "dashboard") {
    const [{ data: d }, { data: ws }] = await Promise.all([
      db().from("dashboards").select("name, theme_id, intro").eq("id", id).single(),
      db().from("widgets").select("template, metric_ids, settings, title, x, y, w, h").eq("dashboard_id", id).order("y").order("x"),
    ]);
    return d ? { name: d.name, theme_id: d.theme_id, intro: d.intro ?? "", widgets: ws ?? [] } : null;
  }
  if (type === "deck") {
    const { data } = await db().from("decks").select("name, theme_id, footer, document").eq("id", id).single();
    return data;
  }
  if (type === "workflow") {
    const { data } = await db().from("workflows").select("name, config").eq("id", id).single();
    return data;
  }
  if (type === "snapshot") {
    // Only a Snapshot's words keep Versions: its numbers never change (spec 0013).
    const { data } = await db().from("dashboard_snapshots").select("words").eq("id", id).is("deleted_at", null).maybeSingle();
    return data ? { words: data.words } : null;
  }
  if (type === "theme") {
    const { data } = await db().from("themes").select("name, tokens, slides").eq("id", id).single();
    return data;
  }
  if (type === "template") {
    const { data } = await db().from("team_templates").select("kind, name, description, view, slots, body, w, h").eq("id", id).single();
    return data;
  }
  if (type !== "metric") throw new Error(`Unknown version type: ${String(type)}`);
  const { data } = await db().from("metrics").select("name, description, unit, unit_position, format, decimals, period, submission_rule, polarity, target_min, target_max, attainment_method, sources, aggregation, formula").eq("id", id).single();
  return data;
}

/** Records the object's current state. Edits by the same person within ten minutes merge into one version. */
export async function recordVersion(type: VersionType, id: number, author: string, given: { message?: string; name?: string; always?: boolean } = {}) {
  const noted = note.getStore();
  const opts = noted ? { ...given, message: given.message ? `${given.message}; ${noted.charAt(0).toLowerCase()}${noted.slice(1)}` : noted } : given;
  const snapshot = await snapshotOf(type, id);
  if (!snapshot) return;
  const { data: latest } = await db().from("versions").select("*").eq("object_type", type).eq("object_id", id).order("version", { ascending: false }).limit(1);
  const last = latest?.[0];
  // Nothing changed: no new version, unless it records an event of its own (a name, or a handover with `always`).
  if (last && JSON.stringify(last.snapshot) === JSON.stringify(snapshot) && !opts.name && !opts.always) return;
  // Merge only into a plain edit: never into a named version, the baseline or a restore.
  // A key's note merges into a version with the same note, so a program's burst of changes is one version too.
  const sameNote = Boolean(noted && !given.message && last?.message === noted);
  const fresh = last && last.author_id === author && !last.name && !opts.name && (sameNote || (!last.message && !opts.message)) && Date.now() - new Date(last.updated_at).getTime() < COALESCE_MS;
  if (fresh) {
    await db().from("versions").update({ snapshot, updated_at: new Date().toISOString(), message: opts.message ?? last.message }).eq("id", last.id);
    return;
  }
  await db().from("versions").insert({
    object_type: type, object_id: id, version: (last?.version ?? 0) + 1, snapshot, author_id: author,
    message: opts.message ?? null, name: opts.name ?? null,
  });
}

/** Before the first tracked change, keep the state as it was, so there is always something to go back to. */
export async function ensureBaseline(type: VersionType, id: number, author: string) {
  const { count } = await db().from("versions").select("*", { count: "exact", head: true }).eq("object_type", type).eq("object_id", id);
  if (count) return;
  const snapshot = await snapshotOf(type, id);
  if (snapshot) await db().from("versions").insert({ object_type: type, object_id: id, version: 1, snapshot, author_id: author, message: "Before version history" });
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
    } else if (k === "theme_id") out.push("theme");
    else if (k === "body") out.push("content replaced");
    else if (k === "document") out.push("slides edited");
    else if (k === "logo" || k === "background_image") out.push(`${k.replace("_", " ")} ${b[k] ? "changed" : "removed"}`);
    else out.push(k.replace(/_/g, " "));
  }
  return out;
}
