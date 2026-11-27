"use client";
// The Packs page (spec 0030, GLOSSARY: Pack, Preview, Sample Data): installed Packs with what each added, and for
// Owners and Admins adding one from a file, after its Preview (preview-view.tsx). Everything in a Pack is shown
// as text; its only links are its listing's, shown as plain links that tell the site nothing.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { PackGuideButton } from "@/components/pack-guide-help";
import { useAfterInstall } from "./after-install";
import { setsUp } from "@/app/use-pack/paths";
import { installPack, readPack } from "@/app/pack-actions";
import { PACK_LIMITS, UNSIGNED_WARNING as UNSIGNED } from "@ziffr/core/pack";
import type { InstalledPack } from "@ziffr/core/packs";
import type { OfferedItem } from "@ziffr/core/pack-updates";
import { Offers, PackActions } from "./manage";
import { MarketplaceSearch, MarketplaceUpdate } from "./marketplace";
import { IncludedPacks, IncludedUpdate } from "./included";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { ExportOptions } from "@ziffr/core/pack-export";
import { Publisher } from "./pack-logo";
import { PackPeopleList } from "./pack-people";
import { ExportPack } from "./export";
import { AddLine, SetUpFromPack } from "./setup";
import { AfterSetUp } from "./after-set-up";
import type { PackCard } from "@ziffr/core/pack-after-card";
import { FillMadeUp } from "./fill-made-up";
import { KIND_LABEL, ListingLink, ORDER, ReportLink, useOpenPackPreview } from "./preview-view";
import type { Problem } from "@ziffr/core/json-check";
import type { IncludedPackListing } from "@ziffr/core/included-packs";

export function PacksScreen({ installed, manages, exportable = null, authorName = "", offers = [], included = [], marketplace = false, updates = [], reports = [], withdrawn = [], demo, guest, viewer, numberStyle, practice = false, after = [] }: { installed: (Omit<InstalledPack, "installedBy"> & { installedBy: string | null })[]; manages: boolean; exportable?: ExportOptions | null; authorName?: string; offers?: OfferedItem[]; included?: IncludedPackListing[]; marketplace?: boolean; updates?: { installId: number; version: string }[]; reports?: { installId: number; address: string }[]; withdrawn?: { installId: number; reason: string }[]; demo: boolean; guest: boolean; viewer: string; numberStyle: NumberStyle; /** The viewer's own Practice Workspace (spec 0063). */ practice?: boolean; /** The ways after a Pack's set-up (spec 0068), for Owners and Admins. */ after?: PackCard[] }) {
  return (
    <div className="space-y-8">
      {manages && <Offers offers={offers} />}
      <section aria-labelledby="installed-packs">
        <h2 id="installed-packs" className="mb-2 text-sm font-medium">Installed in this Workspace</h2>
        {guest ? <p className="text-sm text-muted-foreground">Guests do not see the Workspace&rsquo;s Packs.</p>
          : !installed.length ? <p className="text-sm text-muted-foreground">No Pack yet.{manages ? " Use one of Ziffr\u2019s own below, or one from a file." : ""}</p>
            : (
              <ul className="space-y-3">
                {installed.map((p) => (
                  <li key={p.id} className="stock rounded-[var(--radius-card)] p-4 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{p.name}</span>
                      <span className="fig text-muted-foreground">{p.version}</span>
                      <span className="text-xs text-muted-foreground">{p.license}</span>
                    </div>
                    <div className="mt-2"><Publisher author={p.author} logo={p.logo} id={p.packId} signed={p.signed} fromMarketplace={p.source === "marketplace"} included={p.source === "included"} reviewed={p.reviewed} /></div>
                    <p className="mt-1 text-muted-foreground">{p.summary}</p>
                    {withdrawn.filter((w) => w.installId === p.id).map((w) => (
                      <p key={w.installId} className="mt-2 flex items-start gap-2 rounded-[var(--radius-input)] border border-destructive/40 p-2.5"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> <span className="min-w-0 break-words"><span className="font-medium">Withdrawn from the Marketplace:</span> {w.reason} What you installed stays as it is.</span></p>
                    ))}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.source === "upload" && !p.signed ? `${UNSIGNED} ` : p.source === "included" ? "One of Ziffr\u2019s own Packs. " : "From the Marketplace. "}
                      Installed {new Date(p.installedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{p.installedBy ? ` by ${p.installedBy}` : ""}.
                    </p>
                    <p className="mt-1 flex gap-3 text-xs"><ListingLink href={p.listing.homepage} unsigned={!p.signed}>Its page</ListingLink><ListingLink href={p.listing.support} unsigned={!p.signed}>Help</ListingLink></p>
                    <AddedList added={p.added} />
                    {p.help && <div className="mt-2"><PackGuideButton installId={p.id} name={p.name} guide={p.help === "guide"} /></div>}
                    {p.people && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium">Who does what</summary>
                        <div className="mt-2"><PackPeopleList people={p.people} /></div>
                      </details>
                    )}
                    {manages && <PackActions installId={p.id} name={p.name} />}
                    {manages && included.filter((i) => i.installed?.installId === p.id && i.update).map((i) => <div key={i.update} className="mt-2"><IncludedUpdate installId={p.id} name={p.name} version={i.update!} /></div>)}
                    {updates.filter((u) => u.installId === p.id).map((u) => <div key={u.version} className="mt-2"><MarketplaceUpdate installId={p.id} name={p.name} version={u.version} /></div>)}
                    {manages && <AfterSetUp installId={p.id} name={p.name} sets={setsUp(p.added.map((a) => a.kind))} card={after.find((c) => c.installId === p.id) ?? null} />}
                    {manages && (
                      <div className="flex flex-wrap items-start gap-x-2">
                        <div className="max-w-full has-[>div]:w-full"><SetUpFromPack installId={p.id} viewer={viewer} practice={practice} /></div>
                        {p.addable.map((r) => <div key={r.repeat} className="max-w-full has-[>div]:w-full"><AddLine installId={p.id} repeat={r.repeat} name={r.name} viewer={viewer} practice={practice} /></div>)}
                      </div>
                    )}
                    {practice && <FillMadeUp installId={p.id} />}
                    {reports.filter((r) => r.installId === p.id).map((r) => <p key={r.installId} className="mt-2"><ReportLink href={r.address} name={p.name} /></p>)}
                  </li>
                ))}
              </ul>
            )}
      </section>
      {manages && included.length > 0 && <IncludedPacks packs={included} viewer={viewer} numberStyle={numberStyle} />}
      {marketplace && <MarketplaceSearch installed={installed.map((p) => ({ packId: p.packId, version: p.version }))} viewer={viewer} numberStyle={numberStyle} />}
      {manages && <InstallFromFile viewer={viewer} numberStyle={numberStyle} />}
      {exportable && <ExportPack options={exportable} defaultAuthor={authorName} viewer={viewer} numberStyle={numberStyle} />}
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
  const added = useAfterInstall();
  const openPreview = useOpenPackPreview();
  const input = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [pending, start] = useTransition();
  const read = (f: File | undefined) => {
    // The same file chosen again, once fixed, is read again.
    if (input.current) input.current.value = "";
    if (!f) return;
    if (f.size > PACK_LIMITS.bytes) { setProblems([{ path: "", line: null, message: `The file is ${f.size.toLocaleString("en")} bytes; at most ${PACK_LIMITS.bytes.toLocaleString("en")} are allowed.` }]); return; }
    start(async () => {
      try {
        const text = await f.text();
        const res = unwrap(await readPack(text));
        setProblems(res.ok ? [] : res.problems);
        if (!res.ok) return;
        openPreview({
          preview: res.preview, viewer, numberStyle,
          install: async (confirmed) => {
            added(unwrap(await installPack(text, confirmed)), res.preview);
          },
        });
      } catch (e) {
        toast.error("The file could not be read", { description: shown(e) });
      }
    });
  };
  return (
    <section aria-labelledby="install-pack" className="space-y-4">
      <div>
        <h2 id="install-pack" className="text-sm font-medium">Add a Pack from a file</h2>
        <p className="text-sm text-muted-foreground">Ziffr checks the whole file first and shows everything it adds. Nothing is made or sent before you confirm.</p>
      </div>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
      <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}><Upload aria-hidden /> Choose a Pack file…</Button>
      {problems.length > 0 && (
        <div role="alert" className="rounded-[var(--radius-input)] border border-destructive/40 p-3 text-sm">
          <p className="font-medium">This file is not a Pack Ziffr can install:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{problems.map((p, i) => <li key={i}>{p.line ? `Line ${p.line}: ` : ""}{p.path ? <code>{p.path}</code> : null} {p.message}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
