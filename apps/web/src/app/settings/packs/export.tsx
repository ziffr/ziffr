"use client";
// Export as Pack (spec 0030, GLOSSARY: Pack): pick Metrics, catalog entries, templates, View Designs and Themes of the
// Workspace, name the Pack, describe it (the Pack Guide, spec 0058) and download its file. The core makes and checks the
// file; it holds no value and no person.
import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, FileDown, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { exportAsPack, themeLogoPreview } from "@/app/pack-actions";
import { checkPackGuide, describePack } from "@/app/pack-guide-actions";
import { DescribeStep, useDescription } from "./describe";
import { PACK_LICENSES } from "@ziffr/core/pack";
import type { ExportChoice, ExportOptions } from "@ziffr/core/pack-export";

const GROUPS: [keyof ExportOptions, string][] = [["metrics", "Metrics, as Metric Catalog entries"], ["catalog", "Metric Catalog entries from Packs"], ["dashboards", "Dashboard Templates"], ["decks", "Deck Templates"], ["workflows", "Workflow Templates"], ["designs", "View Designs"], ["themes", "Themes"]];

/** The Export as Pack button and its dialog. */
export function ExportPack({ options, defaultAuthor = "" }: { options: ExportOptions; defaultAuthor?: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ExportChoice>({});
  const [m, setM] = useState({ id: "", name: "", version: "1.0.0", summary: "", author: defaultAuthor, license: "CC-BY-4.0" });
  const [leftOut, setLeftOut] = useState<{ name: string; why: string }[]>([]);
  const [withTags, setWithTags] = useState(true);
  // The Pack's logo (spec 0039): the logo of one of the Themes, or a picture from this computer; the server checks it again.
  const [logoTheme, setLogoTheme] = useState<number | null>(null);
  const [upload, setUpload] = useState<string | null>(null);
  const [themePicture, setThemePicture] = useState<string | null>(null);
  const themeLogos = options.themes.filter((t) => t.hasLogo);
  const logoShown = upload ?? (logoTheme !== null ? themePicture : null);
  // The picture of a Theme is fetched only when picked; the server hands over just the cleaned logo of one's own Theme.
  const pickTheme = (id: number | null) => {
    setLogoTheme(id); setUpload(null); setThemePicture(null);
    if (id !== null) void themeLogoPreview(id).then((r) => { try { setThemePicture(unwrap(r)); } catch { /* the preview is a convenience */ } });
  };
  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 128_000) { toast.error("Logo too big", { description: "A Pack's logo is at most 128 KB." }); return; }
    const r = new FileReader();
    r.onload = () => { setUpload(String(r.result)); setLogoTheme(null); };
    r.readAsDataURL(f);
  };
  const [pending, start] = useTransition();
  // The dialog's two steps: what goes in and the Pack's name, then "Describe your Pack".
  const [describing, setDescribing] = useState(false);
  const description = useDescription();
  const count = Object.values(picked).reduce((n, xs) => n + (xs?.length ?? 0), 0);
  const toggle = (k: keyof ExportOptions, id: number) => setPicked({ ...picked, [k]: (picked[k] ?? []).includes(id) ? picked[k]!.filter((x) => x !== id) : [...(picked[k] ?? []), id] });
  const next = () => start(async () => {
    try {
      description.drafted(unwrap(await describePack(m.id, picked)));
      setDescribing(true);
    } catch (e) {
      toast.error("The next step could not be opened", { description: shown(e) });
    }
  });
  const make = () => start(async () => {
    try {
      if (description.guide) {
        const problems = unwrap(await checkPackGuide(description.guide));
        description.refused(problems);
        // The first field with a problem takes the focus, so it is seen on a small screen too.
        if (problems.length) { document.querySelector<HTMLElement>(`[data-guide-field="${problems[0].section ?? "whatItsFor"}"]`)?.focus(); return; }
      }
      const res = unwrap(await exportAsPack({ ...m, ...(upload ? { logo: { data: upload } } : logoTheme !== null ? { logo: { themeId: logoTheme } } : {}) }, picked, withTags, description.guide));
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
      <Button variant="outline" onClick={() => { setDescribing(false); setOpen(true); }}><PackagePlus aria-hidden /> Export as Pack…</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
          <DialogTitle>{describing ? "Describe your Pack" : "Export as Pack"}</DialogTitle>
          <DialogDescription>{describing ? "Optional: tell whoever gets the Pack what it is for and how to start. They read it before installing and in Help." : "Pick what goes in and name the Pack. Words you wrote in templates go in as written; words with web addresses or markup, images and drawings stay out, and so does every logo but the one you choose below, and Ziffr says so."}</DialogDescription>
          <div key={describing ? "describe" : "pick"} className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 text-sm">
            {describing ? <DescribeStep state={description.state} setState={description.setState} /> : <>
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
            <fieldset>
              <legend className="mb-1 text-xs font-medium">Logo (optional)</legend>
              <p className="mb-1.5 text-xs text-muted-foreground">Shown with the Author on the Packs page and the Marketplace. A PNG, JPEG or plain SVG, at most 128 KB and 512 pixels on a side. It stays yours: use only a logo you may share.</p>
              <div className="flex flex-wrap items-center gap-2">
                {themeLogos.length > 0 && (
                  <select aria-label="Take the logo of a Theme" value={logoTheme ?? ""} onChange={(e) => pickTheme(e.target.value ? Number(e.target.value) : null)} className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm">
                    <option value="">{upload ? "Uploaded picture" : "No logo"}</option>
                    {themeLogos.map((t) => <option key={t.id} value={t.id}>Logo of Theme {t.name}</option>)}
                  </select>
                )}
                <label className="text-xs font-medium">Upload a picture<input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(e) => pickFile(e.target.files?.[0])} className="ml-2 text-xs" /></label>
                {logoShown && <Button variant="outline" size="sm" onClick={() => { setUpload(null); setLogoTheme(null); }}>Remove logo</Button>}
              </div>
              {logoShown && (
                <div className="mt-2 flex items-center gap-3 rounded-[var(--radius-input)] border border-border p-2">
                  {/* A fixed, bordered box, never Ziffr's own chrome. The picture is an <img>, so no script in it runs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoShown} alt={`Logo of ${m.author.trim() || "the author"}`} className="h-12 w-24 object-contain" />
                  <span className="text-xs text-muted-foreground">By {m.author.trim() || "the author"}. Themes using this logo carry it; other logos stay out of the file.</span>
                </div>
              )}
            </fieldset>
            {options.metrics.length > 0 && (
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={withTags} onChange={(e) => setWithTags(e.target.checked)} className="mt-0.5 accent-[var(--color-ink)]" /><span>Carry the Tags of the Metrics you pick<span className="block text-muted-foreground">Up to 5 per entry, only Tags you see on those Metrics. Untick to leave them out.</span></span></label>
            )}
            </>}
            {leftOut.length > 0 && (
              <div role="status" className="rounded-[var(--radius-input)] bg-muted p-2.5 text-xs">
                <p className="font-medium">Stayed out of the last file</p>
                <ul className="mt-1 list-disc pl-4">{leftOut.map((l, i) => <li key={i}>{l.name}: {l.why}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            {describing
              ? <>
                  <Button variant="outline" onClick={() => setDescribing(false)} autoFocus><ArrowLeft aria-hidden /> Back</Button>
                  <Button disabled={pending} onClick={make}><FileDown aria-hidden /> Download Pack</Button>
                </>
              : <>
                  <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
                  <Button disabled={!count || !m.name.trim() || !m.id.trim() || pending} onClick={next}>Next: describe it <ArrowRight aria-hidden /></Button>
                </>}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
