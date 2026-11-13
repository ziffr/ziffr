"use client";
import { useState, useTransition } from "react";
import { BookmarkCheck, GripVertical, LayoutTemplate, Plus, Search, Sigma, X } from "lucide-react";
import { TemplateMenu } from "./template-menu";
import { setDrag } from "@/lib/drag";
import { deleteSavedWidget, type DropSource } from "@/app/canvas-actions";
import { TEMPLATES } from "@/views/templates";
import type { CanvasData, Widget } from "@/lib/types";
import { cn } from "@/lib/utils";

/** GLOSSARY: Pool. Metrics the viewer can see, their saved Widgets and the team's templates, draggable onto any canvas. */
export function Pool({ data, saved, onAdd, hint, metricsOnly }: { data: CanvasData; saved: Widget[]; onAdd?: (s: DropSource) => void; hint: string; metricsOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]));
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  const metrics = data.metrics.filter((m) => match(m.name));
  const widgets = saved.filter((w) => match(w.title ?? ""));
  const templates = data.templates.filter((t) => match(t.name));

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
    <aside aria-label="Pool" className="flex max-h-[calc(100vh-7rem)] flex-col rounded-[var(--radius-card)] border border-border bg-[var(--color-paper-2)] lg:sticky lg:top-20">
      <div className="border-b p-3">
        <h2 className="text-sm font-semibold tracking-normal">Pool</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <label className="mt-3 flex items-center gap-1.5 rounded-[var(--radius-input)] border border-input bg-card px-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label="Filter the pool" className="h-9 w-full bg-transparent text-sm outline-none" />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <Section title="Metrics">
          {metrics.map((m) => (
            <Item key={`m${m.id}`} {...drag({ type: "metric", id: m.id })} onAdd={onAdd && (() => onAdd({ type: "metric", id: m.id }))}>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate">{m.name}</span>
                {m.formula && <Sigma aria-label="derived" className="size-3.5 shrink-0 text-muted-foreground" />}
              </span>
              {m.owner_id !== data.viewer && <span className="shrink-0 text-xs text-muted-foreground">{people[m.owner_id]?.name.split(" ")[0]}</span>}
            </Item>
          ))}
          {metrics.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No metrics yet. Ask someone to share one.</p>}
        </Section>
        {!metricsOnly && (
          <Section title="My Widgets">
            {widgets.map((w) => (
              <Item key={`w${w.id}`} {...drag({ type: "widget", id: w.id })} onAdd={onAdd && (() => onAdd({ type: "widget", id: w.id }))}>
                <BookmarkCheck aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{w.title}</span>
                  <span className="block text-xs text-muted-foreground">{TEMPLATES[w.template].label}</span>
                </span>
                <button title="Delete saved widget" aria-label={`Delete ${w.title}`} onClick={() => start(() => deleteSavedWidget(w.id))} className="flex size-7 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-muted focus-visible:opacity-100"><X className="size-3.5" /></button>
              </Item>
            ))}
            {widgets.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Right-click any widget → “Save as Widget”.</p>}
          </Section>
        )}
        {!metricsOnly && (
          <Section title="Templates">
            {templates.map((t) => (
              <Item key={`t${t.id}`} {...drag({ type: "template", id: t.id })} onAdd={onAdd && (() => onAdd({ type: "template", id: t.id }))} title={t.description || undefined}>
                <LayoutTemplate aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.slots.length} slot{t.slots.length === 1 ? "" : "s"}, by {t.owner_id === data.viewer ? "you" : people[t.owner_id]?.name.split(" ")[0]}</span>
                </span>
                <TemplateMenu t={t} mine={t.owner_id === data.viewer} people={data.people} />
              </Item>
            ))}
            {templates.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Right-click any widget, then “Save as template…”.</p>}
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="px-2 pb-1 text-xs font-medium tracking-normal text-muted-foreground">{title}</h3>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function Item({ children, onAdd, ...rest }: { children: React.ReactNode; onAdd?: () => void } & React.HTMLAttributes<HTMLLIElement> & { draggable: boolean }) {
  return (
    <li {...rest} className={cn("group/item flex min-h-10 cursor-grab items-center gap-1.5 rounded-[var(--radius-input)] px-2 text-sm transition-colors hover:bg-[var(--color-cotton)] hover:shadow-[var(--edge-stock)] active:cursor-grabbing")}>
      <GripVertical aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      {children}
      {onAdd && (
        <button title="Add" aria-label="Add" onClick={onAdd} className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"><Plus className="size-4" /></button>
      )}
    </li>
  );
}
