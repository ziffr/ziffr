"use client";
// The Marketplace on the Packs page (specs 0030 and 0059, GLOSSARY: Marketplace, Pack, New creator): the newest free
// Packs and a search, From Ziffr and Community, one drawn with Sample Data before installing it, and taking a newer
// version of an installed one. Every request goes from Ziffr's server; the browser only names a search, a Pack and a
// version, and the core checks the file and its signature.
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Refused, shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { installFromTheMarketplace, readFromMarketplace, readMarketplaceUpdatePlan, searchPacks, updateFromTheMarketplace } from "@/app/pack-actions";
import type { MarketplaceListing } from "@ziffr/core/marketplace";
import type { UpdatePlan } from "@ziffr/core/pack-updates";
import type { NumberStyle } from "@ziffr/core/number-style";
import { LogoChange } from "./pack-logo";
import { useOpenPackPreview } from "./preview-view";
import { useInstalledToast } from "@/components/pack-guide-help";

/** Browsing and searching the Marketplace, and installing a Pack from it. `installed` marks what the Workspace has. */
export function MarketplaceSearch({ installed, viewer, numberStyle }: { installed: { packId: string; version: string }[]; viewer: string; numberStyle: NumberStyle }) {
  const router = useRouter();
  const installedToast = useInstalledToast();
  const [q, setQ] = useState("");
  // What was asked for with what came back; null while the first question is out.
  const [found, setFound] = useState<{ query: string; packs: MarketplaceListing[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const openPreview = useOpenPackPreview();
  const [pending, start] = useTransition();
  // A search that fails says so in the section: nobody pressed anything when the newest Packs are asked for.
  const search = useCallback((query: string) => start(async () => {
    try {
      setFound({ query: query.trim(), packs: unwrap(await searchPacks(query)) });
      setProblem(null);
    } catch (e) {
      setProblem(shown(e));
    }
  }), []);
  // The newest Packs show before a search.
  useEffect(() => { search(""); }, [search]);
  const open = (l: MarketplaceListing) => start(async () => {
    try {
      const res = unwrap(await readFromMarketplace(l.id, l.version));
      if (!res.ok) throw new Refused(`The Marketplace's file is not a Pack Ziffr can install: ${res.problems[0]?.message ?? ""}`);
      openPreview({
        preview: res.preview, viewer, numberStyle,
        install: async ({ assistantTexts }) => {
          const id = unwrap(await installFromTheMarketplace(l.id, l.version, { assistantTexts }));
          installedToast(id, res.preview.manifest);
          router.refresh();
        },
      });
    } catch (e) { toast.error("Not done", { description: shown(e) }); }
  });
  const have = new Map(installed.map((p) => [p.packId, p.version]));
  const parts = [
    { id: "from-ziffr", title: "From Ziffr", packs: found?.packs.filter((l) => l.id.startsWith("ziffr/")) ?? [] },
    { id: "community", title: "Community", packs: found?.packs.filter((l) => !l.id.startsWith("ziffr/")) ?? [] },
  ].filter((p) => p.packs.length);
  return (
    <section aria-labelledby="marketplace" className="space-y-3">
      <div>
        <h2 id="marketplace" className="text-sm font-medium">From the Marketplace</h2>
        <p className="text-sm text-muted-foreground">Free Packs from Ziffr and from others, newest first. Ziffr checks each file&rsquo;s signature and every item before it shows one.</p>
      </div>
      <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); search(q); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="e.g. SaaS, shop, club" aria-label="Search the Marketplace" />
        <Button type="submit" variant="outline" disabled={pending}><Search aria-hidden /> Search</Button>
      </form>
      {problem && <p role="alert" className="text-sm font-medium">{problem}</p>}
      {!problem && !found && <p role="status" className="text-sm text-muted-foreground">Asking the Marketplace for the newest Packs&hellip;</p>}
      {!problem && found && !parts.length && <p role="status" className="text-sm text-muted-foreground">{found.query ? "No free Pack matches." : "The Marketplace lists no free Pack yet."}</p>}
      {!problem && parts.map((part) => (
        <div key={part.id} className="space-y-1.5">
          <h3 id={`marketplace-${part.id}`} className="text-xs font-medium">{part.title} <span className="fig text-muted-foreground">{part.packs.length}</span></h3>
          <ul aria-labelledby={`marketplace-${part.id}`} className="grid gap-2 sm:grid-cols-2">
            {part.packs.map((l) => (
              <li key={l.id} className="stock flex min-w-0 flex-col items-start rounded-[var(--radius-card)] p-3 text-sm">
                <p className="font-medium">{l.name} <span className="fig text-xs text-muted-foreground">{l.version}</span></p>
                <p className="text-muted-foreground">{l.summary}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">By {l.author}, {l.license}</p>
                {(l.newCreator || have.has(l.id)) && (
                  <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {l.newCreator && <span className="rounded-full border border-input px-2 py-0.5">New creator</span>}
                    {have.has(l.id) && <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"><Check aria-hidden className="size-3" /> Installed, version {have.get(l.id)}</span>}
                  </p>
                )}
                <Button size="sm" variant="outline" className="mt-2 data-disabled:opacity-50" disabled={pending} focusableWhenDisabled aria-label={`See what ${l.name} adds`} onClick={() => open(l)}>See what it adds</Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** "Version … on the Marketplace" on an installed Pack, and updating to it after seeing what changes. */
export function MarketplaceUpdate({ installId, name, version }: { installId: number; name: string; version: string }) {
  return <PackUpdate name={name} version={version} button={`Version ${version} on the Marketplace…`} from="From the Marketplace: its signature holds." read={() => readMarketplaceUpdatePlan(installId, version)} apply={(c) => updateFromTheMarketplace(installId, version, c)} />;
}

/** A newer version of an installed Pack, and updating to it after seeing what changes; `read` and `apply` are the server
 * calls of where the version comes from (the Marketplace, or the Packs that come with Ziffr). */
export function PackUpdate({ name, version, button, from, read: readPlan, apply }: {
  name: string; version: string; button: string; from: string;
  read: () => ReturnType<typeof readMarketplaceUpdatePlan>; apply: (c: { assistantTexts: boolean }) => ReturnType<typeof updateFromTheMarketplace>;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<UpdatePlan | null>(null);
  const [okAssistant, setOkAssistant] = useState(false);
  const [pending, start] = useTransition();
  const run = (f: () => Promise<void>) => start(async () => { try { await f(); } catch (e) { toast.error("Not done", { description: shown(e) }); } });
  const read = () => run(async () => {
    const res = unwrap(await readPlan());
    if (!res.ok) throw new Refused(`The file is not a Pack Ziffr can install: ${res.problems[0]?.message ?? ""}`);
    setOkAssistant(false);
    setPlan(res.plan);
  });
  const ready = !!plan && !plan.blocked && (okAssistant || !plan.assistantTexts.length);
  return (
    <>
      <Button size="sm" disabled={pending} onClick={read}><RefreshCw aria-hidden /> {button}</Button>
      <Dialog open={!!plan} onOpenChange={(o) => { if (!o) setPlan(null); }}>
        {plan && (
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogTitle>Update {name} from {plan.from} to {plan.to}</DialogTitle>
            <DialogDescription>{from} What you changed stays as you made it; the new version is offered beside it.{plan.major ? " A new major version: it may change how things look or work." : ""}</DialogDescription>
            <LogoChange logo={plan.logo} author={plan.author} />
            <ul className="space-y-1 text-sm">
              {plan.items.map((i) => <li key={i.key}>{i.name}: <span className="text-muted-foreground">{i.change}{i.changedHere ? ", changed here" : ""}</span></li>)}
            </ul>
            {plan.assistantTexts.length > 0 && (
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={okAssistant} onChange={(e) => setOkAssistant(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> I read the words aimed at assistants: {plan.assistantTexts.map((t) => `“${t.text}”`).join(", ")}</label>
            )}
            {plan.blocked && <p role="alert" className="text-sm font-medium">{plan.blocked}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPlan(null)}>Cancel</Button>
              <Button disabled={!ready || pending} onClick={() => run(async () => { unwrap(await apply({ assistantTexts: okAssistant })); toast.success(`${name} updated to ${version}`); setPlan(null); router.refresh(); })}>Update to {version}</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
