"use server";
// Team Widget Templates (GLOSSARY: Widget Template): everyone uses them, only the creator changes them.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getMetrics } from "@/lib/data";
import { dashboardRole, forbidden } from "@/lib/guards";
import { toTemplate, type Choices } from "@/lib/team-templates";
import { ensureBaseline, recordVersion } from "@/lib/versions";
import { TEMPLATES } from "@/views/templates";
import type { AnchorRule, Widget } from "@/lib/types";

const RULES: AnchorRule[] = ["max", "min", "last", "first", "largest-step"];

async function assertOwnsTemplate(id: number, viewer: string) {
  const { data } = await db.from("team_templates").select("owner_id").eq("id", id).single();
  if (!data || data.owner_id !== viewer) forbidden();
}

/** Saves a widget as a team template, new or replacing one of the viewer's own. Built from the stored widget, not from the browser. */
export async function saveTemplate(input: { widgetId: number; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }) {
  const viewer = await viewerId();
  const { data } = await db.from("widgets").select("*").eq("id", input.widgetId).single();
  const w = data as Widget | null;
  if (!w) forbidden();
  const canSee = w!.dashboard_id === null ? w!.owner_id === viewer : Boolean(await dashboardRole(w!.dashboard_id, viewer));
  if (!canSee) forbidden();
  if (TEMPLATES[w!.template].kind === "layout") throw new Error("Free layouts cannot be saved as templates yet.");
  const choices: Choices = Object.fromEntries(Object.entries(input.choices ?? {}).filter(([, v]) => v === "drop" || RULES.includes(v as AnchorRule)));
  const t = toTemplate(w!, await getMetrics(), choices, (input.labels ?? []).map((l) => String(l).slice(0, 40)));
  const row = {
    name: input.name.trim().slice(0, 80) || "Untitled template",
    description: input.description.trim().slice(0, 300),
    view: w!.template, slots: t.slots, body: t.body, w: w!.w, h: w!.h, updated_at: new Date().toISOString(),
  };
  let id = input.replaceId ?? null;
  if (id) {
    await assertOwnsTemplate(id, viewer);
    await ensureBaseline("template", id, viewer);
    await db.from("team_templates").update(row).eq("id", id);
    await recordVersion("template", id, viewer, { message: "Replaced from a widget" });
  } else {
    const { data: created, error } = await db.from("team_templates").insert({ ...row, owner_id: viewer }).select("id").single();
    if (error) throw new Error(`Template not saved: ${error.message}`);
    id = created!.id as number;
    await recordVersion("template", id, viewer, { message: "Created" });
  }
  revalidatePath("/", "layout");
  return id;
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
