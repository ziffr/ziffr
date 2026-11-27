"use client";
// Ziffr's own Packs on the Packs page (spec 0052, ticket 4; GLOSSARY: Pack, Preview, Sample Data): the Packs that come
// with Ziffr, each with what it brings and "Use this pack", which opens the guided set-up at its preview (spec 0068).
// A Pack with nothing to set up opens its Preview here and is added from it. The browser names a Pack only by its
// id; the core looks it up in the list that comes with Ziffr, so no file and no Marketplace is needed.
import { useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { installIncludedPackFile, readIncludedPackFile, readIncludedUpdatePlan, updateIncludedPackFile } from "@/app/pack-actions";
import type { IncludedPackListing } from "@ziffr/core/included-packs";
import type { NumberStyle } from "@ziffr/core/number-style";
import { PackUpdate } from "./marketplace";
import { useOpenPackPreview } from "./preview-view";
import { useAfterInstall } from "./after-install";
import { PHONE_LINK_BUTTON } from "@/app/setup/phone";
import { packSetUpPath, setsUp } from "@/app/use-pack/paths";

const KIND: Record<IncludedPackListing["brings"][number]["kind"], [string, string]> = {
  metric: ["Metric", "Metrics"], dashboard: ["dashboard", "dashboards"], deck: ["deck", "decks"], workflow: ["Workflow", "Workflows"],
  view: ["View Design", "View Designs"], recipe: ["Analysis Recipe", "Analysis Recipes"], theme: ["Theme", "Themes"],
};

/** The list of Ziffr's own Packs: what each brings, and the way to use it or add it. */
export function IncludedPacks({ packs, viewer, numberStyle }: { packs: IncludedPackListing[]; viewer: string; numberStyle: NumberStyle }) {
  const added = useAfterInstall();
  const openPreview = useOpenPackPreview();
  const [pending, start] = useTransition();
  const preview = (id: string) => start(async () => {
    try {
      const res = unwrap(await readIncludedPackFile(id));
      if (!res.ok) throw new Error(`This Pack cannot be installed: ${res.problems[0]?.message ?? ""}`);
      openPreview({
        preview: res.preview, viewer, numberStyle,
        install: async ({ assistantTexts }) => {
          added(unwrap(await installIncludedPackFile(id, { assistantTexts })), res.preview);
        },
      });
    } catch (e) { toast.error("Not done", { description: shown(e) }); }
  });
  return (
    <section aria-labelledby="included-packs" className="space-y-3">
      <div>
        <h2 id="included-packs" className="text-sm font-medium">Ziffr&rsquo;s own Packs</h2>
        <p className="text-sm text-muted-foreground">They come with Ziffr: nothing is downloaded. Each is drawn with Sample Data first; nothing is made or sent before you confirm.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {packs.map((p) => (
          <li key={p.id} className="stock rounded-[var(--radius-card)] p-3 text-sm">
            <p className="font-medium">{p.name} <span className="fig text-xs text-muted-foreground">{p.version}</span></p>
            <p className="text-muted-foreground">{p.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">{p.brings.map((b) => `${b.count} ${KIND[b.kind][b.count === 1 ? 0 : 1]}`).join(", ")}</p>
            {p.needsOwner && <p className="text-xs text-muted-foreground">Holds a Theme: an Owner installs it.</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!p.installed && (setsUp(p.brings.map((b) => b.kind))
                // The guided set-up draws its own frame, so it is loaded as a whole page; its first screen is the preview.
                ? <a href={packSetUpPath(p.id)} className={PHONE_LINK_BUTTON}>Use this pack<span className="sr-only">: {p.name}</span></a>
                : <Button size="sm" variant="outline" disabled={pending} focusableWhenDisabled className="data-disabled:opacity-50 max-sm:h-11" onClick={() => preview(p.id)}>Preview with Sample Data</Button>)}
              {p.installed && <span className="text-xs text-muted-foreground">Installed, version {p.installed.version}.</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Version … comes with this Ziffr" on an installed one of Ziffr's own Packs, and updating to it after seeing what changes. */
export function IncludedUpdate({ installId, name, version }: { installId: number; name: string; version: string }) {
  return <PackUpdate name={name} version={version} button={`Version ${version} comes with this Ziffr…`} from="One of Ziffr’s own Packs: it comes with this version of Ziffr." read={() => readIncludedUpdatePlan(installId)} apply={(c) => updateIncludedPackFile(installId, c)} />;
}
