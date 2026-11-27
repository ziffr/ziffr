"use client";
import { noValuesWords } from "@ziffr/core/total-rules";
import { tellApart } from "@ziffr/core/metric-names";
import { useEnsure, useSeriesReady } from "@/canvas/series-store";
import { inUse } from "@ziffr/core/metric-row";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { BookmarkCheck, ChartLine, Check, GripVertical, Info, LayoutTemplate, Plus, Search, Sigma, X } from "lucide-react";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { sampleDesignWidget } from "@ziffr/core/design-files";
import { TemplateMenu } from "./template-menu";
import { setDrag } from "@/lib/drag";
import { deleteSavedWidget, type DropSource } from "@/app/canvas-actions";
import { told } from "@/lib/action-toast";
import { designTemplate, type TemplateDef, templateOf } from "@/views/templates";
import type { CanvasData, Metric, Widget, WidgetTemplate } from "@ziffr/core/types";
import { targetFor } from "@ziffr/core/compare";
import { formatValue, health } from "@ziffr/core/format";
import { PERIOD_LABEL, periodLabel } from "@ziffr/core/periods";
import { Sparkline } from "@/views/sparkline";
import { cn } from "@/lib/utils";
import { Preview, TemplatePreview } from "./preview";
import { BROWSE_TEMPLATES, TemplateBrowser } from "./template-browser";
import { useSlideOver } from "./slide-over-host";
import { TEMPLATE_GROUPS, builtinTemplates } from "./template-groups";
import { useFreeLayouts } from "@/decks/slide-license";

/** What a Preview in the Pool shows: a drawing with the name and a line under it, or (`whole`) a body of its own. */
type Shown = { key: string; draw: () => React.ReactNode; name: string; blurb?: string; whole?: boolean };

/** Where a Preview opens: beside the Pool where there is room, else over the page just below (or above) its row. */
type Spot = { top: number; left: number };
const PREVIEW_WIDTH = 288;
const PREVIEW_HEIGHT = 340;

/** The Pool inside a side panel (the Analysis Canvas): the panel has the title, the Metrics already `added` are marked, a
 * row's ⓘ opens its Preview under it, and rows are dragged where a canvas stands beside them (`drag`), else tapped. */
export type InPanel = { added: number[]; drag: boolean };

/** GLOSSARY: Pool. Metrics the viewer can see, their saved Widgets and the Widget Templates, draggable onto any canvas.
 * Pointing at or focusing a template or saved widget shows its Preview (spec 0011). */
export function Pool({ data, saved, onAdd, hint, metricsOnly, inPanel }: { data: CanvasData; saved: Widget[]; onAdd?: (s: DropSource) => void; hint?: string; metricsOnly?: boolean; inPanel?: InPanel }) {
  const [q, setQ] = useState("");
  const [about, setAbout] = useState<number | null>(null);
  const [, start] = useTransition();
  const panel = useSlideOver();
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]));
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  // Archived Metrics are not offered (GLOSSARY: Archived Metric); widgets that already show one keep it.
  const metrics = inUse(data.metrics).filter((m) => match(m.name));
  // Metrics with the same name are told apart by owner, then period and unit.
  const notes = tellApart(inUse(data.metrics), (id) => people[id]?.name.split(" ")[0] ?? "someone");
  // A saved free layout is offered only where one can be drawn.
  const freeLayouts = useFreeLayouts(saved.some((w) => w.template === "canvas"));
  const widgets = saved.filter((w) => (freeLayouts || w.template !== "canvas") && match(w.title ?? ""));
  // Slide layouts live under + Slide in decks; the Pool holds templates for single widgets.
  const templates = data.templates.filter((t): t is WidgetTemplate => t.kind === "widget" && match(t.name));
  const builtins = builtinTemplates(false).filter((t) => match(t.label) || match(t.blurb));

  // Pointing at a Metric starts fetching its series, so it is usually there by the time it is dropped (ticket #125).
  const ensure = useEnsure();
  const prefetch = (s: DropSource) => {
    if (!ensure) return;
    if (s.type === "metric") void ensure([s.id]);
    else if (s.type === "widget") { const w = saved.find((x) => x.id === s.id); if (w) void ensure(widgetMetricIds(w.metric_ids, w.settings)); }
  };

  // One Preview at a time, always over the page, never in the list, so the list never moves (#827): beside the Pool
  // after a short pause on pointing, at once on keyboard focus, and until it is closed when opened with a row's ⓘ
  // button (touch, narrow screens, or to keep it open). Escape, scrolling the Pool or a tap elsewhere closes it.
  const [flyout, setFlyout] = useState<(Shown & Spot) | null>(null);
  const [opened, setOpened] = useState<(Shown & Spot) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const aside = useRef<HTMLElement>(null);
  const wide = () => window.matchMedia("(min-width: 1024px)").matches;
  const spotFor = (el: HTMLElement): Spot => {
    const row = el.getBoundingClientRect();
    const pool = aside.current?.getBoundingClientRect();
    if (wide()) return { top: Math.max(72, Math.min(row.top - 8, window.innerHeight - PREVIEW_HEIGHT)), left: (pool?.right ?? row.right) + 8 };
    const left = Math.max(16, Math.min(row.left, window.innerWidth - PREVIEW_WIDTH - 16));
    const below = row.bottom + 4;
    return { top: below + PREVIEW_HEIGHT <= window.innerHeight ? below : Math.max(16, row.top - PREVIEW_HEIGHT - 4), left };
  };
  // Pointing only shows a Preview where there is room beside the Pool; narrow screens use the ⓘ button.
  const showAt = (el: HTMLElement, s: Shown) => { if (wide()) setFlyout({ ...s, ...spotFor(el) }); };
  const hide = () => { clearTimeout(timer.current); setFlyout(null); };
  const close = () => { hide(); setOpened(null); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { hide(); setOpened(null); } };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); clearTimeout(timer.current); };
  }, []);
  useEffect(() => {
    if (!opened) return;
    // A tap anywhere but an ⓘ button closes it; the ⓘ buttons open, switch or close it themselves.
    const away = (e: PointerEvent) => { if (!(e.target instanceof Element && e.target.closest("[data-pool-info]"))) setOpened(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [opened]);
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
  // The rows' Previews as drawn now: an open one draws from these, so series that arrive after it opened show in it.
  const current = new Map<string, Shown>();
  const info = (s: Shown) => {
    current.set(s.key, s);
    return {
      shown: s,
      open: opened?.key === s.key,
      onToggle: (button: HTMLElement) => {
        hide();
        const row = button.closest("li") ?? button;
        setOpened((o) => (o?.key === s.key ? null : { ...s, ...spotFor(row) }));
      },
    };
  };

  const builtinShown = (t: TemplateDef): Shown => ({ key: `b${t.id}`, name: t.label, blurb: t.blurb, draw: () => <TemplatePreview template={t.id} viewer={data.viewer} numberStyle={data.numberStyle} width={260} /> });
  const teamShown = (t: WidgetTemplate): Shown => ({ key: `t${t.id}`, name: t.name, blurb: t.description, draw: () => <TemplatePreview template={t} viewer={data.viewer} numberStyle={data.numberStyle} width={260} /> });
  // A saved widget is the viewer's own: its Preview draws their data, never more than placing it would show.
  const savedShown = (w: Widget): Shown => ({ key: `w${w.id}`, name: w.title ?? templateOf(w).label, blurb: templateOf(w).label, draw: () => <Preview widget={w} data={data} size={{ w: w.w, h: w.h }} width={260} /> });
  // A metric's Preview says what it is before it is placed: its description, unit, latest value and a sparkline, from
  // the series the Pool already fetches on pointing (#827). The chart a drop draws depends on where it lands.
  const metricShown = (m: Metric): Shown => ({ key: `m${m.id}`, name: m.name, whole: true, draw: () => <MetricPreview metric={m} data={data} /> });

  return (
    <aside ref={aside} aria-label="Pool" className={cn("flex flex-col", !inPanel && "max-h-[calc(100vh-7rem)] rounded-[var(--radius-card)] border border-border bg-[var(--color-paper-2)] lg:sticky lg:top-20")}>
      <div className={inPanel ? "pb-3" : "border-b p-3"}>
        {!inPanel && <h2 className="text-sm font-semibold tracking-normal">Pool</h2>}
        {!inPanel && <p className="mb-3 text-xs text-muted-foreground">{hint}</p>}
        <label className="flex items-center gap-1.5 rounded-[var(--radius-input)] border border-input bg-card px-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" aria-label="Filter the pool" className={cn("h-9 w-full bg-transparent text-sm outline-none", inPanel && "max-lg:h-11 max-sm:text-base")} />
        </label>
      </div>
      <div className={inPanel ? undefined : "flex-1 overflow-y-auto p-2"} onScroll={close}>
        <Section title="Metrics">
          {metrics.map((m) => (
            <Item key={`m${m.id}`} {...(inPanel && !inPanel.drag ? { draggable: false, onPointerEnter: () => prefetch({ type: "metric", id: m.id }) } : drag({ type: "metric", id: m.id }))} onAdd={onAdd && (() => onAdd({ type: "metric", id: m.id }))}
              info={inPanel ? { shown: metricShown(m), open: about === m.id, onToggle: () => { prefetch({ type: "metric", id: m.id }); setAbout(about === m.id ? null : m.id); } } : info(metricShown(m))}
              panel={inPanel && { added: inPanel.added.includes(m.id), below: about === m.id && <MetricPreview metric={m} data={data} /> }}>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className={inPanel ? "break-words" : "truncate"}>{m.name}</span>
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
            action={onAdd && <button onClick={() => { hide(); panel.open({ ...BROWSE_TEMPLATES, content: <TemplateBrowser data={data} onUse={(s) => { panel.close(); onAdd(s); }} /> }); }} className="rounded-[var(--radius-input)] px-1.5 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:bg-muted hover:text-foreground hover:underline">Browse…</button>}
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
      {(opened ?? flyout) && createPortal(
        // Opened with ⓘ it is read out; shown on pointing it repeats what the row says, so it stays out of the way.
        <div
          id={opened ? "pool-preview" : undefined}
          role={opened ? "region" : undefined}
          aria-label={opened ? `About ${opened.name}` : undefined}
          aria-live={opened ? "polite" : undefined}
          aria-hidden={opened ? undefined : true}
          className="pointer-events-none fixed z-50 w-[18rem] max-w-[calc(100vw-2rem)] space-y-2 rounded-[var(--radius-card)] bg-popover p-3 shadow-md ring-1 ring-foreground/10"
          style={{ top: (opened ?? flyout)!.top, left: (opened ?? flyout)!.left }}
        >
          <ShownBody s={current.get((opened ?? flyout)!.key) ?? (opened ?? flyout)!} />
        </div>,
        document.body,
      )}
    </aside>
  );
}

function ShownBody({ s }: { s: Shown }) {
  if (s.whole) return <>{s.draw()}</>;
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

type ItemProps = { children: React.ReactNode; onAdd?: () => void; info?: { shown: Shown; open: boolean; onToggle: (button: HTMLElement) => void }; /** The row stands in a side panel: whether it is added, and what shows under it. */ panel?: { added: boolean; below: React.ReactNode } } & React.HTMLAttributes<HTMLLIElement> & { draggable: boolean };

function Item({ children, onAdd, info, panel, ...rest }: ItemProps) {
  // In a panel a row that is not dragged is tapped; the keyboard uses its buttons either way.
  const tap = panel && !rest.draggable && !panel.added ? onAdd : undefined;
  const line = (
    <>
      {(!panel || rest.draggable) && <GripVertical aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
      {children}
      {info && (
        <button
          type="button"
          data-pool-info
          title="Preview"
          aria-label={`Preview of ${info.shown.name}`}
          aria-expanded={info.open}
          aria-controls={info.open && !panel ? "pool-preview" : undefined}
          onClick={(e) => { e.stopPropagation(); info.onToggle(e.currentTarget); }}
          className={cn("flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground", panel ? "max-lg:size-11" : "lg:hidden lg:group-hover/item:flex lg:group-focus-within/item:flex", info.open && "text-foreground lg:flex")}
        >
          <Info className="size-3.5" />
        </button>
      )}
      {/* Once added it stays the same button, so the keyboard keeps its place; it only says so. */}
      {onAdd && (panel?.added ? (
        <button key="add" type="button" aria-disabled="true" aria-label={`${info?.shown.name} is on the canvas`} onClick={(e) => e.stopPropagation()} className="flex h-7 shrink-0 items-center gap-1 rounded-[var(--radius-input)] px-1.5 text-xs text-muted-foreground max-lg:h-11"><Check aria-hidden className="size-3.5" /> Added</button>
      ) : (
        <button key="add" type="button" title="Add" aria-label={info ? `Add ${info.shown.name}` : "Add"} onClick={(e) => { e.stopPropagation(); onAdd(); }} className={cn("flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground", panel ? "border border-input max-lg:size-11" : "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100")}><Plus className="size-4" /></button>
      ))}
    </>
  );
  return (
    <li {...rest} tabIndex={panel ? undefined : rest.tabIndex} onClick={tap} className={cn("group/item flex min-h-10 items-center gap-1.5 rounded-[var(--radius-input)] px-2 text-sm transition-colors outline-none hover:bg-[var(--color-cotton)] hover:shadow-[var(--edge-stock)] focus-visible:outline-2 focus-visible:outline-ring", rest.draggable ? "cursor-grab active:cursor-grabbing" : tap && "cursor-pointer", panel && "min-h-11 flex-wrap")}>
      {line}
      {panel?.below && <div className="stock mb-2 w-full cursor-default rounded-[var(--radius-card)] p-3" onClick={(e) => e.stopPropagation()}>{panel.below}</div>}
    </li>
  );
}

/** A metric's Preview in the Pool and the Add widget panel (GLOSSARY: Preview): what it counts and how it stands, drawn
 * from the viewer's own data, which the page already holds for every Metric the viewer sees. */
export function MetricPreview({ metric: m, data }: { metric: Metric; data: CanvasData }) {
  const ready = useSeriesReady([m.id], data);
  const points = data.series[m.slug] ?? [];
  const last = points[points.length - 1];
  // The trend is coloured by the target in effect for the latest value's period (Target Series, else Target Range),
  // picked as Attainment picks it. The targets came with the series, for Metrics the viewer sees.
  const aim = last && targetFor(m, last.period, data.targets[m.id]);
  const against = aim ? { target_min: aim.min, target_max: aim.max } : m;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{m.name}</p>
        <p className="text-xs text-muted-foreground">{PERIOD_LABEL[m.period]}{m.unit ? `, in ${m.unit}` : ""}</p>
      </div>
      {m.description && <p className="line-clamp-4 text-xs">{m.description}</p>}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="fig truncate text-lg font-semibold">{last ? formatValue(m, last.value, data.numberStyle) : "–"}</div>
          <div className="text-xs text-muted-foreground">{last ? periodLabel(last.period, m.period, data.yearStart, true) : ready ? noValuesWords(m) : "Loading…"}</div>
        </div>
        {points.length > 1 && <div className="w-28 shrink-0"><Sparkline points={points.slice(-24)} height={36} tone={health(against, last?.value)} /></div>}
      </div>
    </div>
  );
}
