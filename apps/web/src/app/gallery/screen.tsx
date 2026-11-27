"use client";
// The Gallery's screen (GLOSSARY: Widget Template, View, Preview, Slot; ticket #861): the built-in views, each drawn with the
// Metric picked at the top (or Sample Data), grouped as the Pool groups them. A dashboard's Add widget panel draws the same
// cards (components/view-cards). Two ways in share them: from a Metric (open the Gallery for it and see every view drawn with
// it) and from a view (press Use this…, choose the Metric in the slot dialog a dashboard uses, then choose where it goes).
// Nothing is recorded by browsing; adding goes through the same placeWidget as a dashboard's +, so the dashboard's owner and
// Editors only, and every Metric must be one the person sees.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inUse } from "@ziffr/core/metric-row";
import type { CanvasData, TemplateId } from "@ziffr/core/types";
import { useCanvasSeries } from "@/canvas/series-store";
import { createDashboardNamed, placeWidget, type DropSource } from "@/app/canvas-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSlotFill } from "@/components/slot-dialog";
import { ViewCard, ViewPicture, useViewsWith } from "@/components/view-cards";
import { TEMPLATE_GROUPS, builtinTemplates } from "@/components/template-groups";
import { told } from "@/lib/action-toast";
import { useMedia } from "@/lib/use-media";

const field = "h-8 rounded-[var(--radius-input)] border border-input bg-transparent px-2 text-sm";
type Dashboard = { id: number; name: string };

/** The Gallery: the Metric picker, the grouped cards, and the step that adds a chosen view to a dashboard. */
export function GalleryScreen({ data: sent, metricId, dashboards, canCreate, demo }: { data: CanvasData; metricId: number | null; dashboards: Dashboard[]; canCreate: boolean; demo: boolean }) {
  const router = useRouter();
  // On a phone a view is drawn as wide as the screen, as on a dashboard there: scaled down, its labels cannot be read.
  const phone = useMedia("(max-width: 639px)");
  const { data, ensure } = useCanvasSeries(sent);
  const slotFill = useSlotFill(data);
  const choices = useMemo(() => inUse(data.metrics).sort((a, b) => a.name.localeCompare(b.name)), [data.metrics]);
  const [picked, setPicked] = useState<number | null>(metricId ?? choices[0]?.id ?? null);
  const metric = choices.find((m) => m.id === picked) ?? null;
  const { ready, viewOf } = useViewsWith(data, ensure, metric);
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
              const view = viewOf(t.id);
              return (
                <ViewCard key={t.id} name={t.label} blurb={t.blurb} why={view.why}
                  picture={<ViewPicture template={t.id} view={view} drawing={!!metric && !ready} data={data} reflow={phone} />}
                  action={<Button size="sm" variant="outline" className="shrink-0" onClick={() => void use(t.id)}>Use this…</Button>} />
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
