import { notFound, redirect } from "next/navigation";
import { deckMetricIds, getGroups, getRawShares, revealedBy, visibleDecks } from "@/lib/access";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getCanvasData } from "@/lib/access";
import { DeckEditorLoader } from "./loader";
import type { Widget } from "@/lib/types";

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const viewer = await viewerId();
  const { data: deck } = await db.from("decks").select("*").eq("id", id).single();
  const role = (await visibleDecks(viewer)).find((d) => d.id === id)?.role;
  if (!deck || !role) notFound();
  if (role === "viewer") redirect(`/decks/${id}/present`);
  const [data, { data: saved }, shares, groups] = await Promise.all([
    getCanvasData(viewer),
    db.from("widgets").select("*").eq("owner_id", viewer).eq("saved", true).order("id"),
    getRawShares(),
    getGroups(),
  ]);
  return (
    <DeckEditorLoader
      deck={{ id: deck.id, name: deck.name, document: deck.document, theme_id: deck.theme_id, footer: deck.footer }}
      data={data}
      saved={(saved ?? []) as Widget[]}
      sharing={role === "owner" ? { shares, groups, ownerId: deck.owner_id, reveals: await revealedBy(deckMetricIds(deck.document), deck.owner_id) } : null}
    />
  );
}
