import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getCanvasData } from "@/lib/access";
import { DeckEditorLoader } from "./loader";
import type { Widget } from "@/lib/types";

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const viewer = await viewerId();
  const { data: deck } = await db.from("decks").select("*").eq("id", id).single();
  if (!deck || deck.owner_id !== viewer) notFound();
  const [data, { data: saved }] = await Promise.all([getCanvasData(viewer), db.from("widgets").select("*").eq("owner_id", viewer).eq("saved", true).order("id")]);
  return <DeckEditorLoader deck={{ id: deck.id, name: deck.name, document: deck.document }} data={data} saved={(saved ?? []) as Widget[]} />;
}
