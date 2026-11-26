"use client";
// The Marketplace on the Packs page (spec 0030, GLOSSARY: Marketplace, Pack): search free Packs, see one drawn with
// Sample Data before installing it, and take a newer version of an installed one. Every request goes from Ziffr's
// server; the browser only names a search, a Pack and a version, and the core checks the file and its signature.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { installFromTheMarketplace, readFromMarketplace, readMarketplaceUpdatePlan, searchPacks, updateFromTheMarketplace } from "@/app/pack-actions";
import type { MarketplaceListing } from "@ziffr/core/marketplace";
import type { PackPreview } from "@ziffr/core/packs";
import type { UpdatePlan } from "@ziffr/core/pack-updates";
import type { NumberStyle } from "@ziffr/core/number-style";
import { LogoChange } from "./pack-logo";
import { PackPreviewCard } from "./screen";
import { useInstalledToast } from "@/components/pack-guide-help";

/** Searching the Marketplace and installing a Pack from it. */
export function MarketplaceSearch({ viewer, numberStyle }: { viewer: string; numberStyle: NumberStyle }) {
  const router = useRouter();
  const installedToast = useInstalledToast();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<MarketplaceListing[] | null>(null);
  const [preview, setPreview] = useState<{ listing: MarketplaceListing; preview: PackPreview } | null>(null);
  const [okAssistant, setOkAssistant] = useState(false);
  const [pending, start] = useTransition();
  const run = (f: () => Promise<void>) => start(async () => { try { await f(); } catch (e) { toast.error("Not done", { description: shown(e) }); } });
  const search = () => run(async () => setFound(unwrap(await searchPacks(q))));
  const open = (l: MarketplaceListing) => run(async () => {
    const res = unwrap(await readFromMarketplace(l.id, l.version));
    if (!res.ok) throw new Error(`The Marketplace's file is not a Pack Ziffr can install: ${res.problems[0]?.message ?? ""}`);
    setOkAssistant(false);
    setPreview({ listing: l, preview: res.preview });
  });
  const install = () => run(async () => {
    const id = unwrap(await installFromTheMarketplace(preview!.listing.id, preview!.listing.version, { assistantTexts: okAssistant }));
    installedToast(id, preview!.preview.manifest);
    setPreview(null);
    router.refresh();
  });
  return (
    <section aria-labelledby="marketplace" className="space-y-3">
      <div>
        <h2 id="marketplace" className="text-sm font-medium">From the Marketplace</h2>
        <p className="text-sm text-muted-foreground">Free Packs others made. Ziffr checks each file&rsquo;s signature and every item before it shows one.</p>
      </div>
      <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="e.g. SaaS, shop, club" aria-label="Search the Marketplace" />
        <Button type="submit" variant="outline" disabled={pending}><Search aria-hidden /> Search</Button>
      </form>
      {found && (found.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {found.map((l) => (
            <li key={l.id} className="stock rounded-[var(--radius-card)] p-3 text-sm">
              <p className="font-medium">{l.name} <span className="fig text-xs text-muted-foreground">{l.version}</span></p>
              <p className="text-muted-foreground">{l.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">By {l.author}, {l.license}</p>
              <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => open(l)}>See what it adds</Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No free Pack matches.</p>)}
      {preview && <PackPreviewCard preview={preview.preview} viewer={viewer} numberStyle={numberStyle} pending={pending} okUnsigned={false} setOkUnsigned={() => {}} okAssistant={okAssistant} setOkAssistant={setOkAssistant} onCancel={() => setPreview(null)} onInstall={install} />}
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
    if (!res.ok) throw new Error(`The file is not a Pack Ziffr can install: ${res.problems[0]?.message ?? ""}`);
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
