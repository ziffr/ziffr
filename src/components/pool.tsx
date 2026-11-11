"use client";
import { useState, useTransition } from "react";
import { BookmarkCheck, GripVertical, Plus, Search, Sigma, X } from "lucide-react";
import { setDrag } from "@/lib/drag";
import { deleteSavedWidget, type DropSource } from "@/app/canvas-actions";
import { TEMPLATES } from "@/views/templates";
import type { CanvasData, Widget } from "@/lib/types";
import { cn } from "@/lib/utils";

/** GLOSSARY: Pool. Metrics the viewer can see + their saved Widgets, draggable onto any canvas. */
export function Pool({ data, saved, onAdd, hint, metricsOnly }: { data: CanvasData; saved: Widget[]; onAdd?: (s: DropSource) => void; hint: string; metricsOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]));
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  const metrics = data.metrics.filter((m) => match(m.name));
  const widgets = saved.filter((w) => match(w.title ?? ""));

  const drag = (s: DropSource) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDrag(s);
      e.dataTransfer.setData("text/plain", JSON.stringify(s));
      e.dataTransfer.effectAllowed = "copy";
    },
    onDragEnd: () => setDrag(null),
  });

  return (
    <aside className="flex max-h-[calc(100vh-7rem)] flex-col rounded-xl border bg-background lg:sticky lg:top-20">
      <div className="border-b p-3">
        <div className="text-sm font-semibold">Pool</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <label className="mt-2 flex items-center gap-1.5 rounded-md border px-2">
          <Search className="size-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="h-7 w-full bg-transparent text-sm outline-none" />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <Section title="Metrics">
          {metrics.map((m) => (
            <Item key={`m${m.id}`} {...drag({ type: "metric", id: m.id })} onAdd={onAdd && (() => onAdd({ type: "metric", id: m.id }))}>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate">{m.name}</span>
                {m.formula && <Sigma className="size-3 shrink-0 text-muted-foreground" />}
              </span>
              {m.owner_id !== data.viewer && <span title={`Owned by ${people[m.owner_id]?.name}`} className="size-2 shrink-0 rounded-full" style={{ background: people[m.owner_id]?.color }} />}
            </Item>
          ))}
          {metrics.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No metrics yet. Ask someone to share one.</p>}
        </Section>
        {!metricsOnly && (
          <Section title="My Widgets">
            {widgets.map((w) => (
              <Item key={`w${w.id}`} {...drag({ type: "widget", id: w.id })} onAdd={onAdd && (() => onAdd({ type: "widget", id: w.id }))}>
                <BookmarkCheck className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{w.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{TEMPLATES[w.template].label}</span>
                </span>
                <button title="Delete saved widget" onClick={() => start(() => deleteSavedWidget(w.id))} className="rounded p-0.5 text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-muted"><X className="size-3" /></button>
              </Item>
            ))}
            {widgets.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Right-click any widget → “Save as Widget”.</p>}
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function Item({ children, onAdd, ...rest }: { children: React.ReactNode; onAdd?: () => void } & React.HTMLAttributes<HTMLLIElement> & { draggable: boolean }) {
  return (
    <li {...rest} className={cn("group/item flex cursor-grab items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-muted/50 active:cursor-grabbing")}>
      <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" />
      {children}
      {onAdd && (
        <button title="Add" onClick={onAdd} className="rounded p-0.5 text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-muted hover:text-foreground"><Plus className="size-3.5" /></button>
      )}
    </li>
  );
}
