"use client";
// Save as widget (GLOSSARY: Widget, Pool; ticket #988): keeps an analysis that already has a widget of its own in the person's My Widgets,
// the existing way, so it can be placed on any dashboard. Only offered where a widget exists (the forecast and the correlation).
import { useTransition } from "react";
import { toast } from "sonner";
import { BookmarkPlus } from "lucide-react";
import { saveToPool } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { TEMPLATES } from "@/views/templates";

/** A button that saves the widget for these Metrics under a name the person confirms. */
export function SaveWidget({ template, metricIds, showTarget, name }: { template: "forecast" | "correlation"; metricIds: number[]; showTarget: boolean; name: string }) {
  const [pending, start] = useTransition();
  const save = () => {
    const chosen = window.prompt("Save to your widgets as:", name);
    if (!chosen) return;
    start(async () => {
      const settings = { ...TEMPLATES[template].settings, ...(showTarget ? { showTarget: true } : {}) };
      if (!told(await saveToPool({ type: "spec", template, metricIds, settings }, chosen), "Not saved")) toast.success("Saved to My Widgets", { description: "Add it to any dashboard with Add widget." });
    });
  };
  return <button type="button" disabled={pending} onClick={save} className="stock flex min-h-9 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm disabled:opacity-50"><BookmarkPlus className="size-3.5" /> Save as widget</button>;
}
