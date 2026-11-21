import { notFound, redirect } from "next/navigation";
import { can } from "@ziffr/core/actor";
import { RequestAccess } from "@/components/who-can-see";
import { deckMetricIds, getGroups, getRawShares, revealedBy } from "@/lib/access";
import { currentActor, viewerId } from "@/lib/viewer";
import { deckView, savedWidgets } from "@ziffr/core/page-data";
import { getCanvasData } from "@/lib/access";
import { DeckEditorLoader } from "./loader";
import { countView } from "@/lib/count-view";
import { deckSeed } from "@ziffr/core/conversions";
import { snapshotDeckSeed } from "@ziffr/core/snapshots";
import { deckTemplateSeed, listDeckTemplates, readFills } from "@ziffr/core/deck-templates";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { deckAddition } from "@ziffr/core/deck-additions";
import { cookies } from "next/headers";
import { DECK_ADD_COOKIE, readIntent } from "@/lib/deck-add-intent";

export default async function DeckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; snapshot?: string; template?: string; fills?: string; add?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const from = Number(sp.from);
  const fromSnapshot = Number(sp.snapshot);
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
  if (role === "viewer") redirect(`/decks/${id}/present`); // which counts the open
  void countView(actor, { kind: "deck", id });
  // A new, empty deck made from a dashboard (spec 0010) gets that one's widgets as its first slides; the
  // core checks the person may open it. Any other deck, or one that has slides, starts as it is.
  const empty = !Object.values((deck.document as { store?: Record<string, { type?: string }> } | null)?.store ?? {}).some((r) => r.type === "frame");
  // Made from a Snapshot (spec 0013): its widgets with its words, drawing the values of its period only.
  const seed = !empty ? null
    : Number.isInteger(fromSnapshot) && fromSnapshot > 0 ? await snapshotDeckSeed(actor, fromSnapshot).catch(() => null)
    : Number.isInteger(from) && from > 0 ? await deckSeed(actor, from).catch(() => null) : null;
  // Made from a Deck Template (spec 0030): its slides with its Slots filled; the core checks every Metric again.
  const fromTemplate = Number(sp.template);
  const templateSeed = empty && !seed && Number.isInteger(fromTemplate) && fromTemplate > 0 ? await deckTemplateSeed(actor, fromTemplate, readFills(sp.fills)).catch(() => null) : null;
  // A widget added from its menu (ticket #1), only when the person's own menu asked for it (deck-add-intent.ts): the
  // core checks again that they may change the deck, open the widget and see its Metrics; the editor places the
  // copy on that slide or a new one and saves.
  const intent = readIntent((await cookies()).get(DECK_ADD_COOKIE)?.value, actor.personId, id, sp.add);
  const addition = intent ? await deckAddition(actor, id, intent.widgetId, intent.slide).catch(() => null) : null;
  const [data, saved, shares, groups] = await Promise.all([
    // The deck's own widgets' series; one placed in the editor fetches its own.
    getCanvasData(viewer, [...deckMetricIds(deck.document), ...(seed?.widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)) ?? []), ...(templateSeed?.fills.flat() ?? []), ...(addition ? widgetMetricIds(addition.widget.metric_ids, addition.widget.settings) : [])]),
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
      templateSeed={templateSeed}
      addition={addition}
      deckTemplates={(await listDeckTemplates(actor)).filter((t) => t.owner_id === actor.personId).map(({ id, name, description, slots }) => ({ id, name, description, slots }))}
      sharing={role === "owner" ? { shares, groups, ownerId: deck.owner_id, canInvite: can(actor, "manage-members"), reveals: await revealedBy(deckMetricIds(deck.document), deck.owner_id) } : null}
    />
  );
}
