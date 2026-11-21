"use client";
import { tellApart } from "@ziffr/core/metric-names";
import { useEnsure } from "@/canvas/series-store";
import { inUse } from "@ziffr/core/metric-row";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { BookmarkCheck, ChartLine, GripVertical, Info, LayoutTemplate, Plus, Search, Sigma, X } from "lucide-react";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { sampleDesignWidget } from "@ziffr/core/design-files";
import { TemplateMenu } from "./template-menu";
import { setDrag } from "@/lib/drag";
import { deleteSavedWidget, type DropSource } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { DEFAULT_TEMPLATE, TEMPLATES, designTemplate, type TemplateDef, templateOf } from "@/views/templates";
import type { CanvasData, Widget, WidgetTemplate } from "@ziffr/core/types";
import { cn } from "@/lib/utils";
import { Preview, TemplatePreview } from "./preview";
import { TemplateBrowser } from "./template-browser";
import { TEMPLATE_GROUPS, builtinTemplates } from "./template-groups";

/** What a Preview in the Pool shows. */
type Shown = { key: string; draw: () => React.ReactNode; name: string; blurb?: string };

/** GLOSSARY: Pool. Metrics the viewer can see, their saved Widgets and the Widget Templates, draggable onto any canvas.
 * Pointing at or focusing a template or saved widget shows its Preview (spec 0011). */
export function Pool({ data, saved, onAdd, hint, metricsOnly, layouts = false }: { data: CanvasData; saved: Widget[]; onAdd?: (s: DropSource) => void; hint: string; metricsOnly?: boolean; layouts?: boolean }) {
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const [browse, setBrowse] = useState(false);
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]));
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  // Archived Metrics are not offered (GLOSSARY: Archived Metric); widgets that already show one keep it.
  const metrics = inUse(data.metrics).filter((m) => match(m.name));
  // Metrics with the same name are told apart by owner, then period and unit.
  const notes = tellApart(inUse(data.metrics), (id) => people[id]?.name.split(" ")[0] ?? "someone");
  const widgets = saved.filter((w) => match(w.title ?? ""));
  // Slide layouts live under + Slide in decks; the Pool holds templates for single widgets.
  const templates = data.templates.filter((t): t is WidgetTemplate => t.kind === "widget" && match(t.name));
  const builtins = builtinTemplates(layouts).filter((t) => match(t.label) || match(t.blurb));

  // Pointing at a Metric starts fetching its series, so it is usually there by the time it is dropped (ticket #125).
  const ensure = useEnsure();
  const prefetch = (s: DropSource) => {
    if (!ensure) return;
    if (s.type === "metric") void ensure([s.id]);
    else if (s.type === "widget") { const w = saved.find((x) => x.id === s.id); if (w) void ensure(widgetMetricIds(w.metric_ids, w.settings)); }
  };

  // One Preview at a time: beside the Pool after a short pause on pointing, at once on keyboard focus; inline below
  // the row when opened with its ⓘ button (touch, narrow screens).
  const [flyout, setFlyout] = useState<(Shown & { top: number; left: number }) | null>(null);
  const [inline, setInline] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const aside = useRef<HTMLElement>(null);
  const showAt = (el: HTMLElement, s: Shown) => {
    // Only where there is room beside the Pool; narrow screens use the ⓘ button.
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const row = el.getBoundingClientRect();
    const pool = aside.current?.getBoundingClientRect();
    setFlyout({ ...s, top: Math.max(72, Math.min(row.top - 8, window.innerHeight - 340)), left: (pool?.right ?? row.right) + 8 });
  };
  const hide = () => { clearTimeout(timer.current); setFlyout(null); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { hide(); setInline(null); } };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); clearTimeout(timer.current); };
  }, []);
  const previewOn = (s: Shown | null) => (s ? {
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse") return;
      const el = e.currentTarget;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => showAt(el, s), 300);
    },
    onPointerLeave: hide,
    onFocus: (e: React.FocusEvent<HTMLElement>) => { if (e.target === e.currentTarget && e.currentTarget.matches(":focus-visible")) showAt(e.currentTarget, s); },
    onBlur: hide,
  } : {});

  const drag = (s: DropSource, shown: Shown | null = null) => {
    const p = previewOn(shown);
    return {
      draggable: true,
      tabIndex: 0,
      onPointerEnter: (e: React.PointerEvent<HTMLLIElement>) => { prefetch(s); p.onPointerEnter?.(e); },
      onPointerLeave: p.onPointerLeave,
      onFocus: (e: React.FocusEvent<HTMLLIElement>) => { prefetch(s); p.onFocus?.(e); },
      onBlur: p.onBlur,
      onDragStart: (e: React.DragEvent) => {
        hide();
        prefetch(s);
        setDrag(s);
        e.dataTransfer.setData("text/plain", JSON.stringify(s));
        e.dataTransfer.effectAllowed = "copy";
      },
      onDragEnd: () => setDrag(null),
    };
  };
  const info = (s: Shown) => ({ shown: s, open: inline === s.key, onToggle: () => { hide(); setInline((k) => (k === s.key ? null : s.key)); } });

  const builtinShown = (t: TemplateDef): Shown => ({ key: `b${t.id}`, name: t.label, blurb: t.blurb, draw: () => <TemplatePreview template={t.id} viewer={data.viewer} numberStyle={data.numberStyle} width={260} /> });
  const teamShown = (t: WidgetTemplate): Shown => ({ key: `t${t.id}`, name: t.name, blurb: t.description, draw: () => <TemplatePreview template={t} viewer={data.viewer} numberStyle={data.numberStyle} width={260} /> });
  // A saved widget is the viewer's own: its Preview draws their data, never more than placing it would show.
  const savedShown = (w: Widget): Shown => ({ key: `w${w.id}`, name: w.title ?? templateOf(w).label, blurb: templateOf(w).label, draw: () => <Preview widget={w} data={data} size={{ w: w.w, h: w.h }} width={260} /> });
  // A metric's Preview is the widget a drop would place, from the series the Pool already fetches on pointing.
  const metricShown = (id: number, name: string): Shown => ({ key: `m${id}`, name, draw: () => <Preview widget={{ template: DEFAULT_TEMPLATE, metric_ids: [id], settings: TEMPLATES[DEFAULT_TEMPLATE].settings, title: null }} data={data} size={TEMPLATES[DEFAULT_TEMPLATE].size} width={260} /> });

  return (
    <aside ref={aside} aria-label="Pool" className="flex max-h-[calc(100vh-7rem)] flex-col rounded-[var(--radius-card)] border border-border bg-[var(--color-paper-2)] lg:sticky lg:top-20">
      <div className="border-b p-3">
        <h2 className="text-sm font-semibold tracking-normal">Pool</h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <label className="mt-3 flex items-center gap-1.5 rounded-[var(--radius-input)] border border-input bg-card px-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label="Filter the pool" className="h-9 w-full bg-transparent text-sm outline-none" />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto p-2" onScroll={hide}>
        <Section title="Metrics">
          {metrics.map((m) => (
            <Item key={`m${m.id}`} {...drag({ type: "metric", id: m.id })} onAdd={onAdd && (() => onAdd({ type: "metric", id: m.id }))} info={info(metricShown(m.id, m.name))}>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate">{m.name}</span>
                {m.formula && <Sigma aria-label="derived" className="size-3.5 shrink-0 text-muted-foreground" />}
              </span>
              {(m.owner_id !== data.viewer || notes.has(m.id)) && <span className="shrink-0 text-xs text-muted-foreground">{notes.get(m.id) ?? people[m.owner_id]?.name.split(" ")[0]}</span>}
            </Item>
          ))}
          {metrics.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {q ? "No metric matches." : <>No metrics yet. <Link href="/metrics/new" className="underline">Describe your first one</Link>; metrics teammates share with you show up here too.</>}
            </p>
          )}
        </Section>
        {!metricsOnly && (
          <Section title="My Widgets">
            {widgets.map((w) => {
              const s = savedShown(w);
              return (
                <Item key={`w${w.id}`} {...drag({ type: "widget", id: w.id }, s)} onAdd={onAdd && (() => onAdd({ type: "widget", id: w.id }))} info={info(s)}>
                  <BookmarkCheck aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{w.title}</span>
                    <span className="block text-xs text-muted-foreground">{templateOf(w).label}</span>
                  </span>
                  <button title="Delete saved widget" aria-label={`Delete ${w.title}`} onClick={() => start(async () => { told(await deleteSavedWidget(w.id)); })} className="flex size-7 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-muted focus-visible:opacity-100"><X className="size-3.5" /></button>
                </Item>
              );
            })}
            {widgets.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Open any widget&rsquo;s ⋯ menu, then “Save as Widget”.</p>}
          </Section>
        )}
        {!metricsOnly && (
          <Section
            title="Templates"
            action={onAdd && <button onClick={() => { hide(); setBrowse(true); }} className="rounded-[var(--radius-input)] px-1.5 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:bg-muted hover:text-foreground hover:underline">Browse…</button>}
          >
            {TEMPLATE_GROUPS.map((g) => {
              const list = builtins.filter((t) => t.kind === g.kind);
              if (!list.length) return null;
              return (
                <li key={g.kind} className="pt-1">
                  <h4 className="px-2 pb-0.5 text-xs text-muted-foreground">{g.title}</h4>
                  <ul className="space-y-0.5">
                    {list.map((t) => {
                      const s = builtinShown(t);
                      // A built-in has no metrics yet: the canvas asks for them through the slot dialog when it lands.
                      const src: DropSource = { type: "spec", template: t.id, metricIds: [] };
                      return (
                        <Item key={s.key} {...drag(src, s)} onAdd={onAdd && (() => onAdd(src))} info={info(s)}>
                          <g.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{t.label}</span>
                        </Item>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
            {(data.designs ?? []).length > 0 && (
              <li className="pt-1">
                <h4 className="px-2 pb-0.5 text-xs text-muted-foreground">The Workspace&rsquo;s View Designs</h4>
                <ul className="space-y-0.5">
                  {(data.designs ?? []).map((d) => {
                    // Placed with the design as the Workspace keeps it; the core looks it up again by its id.
                    const src: DropSource = { type: "spec", template: "design", metricIds: [], settings: { ...designTemplate(d.body).settings, design: { id: d.id, body: d.body } } };
                    const s: Shown = { key: `d${d.id}`, name: d.name, blurb: d.body.description, draw: () => <Preview widget={sampleDesignWidget(d.body)} data={sampleCanvasData(data.viewer, data.numberStyle)} size={d.body.size} width={260} sample /> };
                    return (
                      <Item key={s.key} {...drag(src, s)} onAdd={onAdd && (() => onAdd(src))} info={info(s)}>
                        <ChartLine aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      </Item>
                    );
                  })}
                </ul>
              </li>
            )}
            <li className="pt-1">
              <h4 className="px-2 pb-0.5 text-xs text-muted-foreground">The team&rsquo;s</h4>
              <ul className="space-y-0.5">
                {templates.map((t) => {
                  const s = teamShown(t);
                  return (
                    <Item key={s.key} {...drag({ type: "template", id: t.id }, s)} onAdd={onAdd && (() => onAdd({ type: "template", id: t.id }))} info={info(s)}>
                      <LayoutTemplate aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{t.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t.slots.length} slot{t.slots.length === 1 ? "" : "s"}, by {t.owner_id === data.viewer ? "you" : people[t.owner_id]?.name.split(" ")[0]}</span>
                      </span>
                      <TemplateMenu t={t} mine={t.owner_id === data.viewer} people={data.people} />
                    </Item>
                  );
                })}
                {templates.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Open any widget&rsquo;s ⋯ menu, then “Save as template…”.</p>}
              </ul>
            </li>
          </Section>
        )}
      </div>
      {/* In a portal: an ancestor of the Pool makes "fixed" relative to itself and clips it. */}
      {flyout && createPortal(
        <div aria-hidden className="pointer-events-none fixed z-50 w-[18rem] space-y-2 rounded-[var(--radius-card)] bg-popover p-3 shadow-md ring-1 ring-foreground/10" style={{ top: flyout.top, left: flyout.left }}>
          <ShownBody s={flyout} />
        </div>,
        document.body,
      )}
      {browse && onAdd && <TemplateBrowser data={data} layouts={layouts} onUse={(s) => { setBrowse(false); onAdd(s); }} onClose={() => setBrowse(false)} />}
    </aside>
  );
}

function ShownBody({ s }: { s: Shown }) {
  return (
    <>
      <div className="flex justify-center">{s.draw()}</div>
      <div>
        <p className="text-sm font-medium">{s.name}</p>
        {s.blurb && <p className="text-xs text-muted-foreground">{s.blurb}</p>}
      </div>
    </>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <h3 className="text-xs font-medium tracking-normal text-muted-foreground">{title}</h3>
        {action}
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

type ItemProps = { children: React.ReactNode; onAdd?: () => void; info?: { shown: Shown; open: boolean; onToggle: () => void } } & React.HTMLAttributes<HTMLLIElement> & { draggable: boolean };

function Item({ children, onAdd, info, ...rest }: ItemProps) {
  return (
    <>
      <li {...rest} className={cn("group/item flex min-h-10 cursor-grab items-center gap-1.5 rounded-[var(--radius-input)] px-2 text-sm transition-colors outline-none hover:bg-[var(--color-cotton)] hover:shadow-[var(--edge-stock)] focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing")}>
        <GripVertical aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        {children}
        {info && (
          <button
            title="Preview"
            aria-label={`Preview of ${info.shown.name}`}
            aria-expanded={info.open}
            onClick={info.onToggle}
            className={cn("flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden lg:group-hover/item:flex lg:group-focus-within/item:flex", info.open && "text-foreground lg:flex")}
          >
            <Info className="size-3.5" />
          </button>
        )}
        {onAdd && (
          <button title="Add" aria-label={info ? `Add ${info.shown.name}` : "Add"} onClick={onAdd} className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"><Plus className="size-4" /></button>
        )}
      </li>
      {info?.open && (
        <li aria-hidden className="space-y-2 rounded-[var(--radius-input)] bg-card p-2 shadow-[var(--edge-stock)]">
          <ShownBody s={info.shown} />
        </li>
      )}
    </>
  );
}
