"use client";
import "tldraw/tldraw.css";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ThemeScope } from "@/components/theme-scope";
import { ThemePicker } from "@/components/theme-picker";
import { setDeckTheme } from "@/app/theme-actions";
import { isDark, slideDesign, themeFor } from "@ziffr/core/themes";
import { toast } from "sonner";
import { FileDown, Group as GroupIcon, LayoutTemplate, MonitorPlay, Plus, Presentation, Printer, Ungroup } from "lucide-react";
import { createShapeId, DefaultDashStyle, DefaultFontStyle, DefaultStylePanel, getSnapshot, Tldraw, useEditor, useValue, type Editor, type TLComponents, type TLEditorSnapshot, type TLUiStylePanelProps } from "tldraw";
import { Pool } from "@/components/pool";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { noteDeckExport, renameDeck, saveDeck, setDeckFooter } from "@/app/deck-actions";
import { Input } from "@/components/ui/input";
import type { DropSource } from "@/app/canvas-actions";
import { getDrag, setDrag } from "@/lib/drag";
import { dropSpec } from "@/lib/drop-spec";
import { useSlotFill } from "@/components/slot-dialog";
import { SaveDeckDialog, SaveSlideDialog } from "@/components/save-template-dialog";
import { fromDeckTemplate, fromSlideLayout } from "@ziffr/core/team-templates";
import type { DeckTemplateSummary } from "@ziffr/core/deck-templates";
import { fillText } from "@ziffr/core/placeholders";
import type { SlideBody, SlideShape, SlideTemplate } from "@ziffr/core/types";
import { DEFAULT_TEMPLATE, TEMPLATES, templatesFor } from "@/views/templates";
import { StoryEditor } from "@/components/story-editor";
import { widgetFromShape } from "@/decks/widget-shape";
import type { CanvasData, Group, Share, SlideDesign, TemplateId, Widget } from "@ziffr/core/types";
import { DeckMaster, setDeckExportMaster, SlideFrameUtil } from "@/decks/master";
import Link from "next/link";
import { DeckData, setDeckExportData, WIDGET_SHAPE, WidgetShapeUtil, type WidgetShape } from "@/decks/widget-shape";
import { type DeckSeed, LAYOUTS, type LayoutId, MARGIN, SLIDE_H, SLIDE_W, addSlide, contentAreas, orderedSlides, placeShapes, seedSlides, slideShapes, templateSlides } from "@/decks/layouts";
import { freeSpot } from "@/decks/placement";
import { exportPdf, exportPptx } from "@/decks/export";
import { SeriesProvider, useCanvasSeries, useEnsure } from "@/canvas/series-store";
import { keepContentLocal, LOCAL_ONLY_OVERRIDES } from "@/canvas/keep-local";
import { VersionsDialog } from "@/components/versions-dialog";
import { ShareDialog } from "@/components/share-dialog";
import { WhoCanSee } from "@/components/who-can-see";
import { ViewLinks } from "@/components/view-links";

const shapeUtils = [WidgetShapeUtil, SlideFrameUtil];
// Decks favour charts over bare numbers: a dropped metric lands as a line chart.
const DECK_TEMPLATE: TemplateId = "line";

type Props = { deck: { id: number; name: string; document: unknown; theme_id: number | null; footer: string | null }; data: CanvasData; saved: Widget[]; sharing: { shares: Share[]; groups: Group[]; ownerId: string; reveals: Record<string, string[]> } | null; seed?: DeckSeed | null;
  /** Made from a Deck Template (spec 0030): its slides with Slot numbers, and the Metrics that fill each Slot. */
  templateSeed?: { slides: SlideBody[]; fills: number[][] } | null;
  /** The viewer's own Deck Templates, which saving the deck as one may replace. */
  deckTemplates?: Pick<DeckTemplateSummary, "id" | "name" | "description" | "slots">[] };

/** The deck editor. The page sends the series of the deck's widgets; a widget placed since fetches its own
 * (ticket #125). */
export function DeckEditor(props: Props) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><DeckCanvas {...props} data={data} /></SeriesProvider>;
}

function DeckCanvas({ deck, data, saved, sharing, seed, templateSeed, deckTemplates = [] }: Props) {
  const ensure = useEnsure();
  // The newest data, for an export that first fetched what it lacked.
  const latest = useRef(data);
  latest.current = data;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState(deck.name);
  const [footer, setFooter] = useState<string | null>(deck.footer);
  const [themeId, setThemeId] = useState<number | null>(deck.theme_id);
  const theme = themeFor(data.themes, themeId);
  // What every slide shows comes from the deck's theme; the deck may have its own footer (GLOSSARY: Theme).
  const master = useMemo(() => slideDesign(theme, footer), [theme, footer]);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [busy, setBusy] = useState<null | "pptx" | "pdf">(null);
  const [, start] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masterRef = useRef<SlideDesign | null>(null);
  masterRef.current = master;
  // What onMount lays out a new deck from, read through a ref: onMount sets the editor up once, and a dependency on
  // them would set it up again (and listen twice) whenever the metrics change (#3).
  const firstLayout = useRef({ seed, templateSeed, data });
  firstLayout.current = { seed, templateSeed, data };

  // Read once: a new snapshot object on every render would make tldraw reload its store.
  const [snapshot] = useState(() => (deck.document ? ({ document: deck.document } as unknown as TLEditorSnapshot) : undefined));

  const onMount = useCallback(
    (ed: Editor) => {
      setEditor(ed);
      keepContentLocal(ed);
      if (process.env.NODE_ENV === "development") (window as unknown as { __deckEditor?: Editor }).__deckEditor = ed;
      ed.user.updateUserPreferences({ colorScheme: "light", locale: "en" }); // the app is English, whatever the browser says
      // A deck is set in clean type with solid lines, not tldraw's hand-drawn defaults.
      ed.setStyleForNextShapes(DefaultFontStyle, "sans");
      ed.setStyleForNextShapes(DefaultDashStyle, "solid");
      let seeded = false;
      if (!orderedSlides(ed).length) {
        // A new deck made from a dashboard or a Deck Template gets its slides laid out; any other starts with a title slide.
        const { seed, templateSeed, data: first } = firstLayout.current;
        const byId = (ids: number[]) => ids.map((mid) => first.metrics.find((m) => m.id === mid)!).filter(Boolean);
        const id = templateSeed
          ? templateSlides(ed, masterRef.current, fromDeckTemplate({ slides: templateSeed.slides }, templateSeed.fills, (txt, ids) => fillText(txt, byId(ids), first) ?? txt))
          : seed
            ? seedSlides(ed, masterRef.current, seed, WIDGET_SHAPE, (w) => w.title || first.metrics.find((m) => m.id === w.metric_ids[0])?.name || "")
            : addSlide(ed, "title", masterRef.current);
        seeded = Boolean(templateSeed);
        ed.zoomToBounds(ed.getShapePageBounds(id)!, { inset: 48 });
      } else {
        ed.zoomToBounds(ed.getShapePageBounds(orderedSlides(ed)[0].id)!, { inset: 48 });
      }
      const save = () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          setStatus("saving");
          // Plain JSON only: tldraw records can hold class instances that server actions cannot carry.
          saveDeck(deck.id, JSON.parse(JSON.stringify(getSnapshot(ed.store).document)))
            .then(() => setStatus("saved"))
            .catch(() => setStatus("unsaved"));
        }, 800);
      };
      // Slides laid out from a Deck Template are the deck now: kept at once, so opening it again shows the same.
      if (seeded) save();
      // Autosave the document (not the camera or selection) a moment after each user change.
      return ed.store.listen(
        () => {
          setStatus("unsaved");
          save();
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
  // tldraw draws its own text and arrows: a dark theme needs its dark mode so "black" reads light.
  useEffect(() => {
    if (editor && theme) editor.user.updateUserPreferences({ colorScheme: isDark(theme.tokens) ? "dark" : "light" });
  }, [editor, theme]);
  useEffect(() => {
    setDeckExportData(data);
    return () => {
      setDeckExportData(null);
    };
  }, [data]);

  /** Turn a Pool item into widget props. */
  const slotFill = useSlotFill(data);
  const widgetProps = (s: DropSource) => {
    const d = dropSpec(s, data, saved, DECK_TEMPLATE);
    if (!d) return null;
    const size = d.grid ? { w: Math.min(SLIDE_W - 2 * MARGIN, Math.max(320, d.grid.w * 80)), h: Math.min(SLIDE_H - 2 * MARGIN, Math.max(200, d.grid.h * 44)) } : { w: 560, h: 320 };
    return { template: d.template, metricIds: d.metricIds, settings: JSON.stringify(d.settings), title: d.title, ...size };
  };

  /** Place a widget at a page point, inside the slide under it (or the first slide). */
  /** Templates ask for their slots first; everything else lands at once. */
  const place = async (s: DropSource, page?: { x: number; y: number }) => {
    const c = await slotFill.complete(s);
    if (c) placeNow(c, page);
  };
  const placeNow = (s: DropSource, page?: { x: number; y: number }) => {
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
        if (page) {
          // Dropped: where the pointer is, kept on the slide.
          const x = Math.min(Math.max(page.x - fb.x - props.w / 2, 0), SLIDE_W - props.w);
          const y = Math.min(Math.max(page.y - fb.y - props.h / 2, 0), SLIDE_H - props.h);
          editor.createShape<WidgetShape>({ id, type: WIDGET_SHAPE, parentId: target.id, x, y, props });
        } else {
          // Added with "+": the first free spot in the content area, beside what is on the slide, never on top (#13).
          const taken = editor.getSortedChildIdsForParent(target.id).map((child) => {
            const b = editor.getShapePageBounds(child)!;
            return { x: b.x - fb.x, y: b.y - fb.y, w: b.w, h: b.h };
          });
          const spot = freeSpot(contentAreas()[0], taken, { w: props.w, h: props.h }, { w: SLIDE_W, h: SLIDE_H });
          editor.createShape<WidgetShape>({ id, type: WIDGET_SHAPE, parentId: target.id, x: spot.x, y: spot.y, props: { ...props, w: spot.w, h: spot.h } });
        }
      } else {
        editor.createShape<WidgetShape>({ id, type: WIDGET_SHAPE, x: page?.x ?? 0, y: page?.y ?? 0, props });
      }
      editor.select(id);
    });
  };

  const [layoutShapes, setLayoutShapes] = useState<SlideShape[] | null>(null);
  const [deckSlides, setDeckSlides] = useState<SlideShape[][] | null>(null);
  /** A team slide layout: its slots filled, its words filled in from today's data, as a new slide at the end. */
  const newSlideFrom = async (t: SlideTemplate) => {
    if (!editor) return;
    const fills = t.slots.length ? await slotFill.ask(t) : [];
    if (!fills) return;
    const byId = (ids: number[]) => ids.map((id) => data.metrics.find((m) => m.id === id)!).filter(Boolean);
    const shapes = fromSlideLayout(t.body, fills, (txt, ids) => fillText(txt, byId(ids), data) ?? txt);
    const id = addSlide(editor, "blank", master);
    placeShapes(editor, id, shapes);
    editor.select(id);
    editor.zoomToBounds(editor.getShapePageBounds(id)!, { inset: 48, animation: { duration: 220 } });
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
      if (kind === "pptx") {
        // Slides not on screen were never drawn, so a widget there may still lack its series: fetch them first.
        const ids = editor.store.allRecords().flatMap((r) => (r.typeName === "shape" && r.type === WIDGET_SHAPE ? (r as WidgetShape).props.metricIds : []));
        if (ensure) { await ensure([...new Set(ids)]); await new Promise((r) => setTimeout(r, 0)); }
        await exportPptx(editor, latest.current, name, master, theme);
      }
      else await exportPdf(editor, name);
      // For the Audit Log; a failure to note it never spoils the export the person already has.
      noteDeckExport(deck.id, kind).catch(() => {});
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
        {/* At least room for a name of a few words: the buttons wrap to the next line before the name is cut. */}
        <label className="min-w-[min(100%,20rem)] flex-1">
          <span className="sr-only">Deck name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => start(() => renameDeck(deck.id, name))}
            className="w-full max-w-xl rounded-[var(--radius-input)] bg-transparent px-1 text-[length:var(--text-xl)] font-semibold tracking-[-0.03em] outline-none hover:bg-muted focus-visible:bg-card focus-visible:outline-2 focus-visible:outline-ring"
          />
        </label>
        <span className="text-xs text-muted-foreground" aria-live="polite">{status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Unsaved changes"}</span>
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
            {data.templates.some((t) => t.kind === "slide") && (
              <DropdownMenuGroup>
                <DropdownMenuLabel>Team layouts</DropdownMenuLabel>
                {data.templates.filter((t): t is SlideTemplate => t.kind === "slide").map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => setTimeout(() => newSlideFrom(t), 0)}>
                    <LayoutTemplate aria-hidden />
                    <span className="flex flex-col">
                      <span>{t.name}</span>
                      <span className="text-xs text-muted-foreground">{t.description || `${t.slots.length} slot${t.slots.length === 1 ? "" : "s"}`}, by {t.owner_id === data.viewer ? "you" : data.people.find((p) => p.id === t.owner_id)?.name.split(" ")[0]}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {editor && <GroupButtons editor={editor} />}
        <ThemePicker themes={data.themes} value={themeId} onChange={async (id) => { setThemeId(id); return setDeckTheme(deck.id, id); }} />
        <WhoCanSee type="deck" id={deck.id} people={data.people} />
        {sharing && <ViewLinks type="deck" id={deck.id} />}
        {sharing && <ShareDialog objectType="deck" objectId={deck.id} name={name} ownerId={sharing.ownerId} people={data.people} shares={sharing.shares} groups={sharing.groups} reveals={sharing.reveals} />}
        <VersionsDialog type="deck" id={deck.id} people={data.people} reload="page" />
        <Button variant="outline" disabled={!editor} onClick={() => editor && setDeckSlides(orderedSlides(editor).map((sl) => slideShapes(editor, sl.id)))}><LayoutTemplate aria-hidden /> Save as Deck Template…</Button>
        <Link href={`/decks/${deck.id}/present`} className={buttonVariants({ variant: "outline" })}><MonitorPlay aria-hidden /> Present</Link>
        <Button variant="outline" onClick={() => run("pdf")} disabled={!editor || busy !== null}><Printer aria-hidden /> {busy === "pdf" ? "Preparing…" : "PDF"}</Button>
        <Button onClick={() => run("pptx")} disabled={!editor || busy !== null}><FileDown aria-hidden /> {busy === "pptx" ? "Exporting…" : "Export PowerPoint"}</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="order-2 space-y-4 lg:order-1">
          <Pool data={data} saved={saved} onAdd={(s) => place(s)} hint="Drag onto a slide, or click + to add to the slide in view." />
          {slotFill.dialog}
          {editor && <SelectionPanel editor={editor} data={data} onSaveLayout={setLayoutShapes} />}
          <label className="stock block rounded-[var(--radius-card)] p-3 text-sm">
            <span className="mb-1 block text-xs font-medium">Footer on every slide</span>
            <Input
              defaultValue={footer ?? ""}
              placeholder={theme?.slides.footer || "No footer"}
              onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== footer) { setFooter(v); start(() => setDeckFooter(deck.id, v)); } }}
            />
            <span className="mt-1 block text-xs text-muted-foreground">Empty uses the theme&rsquo;s footer. Logo, slide numbers and type come from the theme.</span>
          </label>
          {layoutShapes && <SaveSlideDialog deckId={deck.id} shapes={layoutShapes} data={data} onClose={() => setLayoutShapes(null)} />}
          {deckSlides && <SaveDeckDialog deckId={deck.id} slides={deckSlides} data={data} existing={deckTemplates} onClose={() => setDeckSlides(null)} />}
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
          <ThemeScope theme={theme} className="h-full w-full">
            <Tldraw shapeUtils={shapeUtils} snapshot={snapshot} overrides={LOCAL_ONLY_OVERRIDES} components={DECK_COMPONENTS} onMount={onMount} />
          </ThemeScope>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Slides export in reading order, left to right and top to bottom. Line and bar widgets become editable PowerPoint charts; gauges and analyses go in as images.
      </p>
      </DeckMaster.Provider>
    </DeckData.Provider>
  );
}

/** tldraw's style panel, only while something is selected or a drawing tool is chosen: open over a slide nobody is
 * styling, it covers the slide's top right corner (#12). */
function StylePanelWhenStyling(props: TLUiStylePanelProps) {
  const editor = useEditor();
  const styling = useValue("styling", () => editor.getSelectedShapeIds().length > 0 || !["select", "hand"].includes(editor.getCurrentToolId()), [editor]);
  return styling ? <DefaultStylePanel {...props} /> : null;
}

/** The tldraw parts the deck editor replaces; a constant, so tldraw does not rebuild its UI on every render. */
const DECK_COMPONENTS: TLComponents = { StylePanel: StylePanelWhenStyling };

/** Group and Ungroup for the selection: tldraw does both with Ctrl+G and its context menu, which few people find. */
function GroupButtons({ editor }: { editor: Editor }) {
  // Only shapes on one slide group together: a group across slides would leave both, and a slide in a group would
  // no longer count as a slide.
  const canGroup = useValue("can group", () => {
    const sel = editor.getSelectedShapes();
    return sel.length >= 2 && sel.every((s) => s.type !== "frame" && s.parentId === sel[0].parentId);
  }, [editor]);
  const canUngroup = useValue("can ungroup", () => editor.getSelectedShapes().some((s) => s.type === "group"), [editor]);
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  return (
    <>
      {/* The toolbar is full: below very wide screens the buttons show their icon, named by aria-label. */}
      <Button variant="outline" disabled={!canGroup} aria-label="Group" title={`Group: keep the selected shapes together (${mod}G)`} onClick={() => editor.groupShapes(editor.getSelectedShapeIds())}>
        <GroupIcon aria-hidden /> <span className="hidden 2xl:inline">Group</span>
      </Button>
      <Button variant="outline" disabled={!canUngroup} aria-label="Ungroup" title={`Ungroup: split the selected group (${mod}Shift+G)`} onClick={() => editor.ungroupShapes(editor.getSelectedShapes().filter((s) => s.type === "group").map((s) => s.id))}>
        <Ungroup aria-hidden /> <span className="hidden 2xl:inline">Ungroup</span>
      </Button>
    </>
  );
}

/** Restyle the selected widget, the same templates as on a dashboard. */
function SelectionPanel({ editor, data, onSaveLayout }: { editor: Editor; data: CanvasData; onSaveLayout: (shapes: SlideShape[]) => void }) {
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
          Hide logo, footer and number on this slide
        </label>
        <p className="mt-1.5 text-xs text-muted-foreground">For full-bleed title or image slides.</p>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => {
            onSaveLayout(slideShapes(editor, slide.id));
          }}
        >
          <LayoutTemplate aria-hidden /> Save slide as layout…
        </Button>
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
      <p className="mt-1.5 text-xs text-muted-foreground">Line, bars and ranked-bar Findings export as native, editable charts.</p>
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

