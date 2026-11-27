"use client";
// Starting point, the Setup Guide's second step (spec 0052, ticket 6; GLOSSARY: Setup Guide, Pack, Preview, Sample Data,
// Metric Catalog): two clear choices. "Explore on my own" starts from scratch and opens the Metric Catalog with a way
// back here; "Start from a Pack" lists Ziffr's own Packs ranked for this Workspace, each with why it fits, what it
// brings and "Use this pack", which opens the guided set-up (spec 0068); a Pack with nothing to set up opens its Preview
// in the Slide-over and is added from it. Nothing is added or made without a click; the core checks every one again.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { isActionError, shown, unwrap, UNEXPECTED } from "@/lib/action-error";
import { installIncludedPackFile, readIncludedPackFile } from "@/app/pack-actions";
import { useOpenPackPreview } from "@/app/settings/packs/preview-view";
import { useAfterInstall } from "@/app/settings/packs/after-install";
import { packSetUpPath, setsUp } from "@/app/use-pack/paths";
import { chooseExplore, skipStep } from "./actions";
import { becauseText } from "@ziffr/core/pack-ranking";
import type { RecommendedPack } from "@ziffr/core/included-packs";
import type { NumberStyle } from "@ziffr/core/number-style";

const KIND: Record<RecommendedPack["brings"][number]["kind"], [string, string]> = {
  metric: ["Metric", "Metrics"], dashboard: ["Dashboard", "Dashboards"], deck: ["Deck", "Decks"], workflow: ["Workflow", "Workflows"],
  view: ["View Design", "View Designs"], recipe: ["Analysis Recipe", "Analysis Recipes"], theme: ["Theme", "Themes"],
};
const SHOWN_NAMES = 3;

/** What a Pack brings, one phrase per line: "13 Metrics, e.g. MRR, ARR, New MRR", "2 Workflows", "1 Dashboard". Counts and names from the Pack file only. */
export function whatYouGet(brings: RecommendedPack["brings"]): string[] {
  return brings.map((b) => {
    const label = `${b.count} ${KIND[b.kind][b.count === 1 ? 0 : 1]}`;
    if (b.kind !== "metric") return label;
    const names = b.names.slice(0, SHOWN_NAMES).join(", ");
    return `${label}, e.g. ${names}`;
  });
}

type Props = {
  packs: RecommendedPack[];
  /** "scratch" when Explore on my own was chosen, "pack" after a Pack, else null. */
  startingPoint: "scratch" | "pack" | null;
  /** How many Metrics the Workspace has already (archived ones included). */
  metrics: number;
  /** The guide's Metric, when the viewer may see it. */
  firstMetric: { id: number; name: string } | null;
  /** About you is not done yet, so answering it can still bring suggestions. */
  canAnswerAbout: boolean;
  /** The viewer's own Business Function from About you, in words, to name in the Pack card; null when not answered. */
  functionLabel?: string | null;
  /** Whether the viewer is an Owner (a Pack that holds a Theme is for Owners). */
  isOwner: boolean;
  viewer: string;
  numberStyle: NumberStyle;
  following: string;
  ticked: boolean;
};

/** The Starting point step. */
export function StartingPoint(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const answered = p.packs.some((x) => x.because.length > 0);
  const shown3 = p.packs.slice(0, 3);
  const rest = p.packs.slice(3);
  const list = all ? p.packs : shown3;

  const run = (work: () => Promise<unknown>, then: () => void) => start(async () => {
    setError(null);
    try {
      const r = await work();
      if (isActionError(r)) { setError(r.error); return; }
      then();
    } catch { setError(UNEXPECTED); }
  });

  return (
    <div className="space-y-6">
      {p.metrics > 0 && p.startingPoint !== "pack" && (
        <p role="status" className="rounded-[var(--radius-card)] border border-border bg-card p-4 text-sm">
          You have {p.metrics} Metric{p.metrics === 1 ? "" : "s"}. Start from a Pack anyway?
        </p>
      )}
      {p.firstMetric && (
        <p role="status" className="text-sm">Your first Metric: <strong className="font-medium">{p.firstMetric.name}</strong>.</p>
      )}

      <div>
        <h3 className="mb-3 text-base font-medium">How do you want to start?</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="stock flex flex-col rounded-[var(--radius-card)] p-4">
            <p className="font-medium">Explore on my own</p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">Pick or write your first Metric yourself.</p>
            <Button type="button" variant="outline" className="mt-3 h-11 w-full sm:h-9 sm:w-auto sm:self-start" disabled={pending} onClick={() => run(() => chooseExplore(), () => router.push("/metrics/new?setup=1"))}>
              Explore on my own
            </Button>
          </div>
          <div className="stock flex flex-col rounded-[var(--radius-card)] p-4">
            <p className="font-medium">Start from a Pack</p>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">Get ready-made Metrics{p.functionLabel ? ` for ${p.functionLabel}` : " for your kind of work"}.</p>
            <a href="#guide-packs" className={buttonVariants({ variant: "outline", className: "mt-3 h-11 w-full sm:h-9 sm:w-auto sm:self-start" })}>Choose a Pack</a>
          </div>
        </div>
        <p role="alert" className="mt-2 min-h-5 text-sm text-destructive">{error}</p>
      </div>

      <section id="guide-packs" aria-labelledby="guide-packs-heading" className="space-y-3">
        <h3 id="guide-packs-heading" className="text-base font-medium">{answered ? "Packs suggested for you" : "Ziffr’s own Packs"}</h3>
        {!answered && p.canAnswerAbout && (
          <p className="text-sm"><Link href="/setup?step=about" className="inline-flex min-h-11 items-center underline sm:min-h-0">Answer About you to get suggestions</Link></p>
        )}
        <ul className="space-y-3">
          {list.map((pack) => <PackRow key={pack.id} pack={pack} p={p} />)}
        </ul>
        {rest.length > 0 && (
          <Button type="button" variant="ghost" size="sm" aria-expanded={all} onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer" : `See all ${p.packs.length} Packs`}
          </Button>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        {p.ticked
          ? <Link href={`/setup?step=${p.following}`} className={buttonVariants()}>Go on</Link>
          : <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => skipStep("start"), () => router.push(`/setup?step=${p.following}`))}>Skip</Button>}
      </div>
    </div>
  );
}

/** One Pack: why it fits, what it brings, and the way to use it or add it; once added, the way to the Packs page. */
function PackRow({ pack, p }: { pack: RecommendedPack; p: Props }) {
  const openPreview = useOpenPackPreview();
  const added = useAfterInstall();
  const [pending, start] = useTransition();
  const blocked = pack.needsOwner && !p.isOwner;
  const sets = setsUp(pack.brings.map((b) => b.kind));

  // The same Preview as on the Packs page. For anyone but an Owner, a Pack with a Theme says why it cannot be added.
  const preview = () => start(async () => {
    try {
      const r = unwrap(await readIncludedPackFile(pack.id));
      if (!r.ok) throw new Error();
      openPreview({
        viewer: p.viewer, numberStyle: p.numberStyle,
        preview: blocked ? { ...r.preview, blocked: "This Pack holds a Theme, so an Owner adds it." } : r.preview,
        install: async ({ assistantTexts }) => added(unwrap(await installIncludedPackFile(pack.id, { assistantTexts })), r.preview),
      });
    } catch (e) { toast.error("Not opened", { description: shown(e) }); }
  });

  const gets = whatYouGet(pack.brings);
  return (
    <li className="stock rounded-[var(--radius-card)] p-4 text-sm">
      {/* Phone: title, reason, description, what you get, then full-width buttons; side by side only from the small breakpoint. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{pack.name} <span className="font-normal text-muted-foreground">· Pack</span></p>
          {pack.because.length > 0 && <p className="text-xs text-muted-foreground">Suggested because of {becauseText(pack.because, 3)}.</p>}
          <p className="mt-1 text-muted-foreground">{pack.summary}</p>
          <p className="mt-2 text-xs font-medium">What you get</p>
          <ul className="list-disc pl-4 text-xs text-muted-foreground">{gets.map((g) => <li key={g}>{g}</li>)}</ul>
          {blocked && <p className="mt-2 text-xs text-muted-foreground">Includes a Theme (a look for your Workspace); only an Owner can add this Pack.</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {pack.installed && <span className="text-xs text-muted-foreground">Added</span>}
          {pack.installed && <Link href="/settings/packs" className={buttonVariants({ size: "sm", variant: "outline", className: "h-11 sm:h-8" })}>See it in Packs<span className="sr-only">: {pack.name}</span></Link>}
          {/* The guided set-up draws its own frame, so it is loaded as a whole page; its first screen is the preview. */}
          {!pack.installed && sets && <a href={packSetUpPath(pack.id)} className={buttonVariants({ size: "sm", className: "h-11 sm:h-8" })}>Use this pack<span className="sr-only">: {pack.name}</span></a>}
          {!pack.installed && !sets && <Button type="button" size="sm" variant="outline" className="h-11 data-disabled:opacity-50 sm:h-8" disabled={pending} focusableWhenDisabled onClick={preview}>Preview</Button>}
        </div>
      </div>
    </li>
  );
}
