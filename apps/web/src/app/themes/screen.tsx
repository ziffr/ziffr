"use client";
// Themes (GLOSSARY: Theme): pick one on the left, change it on the right and see real widgets in it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, GitBranch, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ThemeScope } from "@/components/theme-scope";
import { WidgetFrame, type FrameWidget } from "@/components/widget-frame";
import { VersionsPanel } from "@/components/versions-panel";
import { deleteTheme, duplicateTheme, saveTheme, setDefaultTheme } from "@/app/theme-actions";
import { FONTS, slideDesign } from "@ziffr/core/themes";
import { SlidePreview, SlidesEditor } from "./slides-editor";
import type { CanvasData, FontId, Theme, ThemeSlides, ThemeTokens } from "@ziffr/core/types";
import { cn } from "@/lib/utils";

const COLOURS: { key: Exclude<keyof ThemeTokens, "data" | "fontHeading" | "fontBody" | "fontFigures" | "radius" | "cards">; label: string }[] = [
  { key: "canvas", label: "Behind the cards" },
  { key: "surface", label: "Cards and slides" },
  { key: "ink", label: "Text and values" },
  { key: "muted", label: "Labels and axes" },
  { key: "rule", label: "Lines and grid" },
  { key: "accent", label: "Highlight" },
  { key: "good", label: "Good" },
  { key: "bad", label: "Bad" },
  { key: "band", label: "Target band" },
];

export function ThemesScreen({ data, current }: { data: CanvasData; current: Theme }) {
  const router = useRouter();
  const [t, setT] = useState<ThemeTokens>(current.tokens);
  const [slides, setSlides] = useState<ThemeSlides>(current.slides);
  const [name, setName] = useState(current.name);
  const [versions, setVersions] = useState(false);
  const [pending, start] = useTransition();
  const can = data.canEditThemes;
  const dirty = name !== current.name || JSON.stringify(t) !== JSON.stringify(current.tokens) || JSON.stringify(slides) !== JSON.stringify(current.slides);
  const set = <K extends keyof ThemeTokens>(k: K, v: ThemeTokens[K]) => setT((x) => ({ ...x, [k]: v }));
  const draft: Theme = { ...current, name, tokens: t, slides };

  // Real widgets with real numbers, so a theme is judged on what it will actually show.
  const ids = data.metrics.slice(0, 3).map((m) => m.id);
  const samples: FrameWidget[] = ids.length
    ? [
        { template: "number", metric_ids: [ids[0]], settings: { window: 12 }, title: null },
        { template: "gauge", metric_ids: [ids[2] ?? ids[0]], settings: {}, title: null },
        { template: "line", metric_ids: [ids[0]], settings: { window: 12, showTarget: true, showForecast: true }, title: null },
        { template: "story", metric_ids: [ids[0]], title: null, settings: { kicker: "{metric}, {period}", headline: "{metric} {change yoy} on last year", subline: "Change against the same period a year earlier, in %", panels: [{ type: "period-bars", metricIds: [ids[0]], measure: "pct-yoy", periods: 6, highlight: "last", annotations: [{ kind: "ring", anchor: { type: "rule", rule: "max" } }] }] } },
      ]
    : [];

  const act = (f: () => Promise<unknown>, ok: string) => start(async () => {
    try { await f(); toast.success(ok); router.refresh(); } catch (err) { toast.error("Not done", { description: (err as Error).message }); }
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Themes" className="space-y-1">
        {data.themes.map((x) => (
          <Link key={x.id} href={`/themes?id=${x.id}`} aria-current={x.id === current.id ? "page" : undefined} className={cn("flex min-h-12 items-center gap-2.5 rounded-[var(--radius-input)] px-2.5 text-sm hover:bg-muted", x.id === current.id && "stock font-medium")}>
            <span aria-hidden className="flex overflow-hidden rounded-[3px] shadow-[0_0_0_1px_var(--color-rule)]">
              {[x.tokens.surface, x.tokens.ink, x.tokens.accent, x.tokens.data[0]].map((c, i) => <span key={i} className="block size-3.5" style={{ background: c }} />)}
            </span>
            <span className="flex-1">{x.name}</span>
            {x.is_default && <span className="text-xs text-muted-foreground">team default</span>}
          </Link>
        ))}
        {!can && <p className="px-2.5 pt-2 text-xs text-muted-foreground">Only owners and admins of the workspace change themes. You can pick one for your dashboards and decks.</p>}
      </nav>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <form
          className="space-y-4 text-sm"
          onSubmit={(e) => { e.preventDefault(); act(() => saveTheme(current.id, name, t, slides), "Theme saved"); }}
        >
          <fieldset disabled={!can || pending} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div>
              <div className="mb-1.5 text-xs font-medium">Colours</div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
                {COLOURS.map((c) => (
                  <li key={c.key}>
                    <label className="flex items-center gap-2">
                      <input type="color" value={t[c.key]} onChange={(e) => set(c.key, e.target.value.toUpperCase())} className="h-8 w-9 shrink-0 cursor-pointer rounded border border-input bg-card p-0.5" />
                      <span className="text-xs leading-tight">{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium">Data, first for single series</div>
              <div className="flex gap-2">
                {t.data.map((c, i) => (
                  <input key={i} type="color" aria-label={`Data colour ${i + 1}`} value={c} onChange={(e) => set("data", t.data.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))} className="h-8 w-9 cursor-pointer rounded border border-input bg-card p-0.5" />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["fontHeading", "fontBody", "fontFigures"] as const).map((k) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-xs font-medium">{k === "fontHeading" ? "Headlines" : k === "fontBody" ? "Text" : "Figures"}</span>
                  <select value={t[k]} onChange={(e) => set(k, e.target.value as FontId)} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-1.5 text-xs">
                    {Object.entries(FONTS).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Corners, <span className="fig">{t.radius}</span> px</span>
                <input type="range" min={0} max={16} value={t.radius} onChange={(e) => set("radius", Number(e.target.value))} className="w-full accent-[var(--color-ink)]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium">Cards</span>
                <select value={t.cards} onChange={(e) => set("cards", e.target.value as ThemeTokens["cards"])} className="h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-1.5">
                  <option value="paper">Paper, soft shadow</option>
                  <option value="flat">Flat, hairline edge</option>
                  <option value="plain">Plain, no edge</option>
                </select>
              </label>
            </div>
            <div className="border-t border-border pt-4">
              <div className="mb-2 text-xs font-medium">Slides</div>
              <SlidesEditor s={slides} onChange={setSlides} />
            </div>
          </fieldset>
          {can && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || !dirty}>Save theme</Button>
              {dirty && <Button type="button" variant="outline" onClick={() => { setT(current.tokens); setSlides(current.slides); setName(current.name); }}>Discard</Button>}
            </div>
          )}
          <div className="flex flex-wrap gap-1 border-t border-border pt-3">
            {can && !current.is_default && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => act(() => setDefaultTheme(current.id), `${current.name} is now the team default`)}><Star aria-hidden /> Make team default</Button>}
            {can && <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const id = await duplicateTheme(current.id); router.push(`/themes?id=${id}`); })}><Copy aria-hidden /> Duplicate</Button>}
            <Button type="button" variant="ghost" size="sm" onClick={() => setVersions(true)}><GitBranch aria-hidden /> Versions</Button>
            {can && !current.is_default && <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={pending} onClick={() => { if (confirm(`Delete ${current.name}? Dashboards and decks using it switch to the team default.`)) start(async () => { await deleteTheme(current.id); router.push("/themes"); }); }}><Trash2 aria-hidden /> Delete</Button>}
          </div>
        </form>

        <ThemeScope theme={draft} className="desk min-w-0 space-y-4 rounded-[var(--radius-card)] p-4" aria-label="Preview">
          <SlidePreview design={slideDesign(draft)!} />
          <div className="grid gap-4 sm:grid-cols-2">
            {samples.map((w, i) => (
              <div key={i} className={cn(i >= 2 ? "h-80 sm:col-span-2" : "h-52")}>
                <WidgetFrame widget={w} data={data} targets={[]} />
              </div>
            ))}
          </div>
        </ThemeScope>
      </div>

      {versions && (
        <Dialog open onOpenChange={(o) => { if (!o) setVersions(false); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle className="sr-only">Versions of {current.name}</DialogTitle>
            <VersionsPanel type="theme" id={current.id} people={data.people} onRestored={() => router.refresh()} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
