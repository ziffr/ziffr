"use client";
// A Pack's Preview (specs 0030, 0058 and 0068; GLOSSARY: Pack, Preview, Sample Data, Slide-over): a view of its own,
// opened over the list it came from, for a file, one of Ziffr's own Packs and a Pack from the Marketplace, on the Packs
// page and in the Setup Guide, and the first screen of a guided set-up, where "Use this pack" takes Install's place.
// In this order: name and one sentence, the dashboard drawn with Sample Data, Install with everything to confirm first,
// the guide closed behind "How it works", then what the Pack brings.
// Everything in a Pack is shown as text or drawn by Ziffr's own renderer; its only links are its listing's, shown as
// plain links that tell the site nothing. The button only asks: the core checks the file, who installs and every
// confirmation again.
import { CALCULATION_NOTE_LABEL } from "@ziffr/core/calculation-note";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Flag, Package, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { shown } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { hasPackGuide, PackGuideView } from "@/components/pack-guide";
import { PackNumbersView } from "@/components/pack-numbers";
import { DashboardTemplatePreview, Preview } from "@/components/preview";
import { useSlideOver } from "@/components/slide-over-host";
import { useBoxSize } from "@/views/use-box-size";
import { packSample } from "@ziffr/core/pack-sample";
import { sampleDesignWidget } from "@ziffr/core/design-files";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { UNSIGNED_WARNING as UNSIGNED } from "@ziffr/core/pack";
import type { PackPreview, PackPreviewItem } from "@ziffr/core/packs";
import type { NumberStyle } from "@ziffr/core/number-style";
import { Publisher } from "./pack-logo";
import { PackPeopleList } from "./pack-people";

/** What each kind of item in a Pack is called. */
export const KIND_LABEL: Record<PackPreviewItem["kind"], string> = { metric: "Metric Catalog entries", dashboard: "Dashboard Templates", deck: "Deck Templates", workflow: "Workflow Templates", view: "View Designs", theme: "Themes" };
/** The order the kinds are listed in. */
export const ORDER: PackPreviewItem["kind"][] = ["metric", "dashboard", "deck", "workflow", "view", "theme"];

// Narrower than this, a whole dashboard drawn to scale cannot be read: its first widgets are shown one below the other.
const SCALED_FROM = 520;
const STACKED_WIDGETS = 3;
// The width of a drawing in the list of items, and what its card takes of the room around it.
const ITEM_WIDTH = 300;
const ITEM_FRAME = 34;

/** What the person ticked before pressing Install. */
type PackConfirmed = { unsigned: boolean; assistantTexts: boolean };

/** What a guided set-up puts into the Preview in place of its own parts. */
export type PackUse = {
  /** What is drawn instead of the first Dashboard Template, and that template's key when it draws one. */
  drawing: React.ReactNode; drawn?: string;
  /** "Use this pack" and what stands with it, in place of Install and its confirmations. */
  actions: React.ReactNode;
};

type ViewProps = { preview: PackPreview; viewer: string; numberStyle: NumberStyle };
type InstallProps = ViewProps & {
  /** Installs the Pack and says so; throws when it is not installed, and the view then stays open. */
  install: (confirmed: PackConfirmed) => Promise<void>;
};

// Each opening is a view of its own: a tick given for one Preview never carries over to the next.
let openings = 0;

/** Opens a Pack's Preview in the side panel, over the list; `title` and `description` replace the panel's usual ones. */
export function useOpenPackPreview(): (view: InstallProps & { title?: string; description?: string }) => void {
  const panel = useSlideOver();
  return ({ title = "Preview", description = "Drawn with Sample Data. Nothing is installed until you press Install.", ...view }) =>
    panel.open({ title, description, wide: true, content: <PackPreviewView key={++openings} {...view} /> });
}

/** A Pack before it is installed, as the side panel shows it. A file from the Marketplace whose signature held needs no
 * warning about where it came from. */
export function PackPreviewView({ preview, viewer, numberStyle, install, use }: ViewProps & ({ install: InstallProps["install"]; use?: never } | { use: PackUse; install?: never })) {
  const panel = useSlideOver();
  const [okUnsigned, setOkUnsigned] = useState(false);
  const [okAssistant, setOkAssistant] = useState(false);
  const [pending, start] = useTransition();
  const [box, { w }] = useBoxSize<HTMLDivElement>();
  const own = useMemo(() => packSample(preview.sample.pack, preview.sample.metrics), [preview.sample]);
  const dashboard = preview.items.find((i) => i.kind === "dashboard");
  const ready = !preview.blocked && (okUnsigned || !preview.unsigned) && (okAssistant || !preview.assistantTexts.length);
  const press = () => start(async () => {
    const view = box.current;
    try {
      await install!({ unsigned: okUnsigned, assistantTexts: okAssistant });
      // Only this view goes back: one the person has left meanwhile must not close what they opened since.
      if (view?.isConnected) panel.back();
    } catch (e) {
      toast.error("Not installed", { description: shown(e) });
    }
  });
  const { manifest } = preview;
  return (
    <div ref={box} className="phone-fields @container space-y-4 pb-2 text-sm">
      <div className="break-words">
        {/* A guided set-up names the Pack in its own heading, above. */}
        {!use && (
          <>
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold"><Package aria-hidden className="size-4 shrink-0" /> {manifest.name} <span className="fig text-sm font-normal text-muted-foreground">{manifest.version}</span></h3>
            <p className="mb-2 text-muted-foreground">{manifest.summary}</p>
          </>
        )}
        <Publisher author={manifest.author.name} logo={preview.logo} id={manifest.id} signed={!preview.unsigned} fromMarketplace={preview.source === "marketplace"} included={preview.source === "included"} reviewed={preview.reviewed} />
      </div>
      {use ? use.drawing : dashboard && (
        <figure className="space-y-1.5">
          <figcaption className="text-xs text-muted-foreground">The dashboard &ldquo;{dashboard.name}&rdquo;, drawn with Sample Data.</figcaption>
          <DashboardTemplatePreview template={dashboard} viewer={viewer} numberStyle={numberStyle} width={w || undefined} pack={own} stacked={w > 0 && w < SCALED_FROM ? STACKED_WIDGETS : undefined} />
        </figure>
      )}
      {use?.actions}
      <div className="space-y-3 break-words">
        {preview.unsigned
          ? <p className="flex items-start gap-2 rounded-[var(--radius-input)] bg-muted p-2.5"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {UNSIGNED}</p>
          // A guided set-up has said above who publishes it; a warning is the one thing it repeats.
          : !use && <p className="rounded-[var(--radius-input)] bg-muted p-2.5">{preview.source === "included" ? "One of Ziffr’s own Packs: it comes with this version of Ziffr. Ziffr checked the whole file as well." : "From the Marketplace: its signature holds. Ziffr checked the whole file as well."}</p>}
        {!use && preview.assistantTexts.length > 0 && (
          <div className="rounded-[var(--radius-input)] border border-input p-2.5">
            <p className="font-medium">Words aimed at AI assistants</p>
            <p className="text-xs text-muted-foreground">These texts read like instructions to an assistant. Assistants connected to this Workspace read Metric descriptions; they can do only what their key allows, but read these before you install.</p>
            <ul className="mt-1 space-y-1 text-xs">{preview.assistantTexts.map((t) => <li key={t.path}><code>{t.path}</code>: &ldquo;{t.text}&rdquo;</li>)}</ul>
          </div>
        )}
        {!use && (
          <>
            {preview.blocked ? <p role="alert" className="font-medium">{preview.blocked}</p> : (
              <div className="space-y-2">
                {preview.unsigned && <label className="flex items-start gap-2"><input type="checkbox" checked={okUnsigned} onChange={(e) => setOkUnsigned(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> I install a file the Marketplace did not check.</label>}
                {preview.assistantTexts.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" checked={okAssistant} onChange={(e) => setOkAssistant(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> I read the words aimed at assistants.</label>}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={panel.back}><ArrowLeft aria-hidden /> Back to the list</Button>
              <Button disabled={!ready || pending} onClick={press}>Install</Button>
            </div>
          </>
        )}
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground max-md:[&_a]:inline-flex max-md:[&_a]:min-h-11 max-md:[&_a]:min-w-11 max-md:[&_a]:items-center">
          <span>Under {manifest.license}.</span>
          <ListingLink href={manifest.listing?.homepage} unsigned={preview.unsigned}>Its page</ListingLink>
          {preview.report && <ReportLink href={preview.report} name={manifest.name} />}
        </p>
      </div>
      {manifest.guide && hasPackGuide(manifest.guide) && (
        <details className="break-words">
          <summary className="cursor-pointer py-3 font-medium">How it works</summary>
          <PackGuideView guide={manifest.guide} author={manifest.author.name} />
        </details>
      )}
      <Brings closed={Boolean(use)} count={preview.items.length}>
        <PackNumbersView overview={preview.overview} />
        {preview.people && <PackPeopleList people={preview.people} />}
        <PackItems items={preview.items} drawn={use ? use.drawn : dashboard?.key} pack={own} viewer={viewer} numberStyle={numberStyle} width={w ? Math.min(ITEM_WIDTH, w - ITEM_FRAME) : ITEM_WIDTH} />
      </Brings>
    </div>
  );
}

/** What the Pack brings: open on the Preview, closed behind its heading in a guided set-up, which is about the few
 * questions. */
function Brings({ closed, count, children }: { closed: boolean; count: number; children: React.ReactNode }) {
  const heading = <>What it brings <span className="fig font-normal text-muted-foreground">{count} item{count === 1 ? "" : "s"}</span></>;
  if (closed) {
    return (
      <details className="border-t border-border">
        <summary className="cursor-pointer py-3 font-medium">{heading}</summary>
        <div className="space-y-4">{children}</div>
      </details>
    );
  }
  return (
    <section aria-label="What it brings" className="space-y-4 border-t border-border pt-4">
      <h3 className="font-semibold">{heading}</h3>
      {children}
    </section>
  );
}

/** "Report this Pack": opens the Marketplace's report form in a new tab, which learns nothing of where the person came
 * from; Ziffr's server sends nothing. The address is built by the core from checked parts. */
export function ReportLink({ href, name }: { href: string; name: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Report this Pack, ${name}, on the Marketplace (opens a new tab)`} className="inline-flex min-h-9 items-center gap-1 text-xs underline max-md:min-h-11">
      <Flag aria-hidden className="size-3" /> Report this Pack
    </a>
  );
}

/** A listing's address as a plain link: https only, and the site learns nothing of where the person came from. A
 * link of a Pack nobody signed names its host and says so, so it never passes for one of Ziffr's own. */
export function ListingLink({ href, children, unsigned = false }: { href?: string; children: React.ReactNode; unsigned?: boolean }) {
  if (!href || !href.startsWith("https://")) return null;
  let host = "";
  try { host = new URL(href).host; } catch { return null; }
  return (
    <span>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex min-h-11 min-w-11 items-center underline sm:min-h-0 sm:min-w-0">{children}</a>
      {unsigned && <span className="text-muted-foreground"> ({host}, given by the Pack, not checked by the Marketplace)</span>}
    </span>
  );
}

/** Every item of a Pack before it is installed: templates and designs drawn with Sample Data, the rest as text. The
 * dashboard already `drawn` above is only named. */
function PackItems({ items, drawn, pack, viewer, numberStyle, width }: { items: PackPreviewItem[]; drawn?: string; pack: ReturnType<typeof packSample>; viewer: string; numberStyle: NumberStyle; width: number }) {
  const data = useMemo(() => sampleCanvasData(viewer, numberStyle), [viewer, numberStyle]);
  return (
    <div className="space-y-4">
      {ORDER.map((kind) => {
        const of = items.filter((i) => i.kind === kind);
        if (!of.length) return null;
        return (
          <div key={kind}>
            <h4 className="mb-1.5 text-xs font-medium">{KIND_LABEL[kind]} <span className="fig text-muted-foreground">{of.length}</span></h4>
            <ul className="grid gap-3 @2xl:grid-cols-2">
              {of.map((i) => (
                <li key={i.key} className="min-w-0 rounded-[var(--radius-input)] border border-input p-2.5">
                  {i.kind === "dashboard" && i.key !== drawn && <div className="mb-2 overflow-hidden rounded bg-[var(--color-paper-2)] p-1.5"><DashboardTemplatePreview template={i} viewer={viewer} numberStyle={numberStyle} width={width - 12} pack={pack} /></div>}
                  {i.kind === "view" && <div className="mb-2"><Preview widget={sampleDesignWidget(i.body)} data={data} size={i.body.size} width={width} sample /></div>}
                  {i.kind === "theme" && <div className="mb-2 flex gap-1" aria-hidden>{[i.tokens.canvas, i.tokens.surface, i.tokens.ink, i.tokens.accent, ...i.tokens.data].map((c, k) => <span key={k} className="size-5 rounded-sm border border-input" style={{ background: /^#[0-9a-fA-F]{6}$/.test(c) ? c : "transparent" }} />)}</div>}
                  <div className="break-words">
                    <p className="font-medium">{i.name}</p>
                    {"description" in i && i.description && <p className="text-xs text-muted-foreground">{i.description}</p>}
                    {i.kind === "metric" && i.calculationNote && <p className="text-xs text-muted-foreground"><span className="font-medium">{CALCULATION_NOTE_LABEL}:</span> {i.calculationNote}</p>}
                    <p className="text-xs text-muted-foreground">{detail(i)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

const detail = (i: PackPreviewItem): string => {
  switch (i.kind) {
    case "metric": return `${i.total ? "A Total, " : i.derived ? "A Derived Metric, " : ""}by ${i.period}${i.unit ? `, in ${i.unit}` : ""}`;
    case "dashboard": return `${i.body.widgets.length} widgets, ${i.slots.length} Slot${i.slots.length === 1 ? "" : "s"}`;
    case "deck": return `${i.slides} slide${i.slides === 1 ? "" : "s"}, ${i.slots.length} Slot${i.slots.length === 1 ? "" : "s"}`;
    case "workflow": return `Due ${i.body.dueWorkingDays} working days after the period, ${i.body.steps.length} steps`;
    case "view": return `A View Design of ${i.body.slots.length} Slot${i.body.slots.length === 1 ? "" : "s"}`;
    case "theme": return i.logo ? "A Theme: colours, fonts and slides, with the Pack’s logo" : "A Theme: colours, fonts and slides, no logo";
  }
};
