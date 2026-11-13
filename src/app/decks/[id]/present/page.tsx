import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getCanvasData } from "@/lib/access";
import { SlideshowLoader } from "./loader";
import type { Master } from "@/lib/types";

export default async function DeckPresentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string }> }) {
  const id = Number((await params).id);
  const viewer = await viewerId();
  const { data: deck } = await db.from("decks").select("*").eq("id", id).single();
  if (!deck || deck.owner_id !== viewer) notFound();
  const [data, { data: master }] = await Promise.all([
    getCanvasData(viewer),
    deck.master_id ? db.from("masters").select("*").eq("id", deck.master_id).single() : Promise.resolve({ data: null }),
  ]);
  return <SlideshowLoader deck={{ id: deck.id, name: deck.name, document: deck.document, theme_id: deck.theme_id }} master={(master as Master | null) ?? null} data={data} start={Number((await searchParams).at) || 0} />;
}
