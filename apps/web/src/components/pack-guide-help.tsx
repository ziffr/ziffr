"use client";
// GLOSSARY: Pack Guide, Slide-over. The guides of the installed Packs in Help (spec 0058): the list of Packs that have
// one, one guide read in the side panel, and the "Read its guide" button of an installed Pack. The server decides what
// the viewer may see, each time a panel opens; the words are drawn by PackGuideView, as text only.
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PackGuideView } from "@/components/pack-guide";
import { useSlideOver } from "@/components/slide-over-host";
import { readPackGuide, readPackGuides } from "@/app/pack-guide-actions";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import type { InstalledGuide, InstalledGuideEntry } from "@ziffr/core/installed-pack-guides";

/** The installed Packs with a guide, as Help lists them; empty while loading, for Guests and when it cannot be read. */
export function usePackGuides(): InstalledGuideEntry[] {
  const [entries, setEntries] = useState<InstalledGuideEntry[]>([]);
  useEffect(() => {
    let live = true;
    // A list that cannot be read leaves Help as it is without Packs: the user guide is what the panel was opened for.
    readPackGuides().then((r) => { if (live && Array.isArray(r)) setEntries(r); }, () => {});
    return () => { live = false; };
  }, []);
  return entries;
}

/** "Guides from your Packs": one button per Pack; draws nothing when no installed Pack has a guide. */
export function PackGuideList({ entries, onOpen }: { entries: InstalledGuideEntry[]; onOpen: (installId: number) => void }) {
  if (!entries.length) return null;
  return (
    <section aria-label="Guides from your Packs" className="rounded-[var(--radius-input)] border border-input p-3 [overflow-wrap:anywhere]">
      <h3 className="font-semibold">Guides from your Packs</h3>
      <ul className="mt-1 flex flex-col">
        {entries.map((e) => (
          <li key={e.installId}>
            <button type="button" className="flex min-h-9 w-full items-center gap-2 text-left font-medium underline-offset-4 hover:underline" onClick={() => onOpen(e.installId)}>
              <BookOpen aria-hidden className="size-4 shrink-0" />{e.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One installed Pack's guide, with Back when it was opened from a list. */
export function PackGuidePage({ installId, onBack }: { installId: number; onBack?: () => void }) {
  const [state, setState] = useState<{ guide: InstalledGuide | null } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    readPackGuide(installId).then(
      (r) => { if (live) setState(isActionError(r) ? { error: r.error } : { guide: r }); },
      () => { if (live) setState({ error: UNEXPECTED }); },
    );
    return () => { live = false; };
  }, [installId]);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {onBack && <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack} autoFocus><ArrowLeft aria-hidden /> Back</Button>}
      {!state && <p role="status" className="text-muted-foreground">Loading the guide…</p>}
      {state && "error" in state && <p role="alert" className="text-muted-foreground">{state.error}</p>}
      {state && "guide" in state && !state.guide && <p className="text-muted-foreground">This Pack has no guide, or you do not see it.</p>}
      {state && "guide" in state && state.guide && (
        <>
          <h3 className="text-base font-semibold [overflow-wrap:anywhere]">{state.guide.name} <span className="fig text-sm font-normal text-muted-foreground">{state.guide.version}</span></h3>
          <PackGuideView guide={state.guide.guide} author={state.guide.author} />
        </>
      )}
    </div>
  );
}

/** Opens Help in the side panel at one installed Pack's guide. */
function useOpenPackGuide(): (installId: number) => void {
  const panel = useSlideOver();
  return (installId) => panel.open({ title: "Help", description: "The guide of an installed Pack.", widthToggle: true, content: <PackGuidePage key={installId} installId={installId} /> });
}

/** Says that a Pack is installed and, when it brought a guide, offers to read it right away. */
export function useInstalledToast(): (installId: number, manifest: { name: string; guide?: unknown }, description?: string) => void {
  const open = useOpenPackGuide();
  return (installId, manifest, description) => toast.success(`${manifest.name} installed`, {
    description,
    ...(manifest.guide ? { duration: 15_000, action: { label: "Read its guide", onClick: () => open(installId) } } : {}),
  });
}

/** "Read its guide" on an installed Pack: opens Help in the side panel at that guide. */
export function PackGuideButton({ installId, name }: { installId: number; name: string }) {
  const open = useOpenPackGuide();
  return (
    <Button size="sm" variant="outline" aria-haspopup="dialog" onClick={() => open(installId)}>
      <BookOpen aria-hidden /> Read its guide<span className="sr-only">: {name}</span>
    </Button>
  );
}
