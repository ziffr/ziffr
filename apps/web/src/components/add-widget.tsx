"use client";
// A dashboard's Add widget panel (GLOSSARY: Pool, Widget Template, Preview, Slot, Slide-over; #1338): the Pool as cards. Every
// style is drawn with the picked Metric, as in the Gallery, after the Note Widget; then come the Metrics, the saved widgets, the
// team's templates, the View Designs and, where this Ziffr can draw one, the free layout. On a wide screen it stands beside the dashboard, so cards are dragged onto it; on a narrower one
// it is the Slide-over and a card is tapped. It draws only what the page holds of the person (series it lacks are fetched
// through the core, for Metrics they see), and adding goes through the caller, to the same placeWidget as before.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { GripVertical, Info, Plus, Search, Sigma, StickyNote, Trash2, X } from "lucide-react";
import { tellApart } from "@ziffr/core/metric-names";
import { inUse } from "@ziffr/core/metric-row";
import { PERIOD_LABEL } from "@ziffr/core/periods";
import { sampleCanvasData } from "@ziffr/core/sample-data";
import { sampleDesignWidget } from "@ziffr/core/design-files";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import type { CanvasData, Widget, WidgetTemplate } from "@ziffr/core/types";
import { deleteSavedWidget, type DropSource } from "@/app/canvas-actions";
import { placedAtOnce } from "@/app/gallery/widget-with";
import { SeriesProvider, useCanvasSeries, useSeriesReady } from "@/canvas/series-store";
import { useFreeLayouts } from "@/decks/slide-license";
import { Button } from "@/components/ui/button";
import { told } from "@/lib/action-toast";
import { setDrag } from "@/lib/drag";
import { useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import { designTemplate, TEMPLATES, templateOf } from "@/views/templates";
import { MetricPreview } from "./pool";
import { Preview } from "./preview";
import { SlideOverWindow } from "./slide-over-window";
import { WhenVisible } from "./template-browser";
import { TemplateMenu } from "./template-menu";
import { TEMPLATE_GROUPS, builtinTemplates } from "./template-groups";
import { Fitted, ViewCard, ViewPicture, useViewsWith } from "./view-cards";

/** The height of a card's picture where two cards stand side by side. */
const PICTURE = 112;

type Props = {
  data: CanvasData;
  /** The person's saved widgets. */
  saved: Widget[];
  /** The Metric the cards are drawn with, as last picked; without one, the first by name. */
  metricId: number | null;
  onPick: (id: number) => void;
  /** Adds it in the next free place. `startWith` are the Metrics its Slots start from, where it asks for them. */
  onAdd: (source: DropSource, startWith: number[]) => void;
  /** Where cards can be dragged: called as one is picked up, and with null as it is let go. */
  onDrag?: (startWith: number[] | null) => void;
};

/** The panel beside the dashboard (`docked`), else in the Slide-over; there a card is tapped, not dragged. */
export function AddWidget({ docked, onClose, onDrag, ...props }: Props & { docked: boolean; onClose: () => void }) {
  const aside = useRef<HTMLElement>(null);
  useEffect(() => { if (docked) aside.current?.focus({ preventScroll: true }); }, [docked]);
  if (!docked) return <SlideOverWindow title="Add widget" description="Tap a card to add it to the dashboard." onClose={onClose}><Cards {...props} /></SlideOverWindow>;
  return (
    <aside
      ref={aside}
      id="add-widget"
      tabIndex={-1}
      aria-label="Add widget"
      // A menu opened from a card is drawn elsewhere on the page: its Escape closes the menu, not the panel.
      onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented && e.currentTarget.contains(e.target as Node)) onClose(); }}
      className="sticky top-4 flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col self-start rounded-[var(--radius-card)] border border-border bg-[var(--color-paper-2)] outline-none"
    >
      <div className="border-b p-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold tracking-normal">Add widget</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Close Add widget" onClick={onClose}><X aria-hidden /></Button>
        </div>
        <p className="text-xs text-muted-foreground">Drag a card onto the dashboard, or press + for the next free place.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3"><Cards {...props} onDrag={onDrag} /></div>
    </aside>
  );
}

/** The panel's content, with a store of its own for the series it draws: the Slide-over is read once and gets no later ones. */
function Cards(props: Props) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><Offered {...props} data={data} ensure={ensure} /></SeriesProvider>;
}

const field = "h-9 w-full min-w-0 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm max-lg:h-11 max-sm:text-base";

function Offered({ data, ensure, saved, metricId, onPick, onAdd, onDrag }: Props & { ensure: (ids: number[]) => Promise<void> }) {
  const phone = useMedia("(max-width: 639px)");
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]));
  const firstName = (id: string) => people[id]?.name.split(" ")[0] ?? "someone";
  // Archived Metrics are not offered (GLOSSARY: Archived Metric).
  const choices = useMemo(() => inUse(data.metrics).sort((a, b) => a.name.localeCompare(b.name)), [data.metrics]);
  // Metrics with the same name are told apart by owner, then period and unit.
  const notes = tellApart(choices, firstName);
  const [picked, setPicked] = useState(metricId);
  const metric = choices.find((m) => m.id === picked) ?? choices[0] ?? null;
  const { ready, viewOf } = useViewsWith(data, ensure, metric);
  // What was deleted from here goes at once, also in the Slide-over, which shows what it was opened with.
  const [gone, setGone] = useState<string[]>([]);
  const [about, setAbout] = useState<number | null>(null);

  const match = (...words: string[]) => words.some((w) => w.toLowerCase().includes(q.trim().toLowerCase()));
  // A free layout is offered only where this Ziffr has the key of the editor that draws it; the core refuses it elsewhere.
  const freeLayouts = useFreeLayouts();
  const note = match(TEMPLATES.note.label, TEMPLATES.note.blurb, "text", "words");
  const styles = TEMPLATE_GROUPS.map((g) => ({ ...g, items: builtinTemplates(freeLayouts).filter((t) => t.kind === g.kind && match(t.label, t.blurb)) })).filter((g) => g.items.length);
  const metrics = choices.filter((m) => match(m.name));
  const widgets = saved.filter((w) => !gone.includes(`w${w.id}`) && (freeLayouts || w.template !== "canvas") && match(w.title ?? "", templateOf(w).label));
  const templates = data.templates.filter((t): t is WidgetTemplate => t.kind === "widget" && !gone.includes(`t${t.id}`) && match(t.name, t.description));
  const designs = (data.designs ?? []).filter((d) => match(d.name, d.body.description ?? ""));
  const nothing = !!q && !note && !styles.length && !metrics.length && !widgets.length && !templates.length && !designs.length;
  const startWith = metric ? [metric.id] : [];

  /** What makes something draggable where it can be dragged. */
  const drag = (source: DropSource) => (onDrag ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDrag(source);
      e.dataTransfer.setData("text/plain", JSON.stringify(source));
      e.dataTransfer.effectAllowed = "copy" as const;
      onDrag(startWith);
    },
    onDragEnd: () => { setDrag(null); onDrag(null); },
  } : {});

  const card = ({ id, name, blurb, why, source, picture, more }: { id: string; name: string; blurb?: string; why?: string | null; source: DropSource; picture: () => React.ReactNode; more?: React.ReactNode }) => {
    const add = () => onAdd(source, startWith);
    return (
      <ViewCard
        key={id}
        compact
        name={name}
        blurb={blurb}
        why={why}
        title={blurb}
        data-card={id}
        {...drag(source)}
        // Dragged beside the dashboard; elsewhere the whole card is the way to add it.
        onClick={onDrag ? undefined : add}
        className={onDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
        picture={<WhenVisible className="flex min-w-0 items-center justify-center overflow-hidden max-sm:min-h-32 sm:h-28">{picture}</WhenVisible>}
        action={
          <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {more}
            <Button variant="outline" size="icon-sm" className="max-lg:size-11" title="Add" aria-label={`Add ${name}`} onClick={add}><Plus aria-hidden /></Button>
          </span>
        }
      />
    );
  };

  /** A line of the list: dragged or tapped like a card, with + for the next free place. */
  const row = ({ name, source, onPointerEnter, children, more }: { name: string; source: DropSource; onPointerEnter?: () => void; children: React.ReactNode; more?: React.ReactNode }) => {
    const add = () => onAdd(source, startWith);
    return (
      <div {...drag(source)} onPointerEnter={onPointerEnter} onClick={onDrag ? undefined : add} className={cn("flex min-h-11 items-center gap-2 rounded-[var(--radius-input)] px-2 text-sm hover:bg-[var(--color-cotton)]", onDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}>
        {onDrag && <GripVertical aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 py-1">{children}</span>
        <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {more}
          <Button variant="outline" size="icon-sm" className="max-lg:size-11" title="Add" aria-label={`Add ${name}`} onClick={add}><Plus aria-hidden /></Button>
        </span>
      </div>
    );
  };

  const styleCards = (g: (typeof styles)[number]) => (
    <Section key={g.kind} title={g.title}>
      <ul className={CARDS}>
        {g.items.map((t) => {
          const view = viewOf(t.id);
          return card({
            id: `b${t.id}`, name: t.label, blurb: t.blurb, why: view.why,
            // Only what the view needs is asked: with one Metric picked, a style for one Metric asks nothing.
            source: { type: "spec", template: t.id, metricIds: placedAtOnce(t.id, metric, view) },
            picture: () => <ViewPicture template={t.id} view={view} drawing={!!metric && !ready} data={data} reflow={phone} maxHeight={PICTURE} />,
          });
        })}
      </ul>
    </Section>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {choices.length > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0 font-medium">Show:</span>
            <select className={field} value={metric?.id ?? ""} onChange={(e) => { setPicked(Number(e.target.value)); onPick(Number(e.target.value)); }}>
              {choices.map((m) => <option key={m.id} value={m.id}>{m.name}{notes.has(m.id) ? ` (${notes.get(m.id)})` : ""}</option>)}
            </select>
          </label>
        ) : (
          <p className="text-sm text-muted-foreground">No metrics yet. <Link href="/metrics/new" className="underline">Describe your first one</Link>; metrics teammates share with you show up here too.</p>
        )}
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search what you can add" className={cn(field, "pl-8")} />
        </div>
      </div>
      <p role="status" className="text-sm text-muted-foreground empty:hidden">{nothing ? "Nothing matches." : ""}</p>
      {note && (
        <Section title="Your words">
          <div data-card="note">
            {row({
              name: TEMPLATES.note.label,
              source: { type: "spec", template: "note", metricIds: [] },
              children: <><span className="flex items-center gap-1.5"><StickyNote aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />{TEMPLATES.note.label}</span><span className="block text-xs text-muted-foreground">{TEMPLATES.note.blurb}</span></>,
            })}
          </div>
        </Section>
      )}
      {styles.filter((g) => g.kind !== "layout").map(styleCards)}
      {metrics.length > 0 && (
        <Section title="Metrics" hint="On its own, as Number + sparkline.">
          <ul className="space-y-0.5">
            {metrics.map((m) => (
              <li key={m.id}>
                {/* Pointing at it starts fetching its series, so it is usually there by the time it is dropped (ticket #125). */}
                {row({
                  name: m.name,
                  source: { type: "metric", id: m.id },
                  onPointerEnter: () => void ensure([m.id]),
                  more: <Button variant="ghost" size="icon-sm" className="max-lg:size-11" title="About it" aria-label={`About ${m.name}`} aria-expanded={about === m.id} onClick={() => { void ensure([m.id]); setAbout(about === m.id ? null : m.id); }}><Info aria-hidden /></Button>,
                  children: <>
                    <span className="flex items-center gap-1.5"><span className="break-words">{m.name}</span>{m.formula && <Sigma aria-label="derived" className="size-3.5 shrink-0 text-muted-foreground" />}</span>
                    <span className="block text-xs text-muted-foreground">{notes.get(m.id) ?? [PERIOD_LABEL[m.period], m.owner_id !== data.viewer && firstName(m.owner_id)].filter(Boolean).join(", ")}</span>
                  </>,
                })}
                {about === m.id && <div className="stock mx-2 mb-2 rounded-[var(--radius-card)] p-3"><MetricPreview metric={m} data={data} /></div>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {(widgets.length > 0 || !q) && (
        <Section title="My Widgets" hint={widgets.length ? undefined : "Open any widget’s ⋯ menu, then “Save as…”, “Widget”."}>
          <ul className={CARDS}>
            {widgets.map((w) => card({
              id: `w${w.id}`, name: w.title ?? templateOf(w).label, blurb: templateOf(w).label, source: { type: "widget", id: w.id },
              // A saved widget is the person's own: its card draws their data, never more than placing it would show.
              picture: () => <SavedPicture widget={w} data={data} reflow={phone} />,
              more: <Button variant="ghost" size="icon-sm" className="max-lg:size-11" title="Delete saved widget" aria-label={`Delete ${w.title}`} onClick={() => start(async () => { if (!told(await deleteSavedWidget(w.id))) setGone((g) => [...g, `w${w.id}`]); })}><Trash2 aria-hidden /></Button>,
            }))}
          </ul>
        </Section>
      )}
      {(templates.length > 0 || !q) && (
        <Section title="The team’s templates" hint={templates.length ? undefined : "Open any widget’s ⋯ menu, then “Save as…”, “Template”."}>
          <ul className={CARDS}>
            {templates.map((t) => card({
              id: `t${t.id}`, name: t.name, source: { type: "template", id: t.id },
              blurb: [t.description, `${t.slots.length} slot${t.slots.length === 1 ? "" : "s"}, by ${t.owner_id === data.viewer ? "you" : firstName(t.owner_id)}.`].filter(Boolean).join(" "),
              picture: () => <ViewPicture template={t} data={data} reflow={phone} maxHeight={PICTURE} />,
              more: <TemplateMenu t={t} mine={t.owner_id === data.viewer} people={data.people} shown onDeleted={() => setGone((g) => [...g, `t${t.id}`])} />,
            }))}
          </ul>
        </Section>
      )}
      {designs.length > 0 && (
        <Section title="The Workspace’s View Designs">
          <ul className={CARDS}>
            {designs.map((d) => card({
              id: `d${d.id}`, name: d.name, blurb: d.body.description,
              // Placed with the design as the Workspace keeps it; the core looks it up again by its id.
              source: { type: "spec", template: "design", metricIds: [], settings: { ...designTemplate(d.body).settings, design: { id: d.id, body: d.body } } },
              picture: () => <DesignPicture design={d} data={data} reflow={phone} />,
            }))}
          </ul>
        </Section>
      )}
      {styles.filter((g) => g.kind === "layout").map(styleCards)}
    </div>
  );
}

/** Two cards to a row; one on a phone, where a picture scaled to half the screen cannot be read. */
const CARDS = "grid grid-cols-1 gap-3 sm:grid-cols-2";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <div>
        <h3 className="text-xs font-medium tracking-normal text-muted-foreground">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A saved widget drawn from the person's data; its series are asked for once its card is in view. */
function SavedPicture({ widget, data, reflow }: { widget: Widget; data: CanvasData; reflow: boolean }) {
  const ready = useSeriesReady(widgetMetricIds(widget.metric_ids, widget.settings), data);
  if (!ready) return <p className="py-10 text-sm text-muted-foreground">Drawing…</p>;
  return <Fitted>{(width) => <Preview widget={widget} data={data} size={{ w: widget.w, h: widget.h }} width={width} maxHeight={PICTURE} reflow={reflow} />}</Fitted>;
}

/** A View Design of the Workspace drawn with Sample Data. */
function DesignPicture({ design, data, reflow }: { design: NonNullable<CanvasData["designs"]>[number]; data: CanvasData; reflow: boolean }) {
  const sample = useMemo(() => sampleCanvasData(data.viewer, data.numberStyle), [data.viewer, data.numberStyle]);
  return <Fitted>{(width) => <Preview widget={sampleDesignWidget(design.body)} data={sample} size={design.body.size} width={width} maxHeight={PICTURE} reflow={reflow} sample />}</Fitted>;
}
