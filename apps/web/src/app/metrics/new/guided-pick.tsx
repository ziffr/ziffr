// The new Metric page as someone from the Setup Guide first sees it (GLOSSARY: Setup Guide, Metric Catalog): starting
// from scratch, confirmed; a few suggestions to pick from, a button to define it themselves, and the whole catalog on
// request. Nothing calculated, as there is nothing to calculate from yet, and no Packs, which the step before offers.
// Only the layout and the words differ from the usual page; who may create a Metric is the page's and the core's check.
import Link from "next/link";
import { ArrowLeft, ChevronDown, PenLine } from "lucide-react";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { CatalogMetric, UnitPosition } from "@ziffr/core/types";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { CatalogBrowser, type CatalogFit } from "./catalog-browser";
import { HOW_OFTEN, type Suggestion } from "./suggestions";

const link = "inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground sm:min-h-0";

/** The first screen of "Explore on my own". `notes` is the Workspace Limit's note, when there is one to show. */
export function GuidedPick({ suggestions, items, fit, money, numberStyle, notes }: { suggestions: Suggestion[]; items: CatalogMetric[]; fit: CatalogFit | null; money: { unit: string; unit_position: UnitPosition }; numberStyle: NumberStyle; notes?: React.ReactNode }) {
  return (
    <>
      <Link href="/setup?step=start" className={`mb-3 ${link}`}><ArrowLeft aria-hidden className="size-4" /> Back to the Setup Guide</Link>
      <PageHeader title="OK, from scratch. Let’s do your first metric together" sub="A metric is one number you keep track of over time. Pick one of our suggestions, or define it yourself. You can change everything later." />
      {notes}
      <h2 className="text-base font-medium">Pick a suggestion</h2>
      <p className="mt-1 mb-3 text-sm text-muted-foreground">Choose one and the details are filled in for you.</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map(({ entry, line }) => (
          <li key={entry.id} className="flex">
            <Link href={`/metrics/new?catalog=${entry.id}&setup=1`} className="stock flex w-full flex-col rounded-[var(--radius-card)] p-4 transition-[transform,box-shadow] hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)]">
              <span className="font-medium">{entry.name}</span>
              <span className="mt-1 text-sm text-muted-foreground">{line}</span>
              <span className="mt-auto pt-2 text-xs text-[var(--color-ink-2)] max-sm:text-sm">{HOW_OFTEN[entry.period]}</span>
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-base font-medium">Or define it yourself</h2>
      <p className="mt-1 mb-3 text-sm text-muted-foreground">Anything you can count or measure.</p>
      <Link href="/metrics/new?scratch=1&setup=1" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 w-full sm:w-auto" })}><PenLine aria-hidden className="size-4" /> Define it yourself</Link>
      <details className="group mt-8 border-t border-border pt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-base font-medium [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden className="size-4 -rotate-90 transition-transform group-open:rotate-0" /> Show all suggestions
        </summary>
        <div className="mt-3">
          <CatalogBrowser items={items} fit={fit} money={money} numberStyle={numberStyle} fromGuide />
        </div>
      </details>
    </>
  );
}
