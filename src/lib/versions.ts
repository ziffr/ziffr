import "server-only";
// Versions (GLOSSARY: Version): what people build keeps its history, git-like but inside Ziffr.
import { db } from "./db";

export type VersionType = "widget" | "dashboard" | "deck" | "master" | "metric";
const COALESCE_MS = 10 * 60 * 1000;

/** What a version stores for each kind of object: everything needed to restore it, nothing it does not own. */
export async function snapshotOf(type: VersionType, id: number): Promise<Record<string, unknown> | null> {
  if (type === "widget") {
    const { data } = await db.from("widgets").select("template, metric_ids, settings, title").eq("id", id).single();
    return data;
  }
  if (type === "dashboard") {
    const [{ data: d }, { data: ws }] = await Promise.all([
      db.from("dashboards").select("name").eq("id", id).single(),
      db.from("widgets").select("template, metric_ids, settings, title, x, y, w, h").eq("dashboard_id", id).order("y").order("x"),
    ]);
    return d ? { name: d.name, widgets: ws ?? [] } : null;
  }
  if (type === "deck") {
    const { data } = await db.from("decks").select("name, master_id, document").eq("id", id).single();
    return data;
  }
  if (type === "master") {
    const { data } = await db.from("masters").select("name, background_color, background_image, logo, logo_ratio, logo_position, logo_width, footer, show_slide_number, text_color, title_size, body_size").eq("id", id).single();
    return data;
  }
  const { data } = await db.from("metrics").select("name, description, unit, format, decimals, period, submission_rule, polarity, target_min, target_max, sources, aggregation, formula").eq("id", id).single();
  return data;
}

/** Records the object's current state. Edits by the same person within ten minutes merge into one version. */
export async function recordVersion(type: VersionType, id: number, author: string, opts: { message?: string; name?: string } = {}) {
  const snapshot = await snapshotOf(type, id);
  if (!snapshot) return;
  const { data: latest } = await db.from("versions").select("*").eq("object_type", type).eq("object_id", id).order("version", { ascending: false }).limit(1);
  const last = latest?.[0];
  if (last && JSON.stringify(last.snapshot) === JSON.stringify(snapshot) && !opts.name) return; // nothing changed
  // Merge only into a plain edit: never into a named version, the baseline or a restore.
  const fresh = last && last.author_id === author && !last.name && !last.message && !opts.name && !opts.message && Date.now() - new Date(last.updated_at).getTime() < COALESCE_MS;
  if (fresh) {
    await db.from("versions").update({ snapshot, updated_at: new Date().toISOString(), message: opts.message ?? last.message }).eq("id", last.id);
    return;
  }
  await db.from("versions").insert({
    object_type: type, object_id: id, version: (last?.version ?? 0) + 1, snapshot, author_id: author,
    message: opts.message ?? null, name: opts.name ?? null,
  });
}

/** Before the first tracked change, keep the state as it was, so there is always something to go back to. */
export async function ensureBaseline(type: VersionType, id: number, author: string) {
  const { count } = await db.from("versions").select("*", { count: "exact", head: true }).eq("object_type", type).eq("object_id", id);
  if (count) return;
  const snapshot = await snapshotOf(type, id);
  if (snapshot) await db.from("versions").insert({ object_type: type, object_id: id, version: 1, snapshot, author_id: author, message: "Before version history" });
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
    } else if (k === "document") out.push("slides edited");
    else if (k === "logo" || k === "background_image") out.push(`${k.replace("_", " ")} ${b[k] ? "changed" : "removed"}`);
    else out.push(k.replace(/_/g, " "));
  }
  return out;
}
