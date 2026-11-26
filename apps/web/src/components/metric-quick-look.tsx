"use client";
// A Metric's quick look (GLOSSARY: Quick look, Slide-over): wherever a Metric is named in a list or on a widget, its
// latest value, target, trend and owner open beside the page, with `?panel=metric-<slug>` as the direct URL. The data
// is read on open by a server action that checks the Metric is visible to this person.
import { useEffect, useState } from "react";
import Link from "next/link";
import { PanelRightOpen } from "lucide-react";
import { metricQuickLook } from "@/app/quick-look-actions";
import type { QuickLook } from "@ziffr/core/quick-look";
import { isActionError } from "@/lib/action-error";
import { lookPanel, useOpenPanel, writePanel } from "@/lib/panel-param";
import { RecordValue } from "@/app/metrics/[slug]/record-value";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Change, TargetChip } from "@/components/target-chip";
import { Sparkline } from "@/views/sparkline";
import { formatValue, health, SOURCE_LABEL, targetText } from "@ziffr/core/format";
import { PERIOD_LABEL, periodLabel } from "@ziffr/core/periods";

const LOOK_PREFIX = lookPanel("");

type Look = { state: "loading" } | { state: "refused"; words: string } | { state: "failed" } | { state: "ready"; look: QuickLook };

function Panel({ slug }: { slug: string }) {
  const [look, setLook] = useState<Look>({ state: "loading" });
  useEffect(() => {
    let live = true;
    metricQuickLook(slug).then((r) => live && setLook(isActionError(r) ? { state: "refused", words: r.error } : { state: "ready", look: r })).catch(() => live && setLook({ state: "failed" }));
    return () => { live = false; };
  }, [slug]);
  const name = look.state === "ready" ? look.look.metric.name : "Quick look";
  const frame = (body: React.ReactNode) => (
    <>
      <SheetHeader>
        <SheetTitle>{name}</SheetTitle>
        <SheetDescription>Quick look</SheetDescription>
      </SheetHeader>
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto px-4 pb-4">{body}</div>
      <div className="flex flex-col gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {look.state === "ready" && look.look.record && <RecordValue offer={look.look.record} wide />}
        <Link href={`/metrics/${encodeURIComponent(slug)}`} className={buttonVariants({ variant: look.state === "ready" && look.look.record ? "outline" : "default", className: "w-full" })}>Open the Metric</Link>
      </div>
    </>
  );
  if (look.state === "loading") return frame(<p className="text-sm text-muted-foreground" aria-live="polite">Loading…</p>);
  if (look.state === "refused") return frame(<p className="text-sm">{look.words}</p>);
  if (look.state === "failed") return frame(<p className="text-sm">The quick look did not load. Close it and try again.</p>);
  const { metric: m, points: pts, ownerName, yearStart, numberStyle } = look.look;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const change = last && prev && prev.value ? (last.value - prev.value) / Math.abs(prev.value) : null;
  return frame(
    <>
      <p className="text-sm text-muted-foreground">{PERIOD_LABEL[m.period]}, {m.derived ? "derived from other metrics" : `via ${m.sources.map((s) => SOURCE_LABEL[s]).join(" or ")}`}</p>
      <div>
        <div className="fig text-3xl font-semibold tracking-tight">{last ? formatValue(m, last.value, numberStyle) : "–"}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TargetChip numberStyle={numberStyle} metric={m} value={last?.value} />
          {last ? periodLabel(last.period, m.period, yearStart, true) : "No values yet"}
          <Change numberStyle={numberStyle} pct={change} />
        </div>
      </div>
      {pts.length > 1 && <Sparkline points={pts} height={64} tone={health(m, last?.value)} />}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Target</dt><dd className="fig min-w-0 text-right">{targetText(m, numberStyle)}</dd>
        <dt className="text-muted-foreground">Owner</dt><dd className="min-w-0 text-right [overflow-wrap:anywhere]">{ownerName ?? "–"}</dd>
      </dl>
      {pts.length > 0 && (
        <table className="w-full text-sm">
          <caption className="pb-1 text-left text-xs text-muted-foreground">Latest values</caption>
          <tbody>
            {pts.slice(-6).reverse().map((p) => (
              <tr key={p.period} className="border-t border-border"><th scope="row" className="py-1 text-left font-normal text-muted-foreground">{periodLabel(p.period, m.period, yearStart, true)}</th><td className="fig py-1 text-right">{formatValue(m, p.value, numberStyle)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** Opens the quick look of a Metric through the address; the host below draws it. */
export function openQuickLook(slug: string) {
  writePanel(lookPanel(slug));
}

/** The quick look panel, once per page (in the app shell): open whenever the address names a Metric's panel, so every
 * "Quick look" button and every deep link share it. */
export function QuickLookHost() {
  const panel = useOpenPanel();
  const wanted = panel?.startsWith(LOOK_PREFIX) ? panel.slice(LOOK_PREFIX.length) : null;
  // Kept after closing so the panel slides out with its content instead of emptying first.
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => { if (wanted) setSlug(wanted); }, [wanted]);
  if (!slug) return null;
  return (
    <Sheet open={wanted !== null} onOpenChange={(o) => { if (!o) writePanel(null); }}>
      <SheetContent>
        <Panel key={slug} slug={slug} />
      </SheetContent>
    </Sheet>
  );
}

/** The small "Quick look" button beside a Metric's name. */
export function QuickLookButton({ slug, name, className }: { slug: string; name: string; className?: string }) {
  return (
    <button type="button" aria-label={`Quick look at ${name}`} title="Quick look" onClick={(e) => { e.stopPropagation(); openQuickLook(slug); }} className={className ?? "relative z-10 ml-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 max-md:opacity-100 max-sm:size-11"}>
      <PanelRightOpen aria-hidden className="size-3.5" />
    </button>
  );
}
