"use client";
// The Gallery's screen (GLOSSARY: Widget Template, View, Preview, Slot; ticket #861): the built-in views, each drawn with the
// Metric picked at the top (or Sample Data), grouped as the Pool groups them. Two ways in share these cards: from a Metric
// (open the Gallery for it and see every view drawn with it) and from a view (press Use this…, choose the Metric in the
// slot dialog the Pool uses, then choose where it goes). Nothing is recorded by browsing; adding goes through the same
// placeWidget as the Pool's +, so the dashboard's owner and Editors only, and every Metric must be one the person sees.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inUse } from "@ziffr/core/metric-row";
import type { CanvasData, TemplateId } from "@ziffr/core/types";
import { useCanvasSeries } from "@/canvas/series-store";
import { createDashboardNamed, placeWidget, type DropSource } from "@/app/canvas-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Preview, TemplatePreview } from "@/components/preview";
import { useSlotFill } from "@/components/slot-dialog";
import { TEMPLATE_GROUPS, builtinTemplates } from "@/components/template-groups";
import { told } from "@/lib/action-toast";
import { TEMPLATES } from "@/views/templates";
import { widgetWith } from "./widget-with";

/** Draws what it is given at the width the card has: the Preview scales to it and is centred, never wider than the card. */
function Fitted({ children }: { children: (width: number) => React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const watch = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return <div ref={box} className="flex w-full justify-center">{width > 0 && children(width)}</div>;
}

/** How many periods two series share: what a comparison (a correlation, a matrix, Drivers) has to work with. */
const common = (a: { period: string }[] = [], b: { period: string }[] = []) => { const p = new Set(a.map((x) => x.period)); return b.filter((x) => p.has(x.period)).length; };
/** The fewest shared periods a comparison is drawn with; below it the view says there are not enough. */
const ENOUGH = 6;

const field = "h-8 rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";
type Dashboard = { id: number; name: string };

/** The Gallery: the Metric picker, the grouped cards, and the step that adds a chosen view to a dashboard. */
export function GalleryScreen({ data: sent, metricId, dashboards, canCreate, demo }: { data: CanvasData; metricId: number | null; dashboards: Dashboard[]; canCreate: boolean; demo: boolean }) {
  const router = useRouter();
  const { data, ensure } = useCanvasSeries(sent);
  const slotFill = useSlotFill(data);
  const choices = useMemo(() => inUse(data.metrics).sort((a, b) => a.name.localeCompare(b.name)), [data.metrics]);
  const [picked, setPicked] = useState<number | null>(metricId ?? choices[0]?.id ?? null);
  const metric = choices.find((m) => m.id === picked) ?? null;
  // The picked Metric stands for the first Metric of a view. A view that compares gets the other Metrics of the person that
  // share most months with it: their series are asked for here, and the best are chosen once they are in the page's data.
  const candidates = useMemo(() => (metric ? choices.filter((m) => m.id !== metric.id && !m.formula).slice(0, 8).map((m) => m.id) : []), [metric, choices]);
  const asked = useMemo(() => (metric ? [metric.id, ...candidates] : []), [metric, candidates]);
  useEffect(() => { if (asked.length) void ensure(asked); }, [asked.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const loaded = (id: number) => { const m = data.metrics.find((x) => x.id === id); return !m || m.slug in data.series; };
  const ready = asked.length > 0 && asked.every(loaded);
  const partners = useMemo(() => {
    if (!metric || !ready) return [];
    const mine = data.series[metric.slug] ?? [];
    return candidates
      .map((id) => ({ id, n: common(mine, data.series[data.metrics.find((x) => x.id === id)?.slug ?? ""]) }))
      .filter((x) => x.n >= ENOUGH).sort((x, y) => y.n - x.n).slice(0, 2).map((x) => x.id);
  }, [metric, ready, candidates, data]);
  const hasBreakdown = !!metric && Object.keys(data.breakdowns[metric.id] ?? {}).length > 0;
  /** The real widget for a view, or why it is drawn with Sample Data instead. */
  const forView = (id: TemplateId): { widget: ReturnType<typeof widgetWith> | null; why: string | null } => {
    if (!metric) return { widget: null, why: null };
    const t = TEMPLATES[id];
    if ("needsBreakdown" in t && t.needsBreakdown && !hasBreakdown) return { widget: null, why: `${metric.name} has no breakdown, so this shows sample data.` };
    if (t.slots.length > 1 && partners.length + 1 < t.slots.length) return { widget: null, why: `Needs other Metrics with ${ENOUGH}+ months in common with ${metric.name}, so this shows sample data.` };
    return { widget: widgetWith(id, [metric.id, ...partners], metric.period), why: null };
  };
  const [destination, setDestination] = useState<DropSource | null>(null);
  const [pending, start] = useTransition();

  // Views for dashboards and slides: not the free layout, which draws a sketch only.
  const groups = TEMPLATE_GROUPS.filter((g) => g.kind !== "layout").map((g) => ({ ...g, items: builtinTemplates(false).filter((t) => t.kind === g.kind) })).filter((g) => g.items.length);

  /** Use this…: the slot dialog (starting from the picked Metric), then where it goes. */
  const use = async (id: TemplateId) => {
    const source = await slotFill.complete({ type: "spec", template: id, metricIds: [] }, metric ? [metric.id] : []);
    if (source) setDestination(source);
  };
  const addTo = (target: number | "new") => start(async () => {
    if (!destination) return;
    let id = target;
    if (target === "new") {
      const first = destination.type === "spec" ? data.metrics.find((m) => m.id === destination.metricIds[0])?.name : null;
      const made = await createDashboardNamed(first ?? "New dashboard");
      if (told(made, "No dashboard was made")) return;
      id = made as number;
    }
    if (told(await placeWidget(id as number, destination), "Not added")) return;
    toast.success(target === "new" ? "Made a dashboard with it" : `Added to ${dashboards.find((d) => d.id === target)?.name ?? "the dashboard"}`);
    setDestination(null);
    router.push(`/dashboards/${id}`);
  });

  return (
    <div className="space-y-8">
      {slotFill.dialog}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2"><span className="text-xs font-medium">Show them with</span>
          <select className={field} value={picked ?? ""} onChange={(e) => setPicked(e.target.value ? Number(e.target.value) : null)} aria-label="Metric to draw the views with">
            {choices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value="">Sample data</option>
          </select>
        </label>
        <span className="text-muted-foreground">{metric ? `Every view below is drawn with ${metric.name}.` : "Every view below is drawn with made-up numbers."} Press Use this… to put one on a dashboard.{demo ? " (In the demo nothing is saved.)" : ""}</span>
      </div>
      {groups.map((g) => (
        <section key={g.kind} aria-labelledby={`g-${g.kind}`}>
          <h2 id={`g-${g.kind}`} className="mb-3 flex items-center gap-2 font-medium"><g.icon className="size-4" aria-hidden /> {g.title}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((t) => {
              const { widget, why } = ready ? forView(t.id) : { widget: null, why: null };
              return (
                <li key={t.id} className="stock flex h-full flex-col gap-3 rounded-[var(--radius-card)] p-4">
                  <div className="flex flex-1 flex-col justify-center gap-2">
                    <Fitted>{(w) => widget ? <Preview widget={widget} data={data} size={TEMPLATES[t.id].size} width={w} />
                      : metric && !why ? <p className="py-10 text-sm text-muted-foreground">Drawing…</p>
                      : <TemplatePreview template={t.id} viewer={data.viewer} numberStyle={data.numberStyle} width={w} />}</Fitted>
                    {why && <p className="text-xs text-muted-foreground">{why}</p>}
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0"><p className="font-medium">{t.label}</p><p className="text-sm text-muted-foreground">{t.blurb}</p></div>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => void use(t.id)}>Use this…</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <Dialog open={!!destination} onOpenChange={(o) => { if (!o) setDestination(null); }}>
        <DialogContent className="max-w-md">
          <DialogTitle>Add it to…</DialogTitle>
          <p className="text-sm text-muted-foreground">Choose a dashboard of yours{canCreate ? ", or make a new one" : ""}. You can move and resize it there.</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {dashboards.map((d) => <li key={d.id}><Button variant="outline" className="w-full justify-start" disabled={pending} onClick={() => addTo(d.id)}>{d.name}</Button></li>)}
            {!dashboards.length && !canCreate && <li className="text-sm text-muted-foreground">You have no dashboard you may change.</li>}
          </ul>
          {canCreate && <Button disabled={pending} onClick={() => addTo("new")}>A new dashboard with it</Button>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
