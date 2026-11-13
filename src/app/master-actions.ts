"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import type { LogoPosition, Master } from "@/lib/types";
import { ensureBaseline, recordVersion } from "@/lib/versions";

// GLOSSARY: Master. Masters belong to the team: everyone can use them, only the creator edits.

const POSITIONS: LogoPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const HEX = /^#[0-9a-f]{6}$/i;
const DATA_IMAGE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i;
const MAX_IMAGE = 3_000_000; // characters of data URL

type MasterInput = Omit<Master, "id" | "owner_id" | "is_default">;

function clean(input: MasterInput) {
  const img = (v: string | null) => (v && DATA_IMAGE.test(v) && v.length <= MAX_IMAGE ? v : null);
  const int = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  return {
    name: String(input.name ?? "").trim().slice(0, 80) || "Untitled master",
    background_color: HEX.test(input.background_color) ? input.background_color : "#F7F4F0",
    background_image: img(input.background_image),
    logo: img(input.logo),
    logo_ratio: Number(input.logo_ratio) > 0 ? Number(input.logo_ratio) : 3,
    logo_position: POSITIONS.includes(input.logo_position) ? input.logo_position : "top-right",
    logo_width: int(input.logo_width, 40, 400, 140),
    footer: String(input.footer ?? "").slice(0, 120),
    show_slide_number: Boolean(input.show_slide_number),
    text_color: HEX.test(input.text_color) ? input.text_color : "#2B2420",
    title_size: int(input.title_size, 24, 96, 56),
    body_size: int(input.body_size, 12, 48, 24),
  };
}

export async function saveMaster(id: number | null, input: MasterInput): Promise<number> {
  const viewer = await viewerId();
  const row = { ...clean(input), updated_at: new Date().toISOString() };
  if (id) {
    const { data: m } = await db.from("masters").select("owner_id").eq("id", id).single();
    if (!m || m.owner_id !== viewer) throw new Error("Only the creator can edit this master");
    await ensureBaseline("master", id, viewer);
    await db.from("masters").update(row).eq("id", id);
  } else {
    const { data } = await db.from("masters").insert({ ...row, owner_id: viewer }).select("id").single();
    id = data!.id as number;
  }
  await recordVersion("master", id!, viewer);
  revalidatePath("/decks", "layout");
  return id!;
}

export async function makeDefaultMaster(id: number) {
  // Only the creator may change their master, including making it the team default.
  const { data: m } = await db.from("masters").select("owner_id").eq("id", id).single();
  if (!m || m.owner_id !== (await viewerId())) throw new Error("Only the creator can make this master the default");
  await db.from("masters").update({ is_default: true }).eq("id", id);
  await db.from("masters").update({ is_default: false }).neq("id", id);
  revalidatePath("/decks", "layout");
}

export async function setDeckMaster(deckId: number, masterId: number | null) {
  const viewer = await viewerId();
  const { data: d } = await db.from("decks").select("owner_id").eq("id", deckId).single();
  if (!d || d.owner_id !== viewer) throw new Error("Forbidden");
  await db.from("decks").update({ master_id: masterId, updated_at: new Date().toISOString() }).eq("id", deckId);
  revalidatePath(`/decks/${deckId}`);
}
