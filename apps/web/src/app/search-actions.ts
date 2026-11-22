"use server";
// Search (tickets #412, #530; GLOSSARY: Search, Metric, Period Record, Dashboard, Deck, Workflow, Group): the ⌘K search
// as thin calls. The core chooses among what the signed-in person may see (Metrics, dashboards, decks, Workflows,
// people, Groups, their own forms); the pages and commands offered come from their Workspace Role. The browser sends
// words and gets back names and addresses, nothing else.
import { attempt } from "@/lib/action-result";
import { periodRecordUrl } from "@/lib/period-record-url";
import { commandEntries, matchEntries, pageEntries, type Entry } from "@/lib/search-entries";
import { currentActor } from "@/lib/viewer";
import { can } from "@ziffr/core/actor";
import { MAX_QUERY } from "@ziffr/core/search-query";
import { search, type SearchResult } from "@ziffr/core/search";

/** A result with the page it leads to; pages and commands are rows too. */
export type SearchRow = (SearchResult | (Entry & { kind: "page" | "command" })) & { href: string };

/** The address a result leads to. The form of a Metric the person submits is their own link, `/submit/<code>`. */
function hrefOf(r: SearchResult): string {
  switch (r.kind) {
    case "period": return periodRecordUrl(r.slug, r.period);
    case "metric": return `/metrics/${encodeURIComponent(r.slug)}`;
    // The Metrics list filtered by the Tag (the list shows only what the person may see).
    case "tag": return `/metrics?tag=${encodeURIComponent(r.name)}`;
    case "dashboard": return `/dashboards/${r.id}`;
    case "deck": return `/decks/${r.id}`;
    case "workflow": return `/workflows?id=${r.id}`;
    // There is no page of one person or Group; the list they are on is the place.
    case "person": case "group": return "/team";
    case "record": return `/submit/${encodeURIComponent(r.code)}`;
  }
}

/** The commands this person may use, for the empty search. */
async function commandsFor() {
  const actor = await currentActor();
  return commandEntries({ create: can(actor, "create"), invite: can(actor, "manage-members") });
}

/** What the search shows before anything is typed: the commands the person may use, and a key for the browser to keep
 * their recent items under (a person's own, so another person on the same browser never sees them). */
export async function searchStart() {
  return attempt(async () => {
    const actor = await currentActor();
    return { key: `${actor.workspaceId}:${actor.personId}`, commands: await commandsFor() };
  });
}

/** Commands, pages, then what the core finds, for the words: Metrics, a Metric's value for a period, dashboards, decks,
 * Workflows, people, Groups and the forms of Metrics the person submits. */
export async function searchEverything(words: string) {
  return attempt(async () => {
    if (typeof words !== "string") return [];
    // Cut before anything reads it: the browser's text is untrusted and may be huge.
    const text = words.slice(0, MAX_QUERY);
    const actor = await currentActor();
    const entries = [...matchEntries(await commandsFor(), text, 4), ...matchEntries(pageEntries(actor.role), text, 6)];
    const found = await search(actor, text);
    return [...entries.map((e): SearchRow => ({ ...e })), ...found.map((r): SearchRow => ({ ...r, href: hrefOf(r) }))];
  });
}
