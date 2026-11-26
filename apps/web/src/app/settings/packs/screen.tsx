"use client";
// The Packs page (spec 0030, GLOSSARY: Pack, Preview, Sample Data): installed Packs with what each added, and for
// Owners and Admins installing one from a file. Everything in a Pack is shown as text or drawn by Ziffr's own
// renderer with Sample Data; its only links are its listing's, shown as plain links that tell the site nothing.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { PackGuideView } from "@/components/pack-guide";
import { DashboardTemplatePreview, Preview } from "@/components/preview";
import { installPack, readPack } from "@/app/pack-actions";
import { sampleDesignWidget } from "@ziffr/core/design-files";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { PACK_LIMITS, UNSIGNED_WARNING as UNSIGNED } from "@ziffr/core/pack";
import type { InstalledPack, PackPreview, PackPreviewItem } from "@ziffr/core/packs";
import type { OfferedItem } from "@ziffr/core/pack-updates";
import { Offers, PackActions } from "./manage";
import { MarketplaceSearch, MarketplaceUpdate } from "./marketplace";
import { IncludedPacks, IncludedUpdate } from "./included";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { ExportOptions } from "@ziffr/core/pack-export";
import { Publisher } from "./pack-logo";
import { ExportPack } from "./export";
import { SetUpFromPack } from "./setup";
import type { Problem } from "@ziffr/core/json-check";
import type { IncludedPackListing } from "@ziffr/core/included-packs";

const KIND_LABEL: Record<PackPreviewItem["kind"], string> = { metric: "Metric Catalog entries", dashboard: "Dashboard Templates", deck: "Deck Templates", workflow: "Workflow Templates", view: "View Designs", theme: "Themes" };
const ORDER: PackPreviewItem["kind"][] = ["metric", "dashboard", "deck", "workflow", "view", "theme"];

/** A listing's address as a plain link: https only, and the site learns nothing of where the person came from. A
 * link of a Pack nobody signed names its host and says so, so it never passes for one of Ziffr's own. */
function ListingLink({ href, children, unsigned = false }: { href?: string; children: React.ReactNode; unsigned?: boolean }) {
  if (!href || !href.startsWith("https://")) return null;
  let host = "";
  try { host = new URL(href).host; } catch { return null; }
  return (
    <span>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline">{children}</a>
      {unsigned && <span className="text-muted-foreground"> ({host}, given by the Pack, not checked by the Marketplace)</span>}
    </span>
  );
}

export function PacksScreen({ installed, manages, exportable = null, authorName = "", offers = [], included = [], marketplace = false, updates = [], demo, guest, viewer, numberStyle }: { installed: (Omit<InstalledPack, "installedBy"> & { installedBy: string | null })[]; manages: boolean; exportable?: ExportOptions | null; authorName?: string; offers?: OfferedItem[]; included?: IncludedPackListing[]; marketplace?: boolean; updates?: { installId: number; version: string }[]; demo: boolean; guest: boolean; viewer: string; numberStyle: NumberStyle }) {
  return (
    <div className="space-y-8">
      {manages && <Offers offers={offers} />}
      <section aria-labelledby="installed-packs">
        <h2 id="installed-packs" className="mb-2 text-sm font-medium">Installed in this Workspace</h2>
        {guest ? <p className="text-sm text-muted-foreground">Guests do not see the Workspace&rsquo;s Packs.</p>
          : !installed.length ? <p className="text-sm text-muted-foreground">No Pack yet.{manages ? " Install one of Ziffr\u2019s own below, or from a file." : ""}</p>
            : (
              <ul className="space-y-3">
                {installed.map((p) => (
                  <li key={p.id} className="stock rounded-[var(--radius-card)] p-4 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="fig text-muted-foreground">{p.version}</span>
                      <span className="text-xs text-muted-foreground">{p.license}</span>
                    </div>
                    <div className="mt-2"><Publisher author={p.author} logo={p.logo} id={p.packId} signed={p.signed} fromMarketplace={p.source === "marketplace"} included={p.source === "included"} /></div>
                    <p className="mt-1 text-muted-foreground">{p.summary}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.source === "upload" && !p.signed ? `${UNSIGNED} ` : p.source === "included" ? "One of Ziffr\u2019s own Packs. " : "From the Marketplace. "}
                      Installed {new Date(p.installedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{p.installedBy ? ` by ${p.installedBy}` : ""}.
                    </p>
                    <p className="mt-1 flex gap-3 text-xs"><ListingLink href={p.listing.homepage} unsigned={!p.signed}>Its page</ListingLink><ListingLink href={p.listing.support} unsigned={!p.signed}>Help</ListingLink></p>
                    <AddedList added={p.added} />
                    {manages && <PackActions installId={p.id} name={p.name} />}
                    {manages && included.filter((i) => i.installed?.installId === p.id && i.update).map((i) => <div key={i.update} className="mt-2"><IncludedUpdate installId={p.id} name={p.name} version={i.update!} /></div>)}
                    {updates.filter((u) => u.installId === p.id).map((u) => <div key={u.version} className="mt-2"><MarketplaceUpdate installId={p.id} name={p.name} version={u.version} /></div>)}
                    {manages && <SetUpFromPack installId={p.id} viewer={viewer} />}
                  </li>
                ))}
              </ul>
            )}
      </section>
      {manages && included.length > 0 && <IncludedPacks packs={included} viewer={viewer} numberStyle={numberStyle} />}
      {marketplace && <MarketplaceSearch viewer={viewer} numberStyle={numberStyle} />}
      {manages && <InstallFromFile viewer={viewer} numberStyle={numberStyle} />}
      {exportable && <ExportPack options={exportable} defaultAuthor={authorName} />}
      {demo && <p className="text-sm text-muted-foreground">The demo installs no Packs: the Workspace is shared by everyone looking at it.</p>}
    </div>
  );
}

function AddedList({ added }: { added: InstalledPack["added"] }) {
  const by = ORDER.map((k) => [k, added.filter((a) => a.kind === k).map((a) => a.name)] as const).filter(([, names]) => names.length);
  if (!by.length) return <p className="mt-2 text-xs text-muted-foreground">Nothing it added is left as it was installed.</p>;
  return (
    <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[11rem_minmax(0,1fr)]">
      {by.map(([k, names]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{KIND_LABEL[k]}</dt>
          <dd>{names.join(", ")}</dd>
        </div>
      ))}
    </dl>
  );
}

function InstallFromFile({ viewer, numberStyle }: { viewer: string; numberStyle: NumberStyle }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [preview, setPreview] = useState<PackPreview | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [okUnsigned, setOkUnsigned] = useState(false);
  const [okAssistant, setOkAssistant] = useState(false);
  const [pending, start] = useTransition();
  const reset = () => { setText(null); setPreview(null); setProblems([]); setOkUnsigned(false); setOkAssistant(false); if (input.current) input.current.value = ""; };
  const read = (f: File | undefined) => {
    // The same file chosen again, once fixed, is read again.
    if (input.current) input.current.value = "";
    if (!f) return;
    if (f.size > PACK_LIMITS.bytes) { reset(); setProblems([{ path: "", line: null, message: `The file is ${f.size.toLocaleString("en")} bytes; at most ${PACK_LIMITS.bytes.toLocaleString("en")} are allowed.` }]); return; }
    start(async () => {
      try {
        const t = await f.text();
        const res = unwrap(await readPack(t));
        setOkUnsigned(false); setOkAssistant(false);
        if (res.ok) { setText(t); setPreview(res.preview); setProblems([]); } else { setText(null); setPreview(null); setProblems(res.problems); }
      } catch (e) {
        toast.error("The file could not be read", { description: shown(e) });
      }
    });
  };
  const install = () => start(async () => {
    try {
      unwrap(await installPack(text!, { unsigned: okUnsigned, assistantTexts: okAssistant }));
      toast.success(`${preview!.manifest.name} installed`, { description: "Its entries are in the Metric Catalog, its templates, designs and Themes where you start from them." });
      reset();
      router.refresh();
    } catch (e) {
      toast.error("Not installed", { description: shown(e) });
    }
  });
  return (
    <section aria-labelledby="install-pack" className="space-y-4">
      <div>
        <h2 id="install-pack" className="text-sm font-medium">Install a Pack from a file</h2>
        <p className="text-sm text-muted-foreground">Ziffr checks the whole file first and shows everything it adds. Installing makes no Metric, sends nothing and changes nothing already here.</p>
      </div>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
      <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}><Upload aria-hidden /> Choose a Pack file…</Button>
      {problems.length > 0 && (
        <div role="alert" className="rounded-[var(--radius-input)] border border-destructive/40 p-3 text-sm">
          <p className="font-medium">This file is not a Pack Ziffr can install:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{problems.map((p, i) => <li key={i}>{p.line ? `Line ${p.line}: ` : ""}{p.path ? <code>{p.path}</code> : null} {p.message}</li>)}</ul>
        </div>
      )}
      {preview && <PackPreviewCard preview={preview} viewer={viewer} numberStyle={numberStyle} pending={pending} okUnsigned={okUnsigned} setOkUnsigned={setOkUnsigned} okAssistant={okAssistant} setOkAssistant={setOkAssistant} onCancel={reset} onInstall={install} />}
    </section>
  );
}

/** A Pack before it is installed: its manifest, where it came from, words aimed at assistants, every item, and what to
 * confirm. A file from the Marketplace whose signature held needs no warning about where it came from. */
export function PackPreviewCard({ preview, viewer, numberStyle, pending, okUnsigned, setOkUnsigned, okAssistant, setOkAssistant, onCancel, onInstall }: {
  preview: PackPreview; viewer: string; numberStyle: NumberStyle; pending: boolean;
  okUnsigned: boolean; setOkUnsigned: (v: boolean) => void; okAssistant: boolean; setOkAssistant: (v: boolean) => void; onCancel: () => void; onInstall: () => void;
}) {
  const ready = !preview.blocked && (okUnsigned || !preview.unsigned) && (okAssistant || !preview.assistantTexts.length);
  // The card appears below a list that can be long: bring its top, with the name and the guide, into view.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.scrollIntoView?.({ block: "start" }); }, [preview.manifest.id]);
  return (
    <div ref={top} className="stock scroll-mt-16 space-y-4 rounded-[var(--radius-card)] p-4 text-sm">
      <div>
        <p className="flex items-center gap-2 text-base font-medium"><Package aria-hidden className="size-4" /> {preview.manifest.name} <span className="fig text-sm font-normal text-muted-foreground">{preview.manifest.version}</span></p>
        <p className="text-muted-foreground">{preview.manifest.summary}</p>
        <div className="mt-2"><Publisher author={preview.manifest.author.name} logo={preview.logo} id={preview.manifest.id} signed={!preview.unsigned} fromMarketplace={preview.source === "marketplace"} included={preview.source === "included"} /></div>
        <p className="mt-1 text-xs text-muted-foreground">Under {preview.manifest.license}. <ListingLink href={preview.manifest.listing?.homepage} unsigned={preview.unsigned}>Its page</ListingLink></p>
      </div>
      {preview.unsigned
        ? <p className="flex items-start gap-2 rounded-[var(--radius-input)] bg-muted p-2.5"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {UNSIGNED}</p>
        : <p className="rounded-[var(--radius-input)] bg-muted p-2.5">{preview.source === "included" ? "One of Ziffr\u2019s own Packs: it comes with this version of Ziffr. Ziffr checked the whole file as well." : "From the Marketplace: its signature holds. Ziffr checked the whole file as well."}</p>}
      {preview.assistantTexts.length > 0 && (
        <div className="rounded-[var(--radius-input)] border border-input p-2.5">
          <p className="font-medium">Words aimed at AI assistants</p>
          <p className="text-xs text-muted-foreground">These texts read like instructions to an assistant. Assistants connected to this Workspace read Metric descriptions; they can do only what their key allows, but read these before you install.</p>
          <ul className="mt-1 space-y-1 text-xs">{preview.assistantTexts.map((t) => <li key={t.path}><code>{t.path}</code>: &ldquo;{t.text}&rdquo;</li>)}</ul>
        </div>
      )}
      {preview.manifest.guide && <PackGuideView guide={preview.manifest.guide} author={preview.manifest.author.name} />}
      <PackItems items={preview.items} viewer={viewer} numberStyle={numberStyle} />
      {preview.blocked ? <p role="alert" className="font-medium">{preview.blocked}</p> : (
        <div className="space-y-2">
          {preview.unsigned && <label className="flex items-start gap-2"><input type="checkbox" checked={okUnsigned} onChange={(e) => setOkUnsigned(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> I install a file the Marketplace did not check.</label>}
          {preview.assistantTexts.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" checked={okAssistant} onChange={(e) => setOkAssistant(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> I read the words aimed at assistants.</label>}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button disabled={!ready || pending} onClick={onInstall}>Install {preview.items.length} item{preview.items.length === 1 ? "" : "s"}</Button>
      </div>
    </div>
  );
}

/** Every item of a Pack before it is installed: templates and designs drawn with Sample Data, the rest as text. */
function PackItems({ items, viewer, numberStyle }: { items: PackPreviewItem[]; viewer: string; numberStyle: NumberStyle }) {
  const data = useMemo(() => sampleCanvasData(viewer, numberStyle), [viewer, numberStyle]);
  return (
    <div className="space-y-4">
      {ORDER.map((kind) => {
        const of = items.filter((i) => i.kind === kind);
        if (!of.length) return null;
        return (
          <div key={kind}>
            <h3 className="mb-1.5 text-xs font-medium">{KIND_LABEL[kind]} <span className="fig text-muted-foreground">{of.length}</span></h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {of.map((i) => (
                <li key={i.key} className="rounded-[var(--radius-input)] border border-input p-2.5">
                  {i.kind === "dashboard" && <div className="mb-2 overflow-hidden rounded bg-[var(--color-paper-2)] p-1.5"><DashboardTemplatePreview template={i} viewer={viewer} numberStyle={numberStyle} width={300} /></div>}
                  {i.kind === "view" && <div className="mb-2"><Preview widget={sampleDesignWidget(i.body)} data={data} size={i.body.size} width={300} sample /></div>}
                  {i.kind === "theme" && <div className="mb-2 flex gap-1" aria-hidden>{[i.tokens.canvas, i.tokens.surface, i.tokens.ink, i.tokens.accent, ...i.tokens.data].map((c, k) => <span key={k} className="size-5 rounded-sm border border-input" style={{ background: /^#[0-9a-fA-F]{6}$/.test(c) ? c : "transparent" }} />)}</div>}
                  <p className="font-medium">{i.name}</p>
                  {"description" in i && i.description && <p className="text-xs text-muted-foreground">{i.description}</p>}
                  <p className="text-xs text-muted-foreground">{detail(i)}</p>
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
    case "metric": return `${i.derived ? "A Derived Metric, " : ""}by ${i.period}${i.unit ? `, in ${i.unit}` : ""}`;
    case "dashboard": return `${i.body.widgets.length} widgets, ${i.slots.length} Slot${i.slots.length === 1 ? "" : "s"}`;
    case "deck": return `${i.slides} slide${i.slides === 1 ? "" : "s"}, ${i.slots.length} Slot${i.slots.length === 1 ? "" : "s"}`;
    case "workflow": return `Due ${i.body.dueWorkingDays} working days after the period, ${i.body.steps.length} steps`;
    case "view": return `A View Design of ${i.body.slots.length} Slot${i.body.slots.length === 1 ? "" : "s"}`;
    case "theme": return i.logo ? "A Theme: colours, fonts and slides, with the Pack\u2019s logo" : "A Theme: colours, fonts and slides, no logo";
  }
};
