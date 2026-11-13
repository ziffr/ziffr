"use client";
import "tldraw/tldraw.css";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileDown, Plus, Presentation, Printer } from "lucide-react";
import { createShapeId, DefaultDashStyle, DefaultFontStyle, getSnapshot, Tldraw, useValue, type Editor, type TLEditorSnapshot } from "tldraw";
import { Pool } from "@/components/pool";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { renameDeck, saveDeck } from "@/app/deck-actions";
import type { DropSource } from "@/app/canvas-actions";
import { getDrag, setDrag } from "@/lib/drag";
import { DEFAULT_TEMPLATE, TEMPLATES, templatesFor } from "@/views/templates";
import { StoryEditor } from "@/components/story-editor";
import { widgetFromShape } from "@/decks/widget-shape";
import type { CanvasData, Master, TemplateId, Widget } from "@/lib/types";
import { DeckMaster, setDeckExportMaster, SlideFrameUtil } from "@/decks/master";
import { setDeckMaster } from "@/app/master-actions";
import Link from "next/link";
import { DeckData, setDeckExportData, WIDGET_SHAPE, WidgetShapeUtil, type WidgetShape } from "@/decks/widget-shape";
import { addSlide, LAYOUTS, MARGIN, orderedSlides, SLIDE_H, SLIDE_W, type LayoutId } from "@/decks/layouts";
import { exportPdf, exportPptx } from "@/decks/export";
import { VersionsDialog } from "@/components/versions-dialog";

const shapeUtils = [WidgetShapeUtil, SlideFrameUtil];
// Decks favour charts over bare numbers: a dropped metric lands as a line chart.
const DECK_TEMPLATE: TemplateId = "line";

type Props = { deck: { id: number; name: string; document: unknown; master_id: number | null }; data: CanvasData; saved: Widget[]; masters: Master[] };

export function DeckEditor({ deck, data, saved, masters }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState(deck.name);
  const [masterId, setMasterId] = useState<number | null>(deck.master_id);
  const master = masters.find((m) => m.id === masterId) ?? null;
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [busy, setBusy] = useState<null | "pptx" | "pdf">(null);
  const [, start] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masterRef = useRef<Master | null>(null);
  masterRef.current = master;

  // Read once: a new snapshot object on every render would make tldraw reload its store.
  const [snapshot] = useState(() => (deck.document ? ({ document: deck.document } as unknown as TLEditorSnapshot) : undefined));

  const onMount = useCallback(
    (ed: Editor) => {
      setEditor(ed);
      if (process.env.NODE_ENV === "development") (window as unknown as { __deckEditor?: Editor }).__deckEditor = ed;
      ed.user.updateUserPreferences({ colorScheme: "light", locale: "en" }); // the app is English, whatever the browser says
      // A deck is set in clean type with solid lines, not tldraw's hand-drawn defaults.
      ed.setStyleForNextShapes(DefaultFontStyle, "sans");
      ed.setStyleForNextShapes(DefaultDashStyle, "solid");
      if (!orderedSlides(ed).length) {
        const id = addSlide(ed, "title", masterRef.current);
        ed.zoomToBounds(ed.getShapePageBounds(id)!, { inset: 48 });
      } else {
        ed.zoomToBounds(ed.getShapePageBounds(orderedSlides(ed)[0].id)!, { inset: 48 });
      }
      // Autosave the document (not the camera or selection) a moment after each user change.
      return ed.store.listen(
        () => {
          setStatus("unsaved");
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            setStatus("saving");
            // Plain JSON only: tldraw records can hold class instances that server actions cannot carry.
            saveDeck(deck.id, JSON.parse(JSON.stringify(getSnapshot(ed.store).document)))
              .then(() => setStatus("saved"))
              .catch(() => setStatus("unsaved"));
          }, 800);
        },
        { source: "user", scope: "document" },
      );
    },
    [deck.id],
  );

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  useEffect(() => {
    setDeckExportMaster(master);
    return () => {
      setDeckExportMaster(null);
    };
  }, [master]);
  useEffect(() => {
    setDeckExportData(data);
    return () => {
      setDeckExportData(null);
    };
  }, [data]);

  /** Turn a Pool item into widget props. */
  const widgetProps = (s: DropSource) => {
    if (s.type === "metric") {
      const t = TEMPLATES[DECK_TEMPLATE];
      return { template: t.id, metricIds: [s.id], settings: JSON.stringify(t.settings), title: "", w: 560, h: 320 };
    }
    if (s.type === "widget") {
      const w = saved.find((x) => x.id === s.id);
      if (!w) return null;
      return { template: w.template, metricIds: w.metric_ids, settings: JSON.stringify(w.settings), title: w.title ?? "", w: Math.max(320, w.w * 80), h: Math.max(200, w.h * 44) };
    }
    const t = TEMPLATES[s.template];
    return { template: s.template, metricIds: s.metricIds, settings: JSON.stringify(s.settings ?? t.settings), title: s.title ?? "", w: 560, h: 320 };
  };

  /** Place a widget at a page point, inside the slide under it (or the first slide). */
  const place = (s: DropSource, page?: { x: number; y: number }) => {
    if (!editor) return;
    const props = widgetProps(s);
    if (!props) return;
    const slides = orderedSlides(editor);
    const target =
      (page && slides.find((f) => editor.getShapePageBounds(f)!.containsPoint(page))) ??
      slides.find((f) => editor.getShapePageBounds(f)!.collides(editor.getViewportPageBounds())) ??
      slides[0];
    const id = createShapeId();
    editor.run(() => {
      if (target) {
        const fb = editor.getShapePageBounds(target)!;
        const local = page ? { x: page.x - fb.x - props.w / 2, y: page.y - fb.y - props.h / 2 } : { x: MARGIN, y: 150 };
        const x = Math.min(Math.max(local.x, 0), SLIDE_W - props.w);
        const y = Math.min(Math.max(local.y, 0), SLIDE_H - props.h);
        editor.createShape<WidgetShape>({ id, type: WIDGET_SHAPE, parentId: target.id, x, y, props });
      } else {
        editor.createShape<WidgetShape>({ id, type: WIDGET_SHAPE, x: page?.x ?? 0, y: page?.y ?? 0, props });
      }
      editor.select(id);
    });
  };

  const newSlide = (layout: LayoutId) => {
    if (!editor) return;
    const id = addSlide(editor, layout, master);
    editor.select(id);
    editor.zoomToBounds(editor.getShapePageBounds(id)!, { inset: 48, animation: { duration: 220 } });
  };

  const run = async (kind: "pptx" | "pdf") => {
    if (!editor) return;
    setBusy(kind);
    try {
      if (kind === "pptx") await exportPptx(editor, data, name, master);
      else await exportPdf(editor, name);
      toast.success(kind === "pptx" ? "PowerPoint downloaded" : "PDF ready to print", { description: "Values are a snapshot of today. The deck in Ziffr stays live." });
    } catch (e) {
      console.error(e);
      toast.error("Export failed", { description: "One slide could not be rendered. Try again, or remove the last thing you added." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DeckData.Provider value={data}>
      <DeckMaster.Provider value={master}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Presentation aria-hidden className="size-5 text-muted-foreground" />
        <label className="min-w-0 flex-1">
          <span className="sr-only">Deck name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => start(() => renameDeck(deck.id, name))}
            className="w-full max-w-xl rounded-[var(--radius-input)] bg-transparent px-1 text-[length:var(--text-xl)] font-semibold tracking-[-0.03em] outline-none hover:bg-muted focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-ring"
          />
        </label>
        <span className="text-xs text-muted-foreground" aria-live="polite">{status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Unsaved changes"}</span>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Master</span>
          <select
            value={masterId ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setMasterId(v);
              start(() => setDeckMaster(deck.id, v));
            }}
            className="h-9 rounded-[var(--radius-input)] border border-input bg-card px-2"
          >
            <option value="">None</option>
            {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <Link href={`/decks/masters${masterId ? `?id=${masterId}` : ""}`} className="text-sm underline">Edit</Link>
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants({ variant: "outline" })}><Plus aria-hidden /> Slide</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Layout</DropdownMenuLabel>
              {LAYOUTS.map((l) => (
                <DropdownMenuItem key={l.id} onClick={() => newSlide(l.id)}>
                  <span className="flex flex-col">
                    <span>{l.label}</span>
                    <span className="text-xs text-muted-foreground">{l.blurb}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <VersionsDialog type="deck" id={deck.id} people={data.people} reload="page" />
        <Button variant="outline" onClick={() => run("pdf")} disabled={!editor || busy !== null}><Printer aria-hidden /> {busy === "pdf" ? "Preparing…" : "PDF"}</Button>
        <Button onClick={() => run("pptx")} disabled={!editor || busy !== null}><FileDown aria-hidden /> {busy === "pptx" ? "Exporting…" : "Export PowerPoint"}</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="order-2 space-y-4 lg:order-1">
          <Pool data={data} saved={saved} onAdd={(s) => place(s)} hint="Drag onto a slide, or click + to add to the slide in view." />
          {editor && <SelectionPanel editor={editor} data={data} />}
        </div>
        <div
          className="order-1 h-[calc(100vh-13rem)] min-h-[32rem] overflow-hidden rounded-[var(--radius-card)] border border-border lg:order-2"
          // Capture phase: our Pool drags are handled here before tldraw's own drop handling
          // (which would turn the JSON into a text shape). Other drops (files, images) pass through.
          onDragOverCapture={(e) => {
            if (getDrag()) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDropCapture={(e) => {
            const s = getDrag();
            if (!s || !editor) return;
            e.preventDefault();
            e.stopPropagation();
            setDrag(null);
            place(s, editor.screenToPage({ x: e.clientX, y: e.clientY }));
          }}
        >
          <Tldraw shapeUtils={shapeUtils} snapshot={snapshot} onMount={onMount} />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Slides export in reading order, left to right and top to bottom. Line and bar widgets become editable PowerPoint charts; gauges and analyses go in as images.
      </p>
      </DeckMaster.Provider>
    </DeckData.Provider>
  );
}

/** Restyle the selected widget, the same templates as on a dashboard. */
function SelectionPanel({ editor, data }: { editor: Editor; data: CanvasData }) {
  const slide = useValue("selected slide", () => {
    const s = editor.getOnlySelectedShape();
    return s && s.type === "frame" ? s : null;
  }, [editor]);
  const shape = useValue("selected widget", () => {
    const s = editor.getOnlySelectedShape();
    return s && s.type === WIDGET_SHAPE ? (s as WidgetShape) : null;
  }, [editor]);
  if (slide) {
    return (
      <div className="stock rounded-[var(--radius-card)] p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(slide.meta?.hideMaster)}
            onChange={(e) => editor.updateShape({ id: slide.id, type: "frame", meta: { ...slide.meta, hideMaster: e.target.checked } })}
            className="size-4 accent-[var(--color-ink)]"
          />
          Hide master on this slide
        </label>
        <p className="mt-1.5 text-xs text-muted-foreground">For full-bleed title or image slides.</p>
      </div>
    );
  }
  const kind = shape ? TEMPLATES[shape.props.template as TemplateId]?.kind : null;
  if (!shape || (kind !== "metric" && kind !== "story")) return null;
  const metric = data.metrics.find((x) => x.id === shape.props.metricIds[0]);
  const hasBreakdown = !!metric && Object.keys(data.breakdowns[metric.id] ?? {}).length > 0;
  return (
    <div className="stock rounded-[var(--radius-card)] p-3">
      <label className="text-sm font-medium" htmlFor="deck-template">Visualization</label>
      <select
        id="deck-template"
        value={shape.props.template}
        onChange={(e) => {
          const t = TEMPLATES[e.target.value as TemplateId] ?? TEMPLATES[DEFAULT_TEMPLATE];
          editor.updateShape<WidgetShape>({ id: shape.id, type: WIDGET_SHAPE, props: { template: t.id, settings: JSON.stringify(t.settings) } });
        }}
        className="mt-1.5 h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm"
      >
        {templatesFor(hasBreakdown).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <p className="mt-1.5 text-xs text-muted-foreground">Line, bars and story ranked bars export as native, editable charts.</p>
      {kind === "story" && metric && (
        <div className="-mx-3 mt-3 border-t border-border">
          <StoryEditor
            key={shape.id}
            widget={widgetFromShape(shape)}
            data={data}
            m={metric}
            onSave={(settings) => editor.updateShape<WidgetShape>({ id: shape.id, type: WIDGET_SHAPE, props: { settings: JSON.stringify(settings) } })}
          />
        </div>
      )}
    </div>
  );
}

