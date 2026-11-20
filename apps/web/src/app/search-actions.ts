"use server";
// Search (ticket #412; GLOSSARY: Metric, Period Record, Dashboard, Deck): the top bar's ⌘K search as one thin call into
// the core, which chooses only among what the signed-in person may see in their Workspace. The browser sends words
// and gets back names and addresses, nothing else.
import { attempt } from "@/lib/action-result";
import { periodRecordUrl } from "@/lib/period-record-url";
import { currentActor } from "@/lib/viewer";
import { search, type SearchResult } from "@ziffr/core/search";

/** A result with the page it leads to. */
export type SearchRow = SearchResult & { href: string };

/** The address a result leads to. */
function hrefOf(r: SearchResult): string {
  if (r.kind === "period") return periodRecordUrl(r.slug, r.period);
  if (r.kind === "metric") return `/metrics/${encodeURIComponent(r.slug)}`;
  return `/${r.kind === "deck" ? "decks" : "dashboards"}/${r.id}`;
}

/** Metrics, dashboards and decks matching the words, and "Metric + period" for period words such as "march 2026". */
export async function searchEverything(words: string) {
  return attempt(async () => {
    const found = typeof words === "string" ? await search(await currentActor(), words) : [];
    return found.map((r): SearchRow => ({ ...r, href: hrefOf(r) }));
  });
}
