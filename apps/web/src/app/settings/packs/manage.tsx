"use client";
// Updating and uninstalling Packs (spec 0030, GLOSSARY: Pack): what a newer file would change, item by item, and what
// uninstalling would remove and keep, both shown before anything is done; and the newer versions waiting beside items
// the Workspace changed. The core works it all out again when the person confirms.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { readUninstallPlan, readUpdate, takeOffer, uninstall, updatePack } from "@/app/pack-actions";
import { PACK_LIMITS, UNSIGNED_WARNING } from "@ziffr/core/pack";
import type { OfferedItem, UninstallPlan, UpdateItem, UpdatePlan } from "@ziffr/core/pack-updates";
import { LogoChange } from "./pack-logo";
import type { Problem } from "@ziffr/core/json-check";

const KIND: Record<UpdateItem["kind"], string> = { metric: "Metric Catalog entry", dashboard: "Dashboard Template", deck: "Deck Template", workflow: "Workflow Template", view: "View Design", theme: "Theme" };
const OUTCOME: Record<UpdateItem["outcome"], string> = {
  add: "Added", replace: "Replaced by the new version", offer: "Changed here: kept, the new version is offered beside it",
  delete: "Removed", unmark: "Kept, no longer from the Pack", skip: "Removed here: not added again", none: "Stays as it is",
};

/** The problems of a file that is not a Pack, with their lines. */
function Problems({ problems }: { problems: Problem[] }) {
  if (!problems.length) return null;
  return (
    <div role="alert" className="rounded-[var(--radius-input)] border border-destructive/40 p-3 text-sm">
      <p className="font-medium">This file is not a version Ziffr can install:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{problems.map((p, i) => <li key={i}>{p.line ? `Line ${p.line}: ` : ""}{p.path ? <code>{p.path}</code> : null} {p.message}</li>)}</ul>
    </div>
  );
}

/** Update and Uninstall for one installed Pack, for Owners and Admins. */
export function PackActions({ installId, name }: { installId: number; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [text, setText] = useState<string | null>(null);
  const [plan, setPlan] = useState<UpdatePlan | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [okUnsigned, setOkUnsigned] = useState(false);
  const [okAssistant, setOkAssistant] = useState(false);
  const [leaving, setLeaving] = useState<UninstallPlan | null>(null);
  // Ticked by default: the relationship that put the publisher's logo there ends with the uninstall (spec 0039).
  const [dropLogo, setDropLogo] = useState(true);
  const run = (f: () => Promise<void>) => start(async () => { try { await f(); } catch (e) { toast.error("Not done", { description: shown(e) }); } });
  const close = () => { setText(null); setPlan(null); setProblems([]); setOkUnsigned(false); setOkAssistant(false); if (input.current) input.current.value = ""; };
  const read = (f: File | undefined) => {
    // The same file chosen again, once fixed, is read again.
    if (input.current) input.current.value = "";
    if (!f) return;
    if (f.size > PACK_LIMITS.bytes) { setProblems([{ path: "", line: null, message: `The file is ${f.size.toLocaleString("en")} bytes; at most ${PACK_LIMITS.bytes.toLocaleString("en")} are allowed.` }]); return; }
    run(async () => {
      const t = await f.text();
      const res = unwrap(await readUpdate(installId, t));
      if (res.ok) { setText(t); setPlan(res.plan); setProblems([]); } else { setPlan(null); setProblems(res.problems); }
    });
  };
  const ready = !!plan && !plan.blocked && okUnsigned && (okAssistant || !plan.assistantTexts.length);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
      <Button variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}><RefreshCw aria-hidden /> Update from a file…</Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(async () => { setDropLogo(true); setLeaving(unwrap(await readUninstallPlan(installId))); })}><Trash2 aria-hidden /> Uninstall…</Button>
      <Problems problems={problems} />

      <Dialog open={!!plan} onOpenChange={(o) => { if (!o) close(); }}>
        {plan && (
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogTitle>Update {plan.name} from {plan.from} to {plan.to}</DialogTitle>
            <DialogDescription>What you changed stays as you made it; the new version is offered beside it. Nothing made from the Pack, such as Metrics or dashboards, changes.</DialogDescription>
            <LogoChange logo={plan.logo} author={plan.author} />
            {plan.major && <p className="flex gap-2 rounded-[var(--radius-input)] bg-muted p-2.5 text-sm"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> A new major version: it may change how things look or work.</p>}
            <p className="flex gap-2 rounded-[var(--radius-input)] bg-muted p-2.5 text-sm"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" /> {UNSIGNED_WARNING}</p>
            {plan.assistantTexts.length > 0 && (
              <div className="rounded-[var(--radius-input)] border border-input p-2.5 text-sm">
                <p className="font-medium">Words aimed at AI assistants</p>
                <ul className="mt-1 space-y-1 text-xs">{plan.assistantTexts.map((t) => <li key={t.path}><code>{t.path}</code>: &ldquo;{t.text}&rdquo;</li>)}</ul>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-medium">Item</th><th className="py-1 font-medium">In the new version</th><th className="py-1 font-medium">Here</th></tr></thead>
              <tbody>
                {plan.items.map((i) => (
                  <tr key={i.key} className="border-t border-[var(--color-rule)]">
                    <td className="py-1.5 pr-2">{i.name}<span className="block text-xs text-muted-foreground">{KIND[i.kind]}</span></td>
                    <td className="py-1.5 pr-2 capitalize">{i.change}</td>
                    <td className="py-1.5">{OUTCOME[i.outcome]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.blocked ? <p role="alert" className="text-sm font-medium">{plan.blocked}</p> : (
              <div className="space-y-2 text-sm">
                <label className="flex items-start gap-2"><input type="checkbox" checked={okUnsigned} onChange={(e) => setOkUnsigned(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> I install a file the Marketplace did not check.</label>
                {plan.assistantTexts.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" checked={okAssistant} onChange={(e) => setOkAssistant(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /> I read the words aimed at assistants.</label>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button disabled={!ready || pending} onClick={() => run(async () => { unwrap(await updatePack(installId, text!, { unsigned: okUnsigned, assistantTexts: okAssistant })); toast.success(`${plan.name} updated to ${plan.to}`); close(); router.refresh(); })}>Update to {plan.to}</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!leaving} onOpenChange={(o) => { if (!o) setLeaving(null); }}>
        {leaving && (
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogTitle>Uninstall {name}?</DialogTitle>
            <DialogDescription>Metrics, dashboards, decks and Workflows made from it stay as they are.</DialogDescription>
            <div className="space-y-3 text-sm">
              <div><p className="font-medium">Removed</p>{leaving.remove.length ? <ul className="list-disc pl-5">{leaving.remove.map((r, i) => <li key={i}>{r.name} <span className="text-muted-foreground">({KIND[r.kind]})</span></li>)}</ul> : <p className="text-muted-foreground">Nothing.</p>}</div>
              <div><p className="font-medium">Kept, no longer from the Pack</p>{leaving.keep.length ? <ul className="list-disc pl-5">{leaving.keep.map((k, i) => <li key={i}>{k.name} <span className="text-muted-foreground">({KIND[k.kind]}, {k.why === "changed" ? "changed here" : "in use"})</span></li>)}</ul> : <p className="text-muted-foreground">Nothing.</p>}</div>
            </div>
            {leaving.logo && (
              <label className="flex items-start gap-2 rounded-[var(--radius-input)] border border-input p-2.5 text-sm">
                <input type="checkbox" checked={dropLogo} onChange={(e) => setDropLogo(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" />
                <span>Also remove {leaving.logo.author}&rsquo;s logo from {leaving.logo.themes.length === 1 ? "this Theme" : "these Themes"}: {leaving.logo.themes.join(", ")}. A Theme whose logo is exactly the same picture counts as the Pack&rsquo;s; a different logo you chose stays.</span>
              </label>
            )}
            {leaving.blocked && <p role="alert" className="text-sm font-medium">{leaving.blocked}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLeaving(null)}>Cancel</Button>
              <Button variant="destructive" disabled={!!leaving.blocked || pending} onClick={() => run(async () => { unwrap(await uninstall(installId, !!leaving.logo && dropLogo)); toast.success(`${name} uninstalled`); setLeaving(null); router.refresh(); })}>Uninstall</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** Items the Workspace changed, with a newer version of their Pack waiting: take it, or leave it. */
export function Offers({ offers }: { offers: OfferedItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!offers.length) return null;
  return (
    <section aria-labelledby="pack-offers">
      <h2 id="pack-offers" className="mb-2 text-sm font-medium">New versions offered</h2>
      <p className="mb-2 text-sm text-muted-foreground">You changed these, so an update kept them as they are. Taking the new version replaces yours; yours stays in its Versions.</p>
      <ul className="space-y-2">
        {offers.map((o) => (
          <li key={`${o.table}-${o.id}`} className="stock flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] p-3 text-sm">
            <span>{o.name} <span className="text-xs text-muted-foreground">{KIND[o.kind]}, from {o.packName}</span></span>
            <Button size="sm" disabled={pending} onClick={() => start(async () => { try { unwrap(await takeOffer(o.table, o.id)); toast.success("New version taken"); router.refresh(); } catch (e) { toast.error("Not done", { description: shown(e) }); } })}>Take the new version</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
