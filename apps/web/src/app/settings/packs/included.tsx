"use client";
// Ziffr's own Packs on the Packs page (spec 0052, ticket 4; GLOSSARY: Pack, Preview, Sample Data): the Packs that come
// with Ziffr, each with what it brings, a Preview drawn with Sample Data and Install. The browser names a Pack only by its
// id; the core looks it up in the list that comes with Ziffr, so no file and no Marketplace is needed.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { installIncludedPackFile, readIncludedPackFile, readIncludedUpdatePlan, updateIncludedPackFile } from "@/app/pack-actions";
import type { IncludedPackListing } from "@ziffr/core/included-packs";
import type { PackPreview } from "@ziffr/core/packs";
import type { NumberStyle } from "@ziffr/core/number-style";
import { PackUpdate } from "./marketplace";
import { PackPreviewCard } from "./screen";

const KIND: Record<IncludedPackListing["brings"][number]["kind"], [string, string]> = {
  metric: ["Metric", "Metrics"], dashboard: ["dashboard", "dashboards"], deck: ["deck", "decks"], workflow: ["Workflow", "Workflows"],
  view: ["View Design", "View Designs"], recipe: ["Analysis Recipe", "Analysis Recipes"], theme: ["Theme", "Themes"],
};

/** The list of Ziffr's own Packs: what each brings, Preview with Sample Data, and Install by a click. */
export function IncludedPacks({ packs, viewer, numberStyle }: { packs: IncludedPackListing[]; viewer: string; numberStyle: NumberStyle }) {
  const router = useRouter();
  const [open, setOpen] = useState<{ id: string; preview: PackPreview } | null>(null);
  const [okAssistant, setOkAssistant] = useState(false);
  const [pending, start] = useTransition();
  const run = (f: () => Promise<void>) => start(async () => { try { await f(); } catch (e) { toast.error("Not done", { description: shown(e) }); } });
  const preview = (id: string) => run(async () => {
    const res = unwrap(await readIncludedPackFile(id));
    if (!res.ok) throw new Error(`This Pack cannot be installed: ${res.problems[0]?.message ?? ""}`);
    setOkAssistant(false);
    setOpen({ id, preview: res.preview });
  });
  const install = () => run(async () => {
    unwrap(await installIncludedPackFile(open!.id, { assistantTexts: okAssistant }));
    toast.success(`${open!.preview.manifest.name} installed`, { description: "Its entries are in the Metric Catalog, its templates, designs and Themes where you start from them." });
    setOpen(null);
    router.refresh();
  });
  return (
    <section aria-labelledby="included-packs" className="space-y-3">
      <div>
        <h2 id="included-packs" className="text-sm font-medium">Ziffr&rsquo;s own Packs</h2>
        <p className="text-sm text-muted-foreground">They come with Ziffr: nothing is downloaded. See one drawn with Sample Data first; installing makes no Metric, sends nothing and changes nothing already here.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {packs.map((p) => (
          <li key={p.id} className="stock rounded-[var(--radius-card)] p-3 text-sm">
            <p className="font-medium">{p.name} <span className="fig text-xs text-muted-foreground">{p.version}</span></p>
            <p className="text-muted-foreground">{p.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">{p.brings.map((b) => `${b.count} ${KIND[b.kind][b.count === 1 ? 0 : 1]}`).join(", ")}</p>
            {p.needsOwner && <p className="text-xs text-muted-foreground">Holds a Theme: an Owner installs it.</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!p.installed && <Button size="sm" variant="outline" disabled={pending} onClick={() => preview(p.id)}>Preview with Sample Data</Button>}
              {p.installed && <span className="text-xs text-muted-foreground">Installed, version {p.installed.version}.</span>}
            </div>
          </li>
        ))}
      </ul>
      {open && <PackPreviewCard preview={open.preview} viewer={viewer} numberStyle={numberStyle} pending={pending} okUnsigned={false} setOkUnsigned={() => {}} okAssistant={okAssistant} setOkAssistant={setOkAssistant} onCancel={() => setOpen(null)} onInstall={install} />}
    </section>
  );
}

/** "Version … comes with this Ziffr" on an installed one of Ziffr's own Packs, and updating to it after seeing what changes. */
export function IncludedUpdate({ installId, name, version }: { installId: number; name: string; version: string }) {
  return <PackUpdate name={name} version={version} button={`Version ${version} comes with this Ziffr…`} from="One of Ziffr’s own Packs: it comes with this version of Ziffr." read={() => readIncludedUpdatePlan(installId)} apply={(c) => updateIncludedPackFile(installId, c)} />;
}
