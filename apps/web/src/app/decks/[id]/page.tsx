import { notFound, redirect } from "next/navigation";
import { RequestAccess } from "@/components/who-can-see";
import { deckMetricIds, getGroups, getRawShares, revealedBy } from "@/lib/access";
import { currentActor, viewerId } from "@/lib/viewer";
import { deckView, savedWidgets } from "@ziffr/core/page-data";
import { getCanvasData } from "@/lib/access";
import { DeckEditorLoader } from "./loader";
import { deckSeed } from "@ziffr/core/conversions";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";

export default async function DeckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const id = Number((await params).id);
  const from = Number((await searchParams).from);
  const viewer = await viewerId();
  const actor = await currentActor();
  // Only decks of this workspace exist here; another workspace's deck ids and owners stay unknown.
  const view = await deckView(actor, id);
  if (!view) notFound();
  const { role, deck } = view;
  if (!role || !deck) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm">
        <p className="font-medium">This deck isn&rsquo;t shared with you</p>
        <RequestAccess type="deck" id={id} owner={view.ownerFirstName ?? "the owner"} />
      </div>
    );
  }
  if (role === "viewer") redirect(`/decks/${id}/present`);
  // A new, empty deck made from a dashboard (spec 0010) gets that one's widgets as its first slides; the
  // core checks the person may open it. Any other deck, or one that has slides, starts as it is.
  const empty = !Object.values((deck.document as { store?: Record<string, { type?: string }> } | null)?.store ?? {}).some((r) => r.type === "frame");
  const seed = empty && Number.isInteger(from) && from > 0 ? await deckSeed(actor, from).catch(() => null) : null;
  const [data, saved, shares, groups] = await Promise.all([
    // The deck's own widgets' series; one placed in the editor fetches its own.
    getCanvasData(viewer, [...deckMetricIds(deck.document), ...(seed?.widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)) ?? [])]),
    savedWidgets(actor),
    getRawShares(),
    getGroups(),
  ]);
  return (
    <DeckEditorLoader
      deck={{ id: deck.id, name: deck.name, document: deck.document, theme_id: deck.theme_id, footer: deck.footer }}
      data={data}
      saved={saved}
      seed={seed}
      sharing={role === "owner" ? { shares, groups, ownerId: deck.owner_id, reveals: await revealedBy(deckMetricIds(deck.document), deck.owner_id) } : null}
    />
  );
}
