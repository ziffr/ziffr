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
import { readKeptNumbers, snapshotAddition } from "@ziffr/core/deck-snapshots";
import { keptRequests } from "@ziffr/core/snapshot-parts";
import { withParts } from "@/decks/kept/kept-drawing";
import { deckTemplateSeed, importSeedOf, listDeckTemplates, readFills } from "@ziffr/core/deck-templates";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { deckAddition } from "@ziffr/core/deck-additions";
import { cookies } from "next/headers";
import { followDemoSuccessor } from "@/lib/demo-follow";
import { DECK_ADD_COOKIE, readIntent } from "@/lib/deck-add-intent";
import { DesktopOnly } from "@/components/desktop-only";
import { MADE_DECKS_ON } from "@ziffr/core/made-decks-on";

export default async function DeckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; template?: string; fills?: string; add?: string }> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const from = Number(sp.from);
  const viewer = await viewerId();
  const actor = await currentActor();
  // Only decks of this workspace exist here; another workspace's deck ids and owners stay unknown.
  const view = await deckView(actor, id);
  if (!view) { await followDemoSuccessor("deck", id); notFound(); }
  const { role, deck } = view;
  if (!role || !deck) {
    return (
      <div className="mx-auto max-w-md rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm">
        <p className="font-medium">This deck isn&rsquo;t shared with you</p>
        <RequestAccess type="deck" id={id} owner={view.ownerFirstName ?? "the owner"} />
      </div>
    );
  }
  // A deck Ziffr makes has a page of its own, which a phone does well (spec 0069).
  if (deck.made === true && MADE_DECKS_ON) redirect(role === "viewer" ? `/decks/${id}/present` : `/decks/${id}/slides`);
  if (role === "viewer") redirect(`/decks/${id}/present`); // which counts the open
  void countView(actor, { kind: "deck", id });
  // A new, empty deck made from a dashboard (spec 0010) gets that one's widgets as its first slides; the
  // core checks the person may open it. Any other deck, or one that has slides, starts as it is.
  const empty = !Object.values((deck.document as { store?: Record<string, { type?: string }> } | null)?.store ?? {}).some((r) => r.type === "frame");
  const seed = empty && Number.isInteger(from) && from > 0 ? await deckSeed(actor, from).catch(() => null) : null;
  // Made from a Deck Template (spec 0030): its slides with its Slots filled; the core checks every Metric again.
  const fromTemplate = Number(sp.template);
  // A deck imported from a Workspace Export (spec 0040) waits with its template and fills in its document: laid out now.
  const waiting = empty ? importSeedOf(deck.document) : null;
  const templateSeed = empty && !seed && Number.isInteger(fromTemplate) && fromTemplate > 0 ? await deckTemplateSeed(actor, fromTemplate, readFills(sp.fills)).catch(() => null)
    : empty && !seed && waiting ? await deckTemplateSeed(actor, waiting.template, waiting.fills).catch(() => null) : null;
  // A widget added from its menu (ticket #1) or a Snapshot's slides (spec 0061), only when the person's own menu asked
  // for it (deck-add-intent.ts): the core checks again that they may change the deck and may open what is added; the
  // editor places it and saves.
  const intent = readIntent((await cookies()).get(DECK_ADD_COOKIE)?.value, actor.personId, id, sp.add);
  const snapshot = intent && "snapshotId" in intent ? await snapshotAddition(actor, id, intent.snapshotId).catch(() => null) : null;
  const addition = intent && "widgetId" in intent ? await deckAddition(actor, id, intent.widgetId, intent.slide).catch(() => null) : null;
  // What the slides keep of Snapshots, with what is about to be added: each as this person may see it.
  const kept = keptRequests(deck.document);
  const asked = snapshot ? withParts(kept, snapshot.snapshotId, snapshot.parts) : kept;
  const [data, saved, shares, groups, numbers] = await Promise.all([
    // The deck's own widgets' series; one placed in the editor fetches its own.
    getCanvasData(viewer, [...deckMetricIds(deck.document, deck.made), ...(seed?.widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)) ?? []), ...(templateSeed?.fills.flat() ?? []), ...(addition ? widgetMetricIds(addition.widget.metric_ids, addition.widget.settings) : [])]),
    savedWidgets(actor),
    getRawShares(),
    getGroups(),
    readKeptNumbers(actor, asked),
  ]);
  return (
    <>
      <DesktopOnly path={`/decks/${deck.id}`} look={`/decks/${deck.id}/present`} />
      <DeckEditorLoader
        deck={{ id: deck.id, name: deck.name, document: waiting ? null : deck.document, theme_id: deck.theme_id, footer: deck.footer }}
        data={data}
        saved={saved}
        seed={seed}
        templateSeed={templateSeed}
        addition={addition}
        snapshot={snapshot}
        kept={{ asked, read: numbers }}
        deckTemplates={(await listDeckTemplates(actor)).filter((t) => t.owner_id === actor.personId).map(({ id, name, description, slots }) => ({ id, name, description, slots }))}
        sharing={role === "owner" ? { shares, groups, ownerId: deck.owner_id, canInvite: can(actor, "manage-members"), reveals: await revealedBy(deckMetricIds(deck.document, deck.made), deck.owner_id) } : null}
      />
    </>
  );
}
