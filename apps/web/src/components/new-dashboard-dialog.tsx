"use client";
// Starting a dashboard (GLOSSARY: Dashboard, Dashboard Template, Slot): empty, or from a Dashboard Template whose Slots
// are filled with the viewer's own Metrics. The core checks every Metric again; this only offers what the page sent.
import { useState, useTransition } from "react";
import type { NumberStyle } from "@ziffr/core/number-style";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDashboardNamed } from "@/app/canvas-actions";
import { createFromDashboardTemplate } from "@/app/dashboard-template-actions";
import { fillsComplete } from "@ziffr/core/team-templates";
import type { DashboardTemplateSummary } from "@ziffr/core/dashboard-templates";
import { cn } from "@/lib/utils";
import { DashboardTemplatePreview } from "./preview";
import { WhenVisible } from "./template-browser";
import { SlotFills } from "./slot-fills";

type Choice = { id: number; name: string };

/** The dialog for a new dashboard: a name, and either nothing or a template with its Slots filled. */
export function NewDashboardDialog({ open, onOpenChange, templates, metrics, tags = [], viewer = "", numberStyle }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: DashboardTemplateSummary[];
  metrics: Choice[];
  /** The Tags this person sees: a Slot of several may take all Metrics with one (GLOSSARY: Tag). */
  tags?: { id: string; name: string }[];
  /** Who looks: Sample Data needs a viewer, though it draws nobody's numbers. */
  viewer?: string;
  /** How the workspace writes numbers, for the Previews. */
  numberStyle: NumberStyle;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<DashboardTemplateSummary["id"] | null>(null);
  const [name, setName] = useState("");
  const t = templates.find((x) => x.id === picked) ?? null;
  // Each Slot starts with the first Metric it was made with that this viewer sees, if any.
  const [fills, setFills] = useState<number[][]>([]);
  const [tagFills, setTagFills] = useState<(string | null)[]>([]);
  const pick = (id: DashboardTemplateSummary["id"] | null) => {
    setPicked(id);
    setTagFills([]);
    const next = templates.find((x) => x.id === id);
    setFills(next ? next.slots.map((s) => (s.exampleIds ?? []).filter((m) => metrics.some((x) => x.id === m)).slice(0, s.multiple ? 50 : 1)) : []);
  };
  const ready = name.trim().length > 0 && (!t || fillsComplete(t.slots, fills, tagFills));
  const make = () => start(async () => {
    try {
      const id = unwrap(t ? await createFromDashboardTemplate(t.id, name, fills, tagFills) : await createDashboardNamed(name));
      onOpenChange(false);
      router.push(`/dashboards/${id}`);
    } catch (e) {
      toast.error("Not done", { description: shown(e) });
    }
  });
  // Each choice is a card with a Preview drawn from Sample Data (#191), drawn once it scrolls into view.
  const option = (x: DashboardTemplateSummary | null, title: string, sub: string) => {
    const id = x?.id ?? null;
    return (
      <li key={String(id)}>
        <label className={cn("flex h-full cursor-pointer flex-col gap-2 rounded-[var(--radius-stock)] border p-2.5 text-sm hover:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring", picked === id ? "border-[var(--color-ink)] bg-muted" : "border-input")}>
          <WhenVisible className="flex h-32 items-start justify-center overflow-hidden rounded-[var(--radius-input)] bg-[var(--color-paper-2)] p-1.5">
            {() => (x ? <DashboardTemplatePreview template={x} viewer={viewer} numberStyle={numberStyle} width={212} /> : <span className="m-auto text-xs text-muted-foreground">Nothing yet</span>)}
          </WhenVisible>
          <span className="flex items-start gap-2">
            <input type="radio" name="template" checked={picked === id} onChange={() => pick(id)} className="mt-0.5 accent-[var(--color-ink)]" />
            <span><span className="font-medium">{title}</span><span className="block text-xs text-muted-foreground">{sub}</span></span>
          </span>
        </label>
      </li>
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(52rem,calc(100vh-2rem))] flex-col sm:max-w-3xl">
        <DialogTitle className="flex items-center gap-2"><LayoutDashboard aria-hidden className="size-4" /> New dashboard</DialogTitle>
        <DialogDescription>Start empty, or from a template: pick a Metric for each of its places once, even when several widgets show it. Templates are drawn with sample data.</DialogDescription>
        <form className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-1" onSubmit={(e) => { e.preventDefault(); if (ready) make(); }}>
          <label className="block text-sm font-medium">Name<Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder={t?.name ?? "My dashboard"} className="mt-1" autoFocus /></label>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium"><LayoutTemplate aria-hidden className="size-4" /> Start from</legend>
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {option(null, "Empty dashboard", "Add widgets yourself with Add widget.")}
              {templates.map((x) => option(x, x.name, `${x.description ? `${x.description} ` : ""}${x.widgets} widget${x.widgets === 1 ? "" : "s"}${x.owner_id ? "" : ", from Ziffr"}.`))}
            </ul>
          </fieldset>
          {t && (
            <div className="space-y-3">
              <SlotFills slots={t.slots} metrics={metrics} fills={fills} onChange={setFills} tags={tags} tagFillable={t.tagFillable} tagFills={tagFills} onTagFills={setTagFills} />
              {!metrics.length && <p className="text-sm text-muted-foreground">You see no Metrics yet to fill it with.</p>}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!ready || pending}>Create dashboard</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens the dialog, for pages without one of their own. */
export function NewDashboardButton({ templates, metrics, tags, numberStyle, label = "New dashboard", variant = "default" }: { templates: DashboardTemplateSummary[]; metrics: Choice[]; tags?: { id: string; name: string }[]; numberStyle: NumberStyle; label?: string; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>{label}</Button>
      {open && <NewDashboardDialog open onOpenChange={setOpen} templates={templates} metrics={metrics} tags={tags} numberStyle={numberStyle} />}
    </>
  );
}
