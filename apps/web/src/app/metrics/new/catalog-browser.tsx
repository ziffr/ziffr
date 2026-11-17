"use client";

// Browsing the Metric Catalog (GLOSSARY: Metric Catalog): search by name and definition, filter by category. The
// catalog is the same for every workspace and holds no one's data, so it is filtered in the browser.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { POLARITY_LABEL, targetText } from "@ziffr/core/format";
import type { CatalogMetric } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { PERIOD_LABEL } from "@ziffr/core/periods";

/** What the workspace's Workspace Profile says about it, for suggestions: its industry and segment keys and words. */
export type CatalogFit = { industry: string | null; segment: string | null; label: string };

/** Whether a catalog Metric was written for this kind of business: tagged with its industry, and not for another
 * segment. Untagged ones suit anyone and are not suggested over the rest. */
const suits = (c: CatalogMetric, fit: CatalogFit) =>
  Boolean(fit.industry && c.industries?.includes(fit.industry)) && (!fit.segment || !c.segments || c.segments.includes(fit.segment));

/** The catalog as a searchable list of cards, grouped by category; with a Workspace Profile, a filter for the
 * Metrics written for its industry. */
export function CatalogBrowser({ items, fit }: { items: CatalogMetric[]; fit?: CatalogFit | null }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const suited = useMemo(() => (fit ? items.filter((c) => suits(c, fit)) : []), [items, fit]);
  const [onlySuited, setOnlySuited] = useState(false);
  const categories = useMemo(() => [...new Set(items.map((c) => c.category))], [items]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((c) => (!onlySuited || suits(c, fit!)) && (!category || c.category === category) && words.every((w) => `${c.name} ${c.description} ${c.unit}`.toLowerCase().includes(w)));
  const groups = Object.entries(Object.groupBy(shown, (c) => c.category));
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1 text-xs", active ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted/60");

  return (
    <>
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search the Metric Catalog" placeholder="Search, e.g. churn, margin, tickets" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {suited.length > 0 && <button type="button" aria-pressed={onlySuited} onClick={() => setOnlySuited(!onlySuited)} className={chip(onlySuited)}>For {fit!.label} ({suited.length})</button>}
          <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)} className={chip(category === null)}>All ({items.length})</button>
          {categories.map((cat) => (
            <button key={cat} type="button" aria-pressed={category === cat} onClick={() => setCategory(category === cat ? null : cat)} className={chip(category === cat)}>
              {cat} ({items.filter((c) => c.category === cat).length})
            </button>
          ))}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">{shown.length} metrics shown</p>
      {shown.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm text-muted-foreground">
          No catalog metric matches. Try another word, or start from scratch.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([cat, list]) => (
            <section key={cat}>
              <h3 className="mb-2 text-sm font-medium tracking-normal text-muted-foreground">{cat}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list!.map((c) => (
                  <Link key={c.id} href={`/metrics/new?catalog=${c.id}`} className="stock rounded-[var(--radius-card)] p-4 transition-[transform,box-shadow] hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)]">
                    <div className="font-medium">{c.name}</div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{c.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[var(--color-ink-2)]">
                      <span className="rounded bg-muted px-1.5 py-0.5">{PERIOD_LABEL[c.period]}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5">{POLARITY_LABEL[c.polarity]}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5">Target {targetText({ ...c, target_min: c.target_min === null ? null : Number(c.target_min), target_max: c.target_max === null ? null : Number(c.target_max) })}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
