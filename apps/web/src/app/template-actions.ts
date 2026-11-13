"use server";
// Team Widget Templates (GLOSSARY: Widget Template): everyone uses them, only the creator changes them.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getMetrics } from "@/lib/data";
import { assertCanEditWidget, assertCanSeeMetrics, forbidden, widgetMetricIds } from "@/lib/guards";
import { SLIDE_SHAPES, toSlideLayout, toTemplate, type Choices } from "@ziffr/core/team-templates";
import { ensureBaseline, recordVersion } from "@/lib/versions";
import { TEMPLATES } from "@/views/templates";
import type { AnchorRule, SlideShape, Widget, WidgetSettings } from "@ziffr/core/types";

const RULES: AnchorRule[] = ["max", "min", "last", "first", "largest-step"];

async function assertOwnsTemplate(id: number, viewer: string) {
  const { data } = await db.from("team_templates").select("owner_id").eq("id", id).single();
  if (!data || data.owner_id !== viewer) forbidden();
}

const cleanChoices = (c: Choices): Choices => Object.fromEntries(Object.entries(c ?? {}).filter(([, v]) => v === "drop" || RULES.includes(v as AnchorRule)));

/** Writes a template row, new or replacing one of the viewer's own of the same kind, and records the version. */
async function store(viewer: string, kind: "widget" | "slide", replaceId: number | null | undefined, row: Record<string, unknown>) {
  if (replaceId) {
    const { data } = await db.from("team_templates").select("owner_id, kind").eq("id", replaceId).single();
    if (!data || data.owner_id !== viewer || data.kind !== kind) forbidden();
    await ensureBaseline("template", replaceId, viewer);
    await db.from("team_templates").update(row).eq("id", replaceId);
    await recordVersion("template", replaceId, viewer, { message: "Replaced" });
    revalidatePath("/", "layout");
    return replaceId;
  }
  const { data: created, error } = await db.from("team_templates").insert({ ...row, kind, owner_id: viewer }).select("id").single();
  if (error) throw new Error(`Template not saved: ${error.message}`);
  await recordVersion("template", created!.id, viewer, { message: "Created" });
  revalidatePath("/", "layout");
  return created!.id as number;
}

const names = (name: string, description: string, fallback: string) => ({
  name: String(name ?? "").trim().slice(0, 80) || fallback,
  description: String(description ?? "").trim().slice(0, 300),
});

/** Saves a slide of the viewer's own deck as a team slide layout. The shapes come from the editor, so each is checked. */
export async function saveSlideLayout(input: { deckId: number; shapes: SlideShape[]; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }) {
  const viewer = await viewerId();
  const { data: deck } = await db.from("decks").select("owner_id").eq("id", input.deckId).single();
  if (!deck || deck.owner_id !== viewer) forbidden();
  const shapes = Array.isArray(input.shapes) ? input.shapes : [];
  if (shapes.length > 80 || JSON.stringify(shapes).length > 400_000) throw new Error("This slide is too large to save as a layout.");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const clean: SlideShape[] = shapes
    .filter((sh) => sh && SLIDE_SHAPES.includes(String(sh.type)) && sh.props && typeof sh.props === "object")
    .map((sh) => ({ type: String(sh.type), x: num(sh.x), y: num(sh.y), rotation: num(sh.rotation), opacity: Math.min(1, Math.max(0, num(sh.opacity) || 1)), props: sh.props }));
  const metricIds: number[] = [];
  for (const sh of clean.filter((x) => x.type === "ziffr-widget")) {
    const template = String(sh.props.template);
    if (!(template in TEMPLATES) || TEMPLATES[template as keyof typeof TEMPLATES].kind === "layout") forbidden();
    let settings: WidgetSettings = {};
    try { settings = JSON.parse(String(sh.props.settings ?? "{}")); } catch { forbidden(); }
    const ids = Array.isArray(sh.props.metricIds) ? (sh.props.metricIds as unknown[]).map(Number) : [];
    metricIds.push(...widgetMetricIds(ids, settings));
  }
  await assertCanSeeMetrics(metricIds, viewer);
  const t = toSlideLayout(clean, await getMetrics(), cleanChoices(input.choices), (input.labels ?? []).map((l) => String(l).slice(0, 40)));
  return store(viewer, "slide", input.replaceId, { ...names(input.name, input.description, "Untitled layout"), view: "slide", slots: t.slots, body: t.body, w: 0, h: 0, updated_at: new Date().toISOString() });
}

/** Saves a widget as a team template, new or replacing one of the viewer's own. Built from the stored widget, not from the browser. */
export async function saveTemplate(input: { widgetId: number; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }) {
  const viewer = await viewerId();
  const { data } = await db.from("widgets").select("*").eq("id", input.widgetId).single();
  const w = data as Widget | null;
  if (!w) forbidden();
  // A template is seen by the whole team, so only someone who may change the widget, and sees all it draws, publishes it.
  await assertCanEditWidget(w!.id, viewer);
  await assertCanSeeMetrics(widgetMetricIds(w!.metric_ids, w!.settings), viewer);
  if (TEMPLATES[w!.template].kind === "layout") throw new Error("Free layouts cannot be saved as templates yet.");
  const t = toTemplate(w!, await getMetrics(), cleanChoices(input.choices), (input.labels ?? []).map((l) => String(l).slice(0, 40)));
  return store(viewer, "widget", input.replaceId, { ...names(input.name, input.description, "Untitled template"), view: w!.template, slots: t.slots, body: t.body, w: w!.w, h: w!.h, updated_at: new Date().toISOString() });
}

export async function renameTemplate(id: number, name: string, description: string) {
  const viewer = await viewerId();
  await assertOwnsTemplate(id, viewer);
  await ensureBaseline("template", id, viewer);
  await db.from("team_templates").update({ name: name.trim().slice(0, 80) || "Untitled template", description: description.trim().slice(0, 300), updated_at: new Date().toISOString() }).eq("id", id);
  await recordVersion("template", id, viewer);
  revalidatePath("/", "layout");
}

export async function deleteTemplate(id: number) {
  const viewer = await viewerId();
  await assertOwnsTemplate(id, viewer);
  await db.from("team_templates").delete().eq("id", id);
  revalidatePath("/", "layout");
}
