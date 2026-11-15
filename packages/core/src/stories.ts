// Stories (spec 0010, ticket #148; GLOSSARY: Story, Finding): a title, an introduction and Findings read top to bottom.
// A story is kept as a dashboard of kind "story", so who may see, share, version, link and change it follows the
// dashboard rules exactly (access.ts, sharing.ts, versions.ts, view-links.ts); its widgets are its Findings, one per
// row, in the order of their place. Only what is particular to stories is here.
import { Forbidden, assertCan, type Actor } from "./actor";
import { visibleDashboards, type DashboardAccess } from "./access";
import { assertCanEditDashboard, placeWidget } from "./dashboards";
import { db } from "./db";
import { ensureBaseline, recordVersion } from "./versions";
import type { Widget } from "./types";

/** The longest introduction a story keeps. */
export const MAX_INTRO = 4000;

/** The stories the person may open, theirs first (by name), then those shared with them (by name). */
export async function visibleStories(actor: Actor): Promise<DashboardAccess[]> {
  const all = (await visibleDashboards(actor.workspaceId, actor.personId)).filter((d) => d.kind === "story");
  const byName = (a: DashboardAccess, b: DashboardAccess) => a.name.localeCompare(b.name);
  return [...all.filter((d) => d.role === "owner").sort(byName), ...all.filter((d) => d.role !== "owner").sort(byName)];
}

/** Starts an empty story owned by the actor; Guests start nothing. */
export async function createStory(actor: Actor, name: string): Promise<number> {
  assertCan(actor, "create");
  const { data, error } = await db().from("dashboards").insert({ name: String(name ?? "").trim().slice(0, 120) || "Untitled story", owner_id: actor.personId, workspace_id: actor.workspaceId, kind: "story" }).select("id").single();
  if (error || !data) throw new Error("The story could not be created.");
  return data.id;
}

/** The story when the actor may change it (its owner or an Editor); Forbidden for anything else, a dashboard too. */
async function editableStory(actor: Actor, storyId: number) {
  if (!Number.isInteger(storyId)) throw new Forbidden();
  await assertCanEditDashboard(actor, storyId);
  const { data } = await db().from("dashboards").select("id, kind").eq("id", storyId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.kind !== "story") throw new Forbidden();
}

/** Changes a story's title and introduction. */
export async function saveStoryText(actor: Actor, storyId: number, text: { name?: unknown; intro?: unknown }) {
  await editableStory(actor, storyId);
  const update: Record<string, string> = {};
  if (text.name !== undefined) {
    const name = String(text.name ?? "").trim().slice(0, 120);
    if (!name) throw new Error("Give the story a title.");
    update.name = name;
  }
  if (text.intro !== undefined) update.intro = String(text.intro ?? "").slice(0, MAX_INTRO);
  if (!Object.keys(update).length) return;
  await ensureBaseline("dashboard", storyId, actor.personId);
  const { error } = await db().from("dashboards").update(update).eq("id", storyId).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The story could not be saved.");
  await recordVersion("dashboard", storyId, actor.personId);
}

/** A story's Findings in reading order. */
async function findings(ws: string, storyId: number): Promise<Widget[]> {
  const { data } = await db().from("widgets").select("*").eq("workspace_id", ws).eq("dashboard_id", storyId).order("y").order("x").order("id");
  return (data ?? []) as Widget[];
}

/** Lays a story's Findings out one per row, full width, in the given order. */
async function layOut(ws: string, ordered: Widget[]) {
  let y = 0;
  for (const w of ordered) {
    await db().from("widgets").update({ x: 0, y, w: 12 }).eq("id", w.id).eq("workspace_id", ws);
    y += Math.max(1, w.h);
  }
}

/** Adds a Finding about a Metric the actor sees at the end of the story, as an editorial widget to fill in. */
export async function addFinding(actor: Actor, storyId: number, metricId: number): Promise<number> {
  await editableStory(actor, storyId);
  if (!Number.isInteger(metricId)) throw new Forbidden();
  // placeWidget checks the actor sees the Metric and keeps a Version; the story then puts it last, one per row.
  const id = await placeWidget(actor, storyId, { type: "spec", template: "story", metricIds: [metricId] });
  // The free place may be beside a narrow Finding; the new one still goes last.
  const all = await findings(actor.workspaceId, storyId);
  await layOut(actor.workspaceId, [...all.filter((w) => w.id !== id), ...all.filter((w) => w.id === id)]);
  return id;
}

/** Moves a Finding one place up (-1) or down (1). */
export async function moveFinding(actor: Actor, storyId: number, widgetId: number, by: -1 | 1) {
  await editableStory(actor, storyId);
  const list = await findings(actor.workspaceId, storyId);
  const i = list.findIndex((w) => w.id === widgetId);
  if (i < 0) throw new Forbidden();
  const j = i + (by < 0 ? -1 : 1);
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await ensureBaseline("dashboard", storyId, actor.personId);
  await layOut(actor.workspaceId, list);
  await recordVersion("dashboard", storyId, actor.personId);
}
