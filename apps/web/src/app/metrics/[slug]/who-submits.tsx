// Who submits, the box on a Metric's Description tab (GLOSSARY: Submitter, Feed, Stand-in): who may send values for
// it, and for its owner and Editors the ways to add and remove people and Feeds. A server component: it gets only the
// Tokens the page may show (a form code only where metricExtras hands one out) and asks the core whom it may offer.
import Link from "next/link";
import { KeyRound } from "lucide-react";
import type { Actor } from "@ziffr/core/actor";
import { SOURCE_LABEL } from "@ziffr/core/format";
import { feedTemplates } from "@ziffr/core/feed-template-download";
import { submitterChoices } from "@ziffr/core/who-submits";
import type { RouteView } from "@ziffr/core/prompt-route";
import type { Metric, Profile } from "@ziffr/core/types";
import { Person } from "@/components/avatar";
import { FeedControls, RemoveFeed } from "./feed-picker";
import { NextPrompt } from "./next-prompt";
import { AddSubmitter, RemoveSubmitter } from "./submitter-controls";
import { removingWords } from "./submitter-words";

/** A Token as the Metric's page may show it. */
type Row = { id: number; code: string | null; submitter_id: string; stand_in_id?: string | null; stands_in_for?: string | null; feed: boolean };

/** What removing a Submitter would do, from the Metric's Tokens as they are now. */
function removingSays(t: Row, tokens: Row[], people: Record<string, Profile>, ownerId: string): string {
  const own = tokens.filter((x) => !x.stands_in_for);
  const named = (id: string) => people[id]?.name ?? "someone";
  return removingWords({
    name: named(t.submitter_id),
    contact: Boolean(people[t.submitter_id]?.contact),
    owner: t.submitter_id === ownerId,
    standIn: t.stand_in_id ? named(t.stand_in_id) : null,
    standsFor: own.filter((x) => x.stand_in_id === t.submitter_id).map((x) => named(x.submitter_id)),
    otherPeople: own.filter((x) => !x.feed && x.submitter_id !== t.submitter_id).length,
    feed: own.some((x) => x.feed),
  });
}

/** The box. Adding and removing people is not offered in the demo, whose people nobody may change. */
export async function WhoSubmits({ actor, metric, tokens, people, promptWays, canEdit, demo, workflow, feeds }: {
  actor: Actor; metric: Metric; tokens: Row[]; people: Record<string, Profile>; promptWays: Record<string, RouteView>; canEdit: boolean; demo: boolean;
  /** Whether a Workflow asks for the Metric's values. */
  workflow: boolean; feeds: { id: string; name: string }[];
}) {
  const changes = canEdit && !demo;
  const choices = changes ? await submitterChoices(actor, metric.id) : [];
  const webForm = metric.sources.includes("web_form");
  return (
    <section className="stock rounded-[var(--radius-card)] p-5 text-sm">
      <h2 className="mb-1 flex items-center gap-2 font-medium"><KeyRound className="size-4" /> Who submits</h2>
      <p className="mb-3 text-xs text-muted-foreground">Who may send values for this metric. Ziffr recognises them by their Slack name or mail address, or by their personal form link.</p>
      <ul className="space-y-2">
        {tokens.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <span className="flex flex-wrap items-center gap-x-2">
              <Person p={people[t.submitter_id]} />
              {canEdit && t.stands_in_for && <span className="text-xs text-muted-foreground">Stand-in for {people[t.stands_in_for]?.name.split(" ")[0] ?? "someone"}</span>}
            </span>
            <span className="flex flex-wrap items-center justify-end gap-x-2">
              {t.feed ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">Feed{canEdit && <RemoveFeed metricId={metric.id} feedId={t.submitter_id} name={people[t.submitter_id]?.name ?? "this Feed"} />}</span>
              ) : !t.code ? null : webForm ? (
                <Link href={`/submit/${t.code}`} className="inline-flex items-center text-xs underline max-md:min-h-11 pointer-coarse:min-h-11">Open form link</Link>
              ) : <code className="fig text-xs text-muted-foreground [overflow-wrap:anywhere]">{t.code}</code>}
              {changes && !t.feed && !t.stands_in_for && <RemoveSubmitter metricId={metric.id} personId={t.submitter_id} name={people[t.submitter_id]?.name ?? "this person"} says={removingSays(t, tokens, people, metric.owner_id)} />}
            </span>
            {!t.feed && promptWays[t.submitter_id] && <NextPrompt view={promptWays[t.submitter_id]} />}
          </li>
        ))}
        {!tokens.length && <li className="text-muted-foreground">Nobody yet.</li>}
      </ul>
      {changes && <AddSubmitter metric={{ id: metric.id, webForm, ways: metric.sources.map((s) => SOURCE_LABEL[s]), workflow, archived: Boolean(metric.archived_at) }} choices={choices} />}
      {canEdit && <FeedControls metric={{ id: metric.id, name: metric.name }} choices={feeds} taken={tokens.map((t) => t.submitter_id)} role={actor.role} demo={demo} templates={feedTemplates()} />}
    </section>
  );
}
