import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getCanvasData, visibleDecks } from "@/lib/access";
import { SlideshowLoader } from "./loader";

export default async function DeckPresentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ at?: string }> }) {
  const id = Number((await params).id);
  const viewer = await viewerId();
  const { data: deck } = await db.from("decks").select("*").eq("id", id).single();
  if (!deck || !(await visibleDecks(viewer)).some((d) => d.id === id)) notFound();
  const data = await getCanvasData(viewer);
  return <SlideshowLoader deck={{ id: deck.id, name: deck.name, document: deck.document, theme_id: deck.theme_id, footer: deck.footer }} data={data} start={Number((await searchParams).at) || 0} />;
}
