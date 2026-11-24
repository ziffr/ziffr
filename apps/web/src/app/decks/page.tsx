import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Presentation } from "lucide-react";
import { can } from "@ziffr/core/actor";
import { visibleDecks } from "@/lib/access";
import { getProfileMap } from "@/lib/data";
import { currentActor, viewerId } from "@/lib/viewer";
import { deckDocuments } from "@ziffr/core/page-data";
import { createDeck } from "@/app/deck-actions";
import { AnsweredForm } from "@/components/answered-form";
import { deckTemplateChoices } from "@ziffr/core/deck-templates";
import { NewDeckFromTemplate } from "@/components/new-deck-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function DecksPage() {
  const viewer = await viewerId();
  const access = await visibleDecks(viewer);
  const actor = await currentActor();
  const rows = await deckDocuments(actor);
  // The team's Deck Templates and the Metrics this person may fill them with; nothing for a Guest. Only the names of
  // their creators go to the browser, never the rest of a profile.
  const choices = await deckTemplateChoices(actor);
  const [people, decks] = [await getProfileMap(), access.map((d) => ({ ...d, document: rows.find((r) => r.id === d.id)?.document }))];
  return (
    <>
      <PageHeader title="Decks" sub="Lay out widgets, text and arrows on 16:9 slides, then export a PowerPoint or a PDF with today’s values.">
        {can(actor, "create") && <Link href="/themes" className="text-sm underline">Themes</Link>}
        {can(actor, "create") && (
          <AnsweredForm action={createDeck} className="flex gap-2">
            <Input name="name" placeholder="Name of the new deck" aria-label="Name of the new deck" className="w-56" />
            <Button type="submit">New deck</Button>
          </AnsweredForm>
        )}
        {choices.templates.length > 0 && <NewDeckFromTemplate templates={choices.templates} metrics={choices.metrics} people={Object.fromEntries(choices.templates.map((t) => [t.owner_id, { name: people[t.owner_id]?.name ?? "" }]))} />}
      </PageHeader>
      {!decks?.length ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center">
          <Presentation aria-hidden className="mx-auto mb-3 size-7 text-muted-foreground" />
          <p className="font-medium">{can(actor, "create") ? "No decks yet" : "Nothing has been shared with you yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{can(actor, "create") ? "Name one above. It starts with a title slide." : "Ask whoever invited you."}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => {
            const slides = d.document ? Object.values((d.document as { store?: Record<string, { typeName?: string; type?: string }> }).store ?? {}).filter((r) => r.typeName === "shape" && r.type === "frame").length : 0;
            return (
              <li key={d.id}>
                <Link href={d.role === "viewer" ? `/decks/${d.id}/present` : `/decks/${d.id}`} className="stock block rounded-[var(--radius-card)] p-4 no-underline transition-[transform,box-shadow] hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)]">
                  <div className="desk mb-3 aspect-video rounded-[var(--radius-input)]" aria-hidden />
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="fig">{slides}</span> slide{slides === 1 ? "" : "s"}, edited {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                    {d.role !== "owner" && <span className="block">From {people[d.owner_id]?.name.split(" ")[0]}, you {d.role === "editor" ? "can edit it" : "can present it"}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
