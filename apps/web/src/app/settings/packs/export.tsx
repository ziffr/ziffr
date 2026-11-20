"use client";
// Export as Pack (spec 0030, GLOSSARY: Pack): pick Metrics, catalog entries, templates, View Designs and Themes of the
// Workspace, name the Pack, and download its file. The core makes and checks the file; it holds no value and no person.
import { useState, useTransition } from "react";
import { FileDown, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { exportAsPack } from "@/app/pack-actions";
import { PACK_LICENSES } from "@ziffr/core/pack";
import type { ExportChoice, ExportOptions } from "@ziffr/core/pack-export";

const GROUPS: [keyof ExportOptions, string][] = [["metrics", "Metrics, as Metric Catalog entries"], ["catalog", "Metric Catalog entries from Packs"], ["dashboards", "Dashboard Templates"], ["decks", "Deck Templates"], ["workflows", "Workflow Templates"], ["designs", "View Designs"], ["themes", "Themes"]];

/** The Export as Pack button and its dialog. */
export function ExportPack({ options }: { options: ExportOptions }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ExportChoice>({});
  const [m, setM] = useState({ id: "", name: "", version: "1.0.0", summary: "", author: "", license: "CC-BY-4.0" });
  const [leftOut, setLeftOut] = useState<{ name: string; why: string }[]>([]);
  const [pending, start] = useTransition();
  const count = Object.values(picked).reduce((n, xs) => n + (xs?.length ?? 0), 0);
  const toggle = (k: keyof ExportOptions, id: number) => setPicked({ ...picked, [k]: (picked[k] ?? []).includes(id) ? picked[k]!.filter((x) => x !== id) : [...(picked[k] ?? []), id] });
  const make = () => start(async () => {
    try {
      const res = unwrap(await exportAsPack(m, picked));
      const url = URL.createObjectURL(new Blob([res.text], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: res.fileName });
      a.click();
      URL.revokeObjectURL(url);
      setLeftOut(res.leftOut);
      toast.success(`${res.fileName} downloaded`, { description: res.leftOut.length ? `${res.leftOut.length} item${res.leftOut.length === 1 ? "" : "s"} stayed out; see why below.` : "Check it with npx @ziffr/pack check, then share or publish it." });
    } catch (e) {
      toast.error("No Pack made", { description: shown(e) });
    }
  });
  const field = (k: keyof typeof m, label: string, placeholder: string) => (
    <label className="block text-xs font-medium">{label}<Input value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} placeholder={placeholder} className="mt-1" /></label>
  );
  return (
    <section aria-labelledby="export-pack">
      <h2 id="export-pack" className="text-sm font-medium">Export as Pack</h2>
      <p className="mb-2 text-sm text-muted-foreground">Make a Pack of things in this Workspace to share or publish. It holds their descriptions and layouts, never a value or a person.</p>
      <Button variant="outline" onClick={() => setOpen(true)}><PackagePlus aria-hidden /> Export as Pack…</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
          <DialogTitle>Export as Pack</DialogTitle>
          <DialogDescription>Pick what goes in and name the Pack. Words you wrote in templates go in as written; words with web addresses or markup, images, logos and drawings stay out, and Ziffr says so.</DialogDescription>
          <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              {field("name", "Name", "e.g. SaaS metrics")}
              {field("id", "Id: your handle and a slug", "e.g. northwind/saas-metrics")}
              {field("version", "Version", "1.0.0")}
              {field("author", "Author", "Your name or your company")}
              <div className="sm:col-span-2">{field("summary", "Summary", "One line: what it is for")}</div>
              <label className="block text-xs font-medium">License
                <select value={m.license} onChange={(e) => setM({ ...m, license: e.target.value })} className="mt-1 h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
                  {PACK_LICENSES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            </div>
            {GROUPS.filter(([k]) => options[k].length).map(([k, label]) => (
              <fieldset key={k}>
                <legend className="mb-1 text-xs font-medium">{label}</legend>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {options[k].map((o) => (
                    <li key={o.id}><label className="flex items-start gap-2"><input type="checkbox" checked={(picked[k] ?? []).includes(o.id)} onChange={() => toggle(k, o.id)} className="mt-0.5 accent-[var(--color-ink)]" /><span>{o.name}{o.detail && <span className="block text-xs text-muted-foreground">{o.detail}</span>}</span></label></li>
                  ))}
                </ul>
              </fieldset>
            ))}
            {leftOut.length > 0 && (
              <div role="status" className="rounded-[var(--radius-input)] bg-muted p-2.5 text-xs">
                <p className="font-medium">Stayed out of the last file</p>
                <ul className="mt-1 list-disc pl-4">{leftOut.map((l, i) => <li key={i}>{l.name}: {l.why}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button disabled={!count || !m.name.trim() || !m.id.trim() || pending} onClick={make}><FileDown aria-hidden /> Download Pack</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
