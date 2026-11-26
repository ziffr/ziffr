"use client";
import "tldraw/tldraw.css";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ThemeScope } from "@/components/theme-scope";
import { ThemePicker } from "@/components/theme-picker";
import { setDeckTheme } from "@/app/theme-actions";
import { isDark, slideDesign, themeFor } from "@ziffr/core/themes";
import { tokensForViewer } from "@ziffr/core/theme-dark";
import { useViewerDark } from "@/lib/use-viewer-dark";
import { toast } from "sonner";
import { isActionError } from "@/lib/action-error";
import { ChevronDown, Eye, FileDown, Group as GroupIcon, History, LayoutTemplate, Link2, MonitorPlay, MoreHorizontal, Palette, Plus, Presentation, Printer, Trash2, Ungroup } from "lucide-react";
import { createShapeId, DefaultDashStyle, DefaultFontStyle, DefaultStylePanel, getSnapshot, Tldraw, useEditor, useValue, type Editor, type TLComponents, type TLEditorSnapshot, type TLShapeId, type TLUiStylePanelProps } from "tldraw";
import { Pool } from "@/components/pool";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { noteDeckExport, readDeckNumbers, renameDeck, saveDeck, setDeckFooter } from "@/app/deck-actions";
import { doneAddingToDeck } from "@/app/convert-actions";
import { DeleteDeckDialog } from "./delete-deck";
import { Input } from "@/components/ui/input";
import type { DropSource } from "@/app/canvas-actions";
import { getDrag, setDrag } from "@/lib/drag";
import { dropSpec } from "@/lib/drop-spec";
import { useSlotFill } from "@/components/slot-dialog";
import { SaveDeckDialog, SaveSlideDialog } from "@/components/save-template-dialog";
import { fromDeckTemplate, fromSlideLayout } from "@ziffr/core/team-templates";
import type { DeckTemplateSummary } from "@ziffr/core/deck-templates";
import type { DeckAddition } from "@ziffr/core/deck-additions";
import type { SnapshotSlides } from "@ziffr/core/deck-snapshots";
import { SNAPSHOT_PART_SHAPE, withoutKeptNumbers } from "@ziffr/core/snapshot-parts";
import { SnapshotPartShapeUtil } from "@/decks/kept/part-shape";
import { KeptNumbers, keptOf, setDeckExportKept, useDeckKept } from "@/decks/kept/kept-store";
import { onSlide, type Kept } from "@/decks/kept/kept-drawing";
import { LiveNumbersNote } from "@/decks/kept/live-note";
import { fillText } from "@ziffr/core/placeholders";
import type { SlideBody, SlideShape, SlideTemplate } from "@ziffr/core/types";
import { DEFAULT_TEMPLATE, TEMPLATES, templatesFor } from "@/views/templates";
import { StoryEditor } from "@/components/story-editor";
import { widgetFromShape } from "@/decks/widget-shape";
import type { CanvasData, Group, Share, SlideDesign, TemplateId, Widget } from "@ziffr/core/types";
import { DeckMaster, setDeckExportMaster, SlideFrameUtil } from "@/decks/master";
import { ElementPanel } from "@/decks/elements/element-panel";
import { ElementMenu } from "@/decks/elements/element-menu";
import Link from "next/link";
import { DeckData, setDeckExportData, WIDGET_SHAPE, WidgetShapeUtil, type WidgetShape } from "@/decks/widget-shape";
import { type DeckSeed, LAYOUTS, type LayoutId, MARGIN, SLIDE_H, SLIDE_W, addSlide, contentAreas, orderedSlides, placeShapes, seedSlides, slideShapes, snapshotSlides, templateSlides } from "@/decks/layouts";
import { freeSpot } from "@/decks/placement";
import { exportPdf, exportPptx, exportSeriesIds } from "@/decks/export";
import { SeriesProvider, useCanvasSeries, useEnsure } from "@/canvas/series-store";
import { keepContentLocal, LOCAL_ONLY_OVERRIDES } from "@/canvas/keep-local";
import { useOpenVersions, VersionsSheetOpen } from "@/components/versions-sheet";
import { ShareSheet } from "@/components/share-sheet";
import { useShowWhoCanSee } from "@/components/who-can-see";
import { useShowViewLinks } from "@/components/view-links";

const shapeUtils = [WidgetShapeUtil, SnapshotPartShapeUtil, SlideFrameUtil];
// Decks favour charts over bare numbers: a dropped metric lands as a line chart.
const DECK_TEMPLATE: TemplateId = "line";

type Props = { deck: { id: number; name: string; document: unknown; theme_id: number | null; footer: string | null }; data: CanvasData; saved: Widget[]; sharing: { shares: Share[]; groups: Group[]; ownerId: string; canInvite?: boolean; reveals: Record<string, string[]> } | null; seed?: DeckSeed | null;
  /** Made from a Deck Template (spec 0030): its slides with Slot numbers, and the Metrics that fill each Slot. */
  templateSeed?: { slides: SlideBody[]; fills: number[][] } | null;
  /** The viewer's own Deck Templates, which saving the deck as one may replace. */
  deckTemplates?: Pick<DeckTemplateSummary, "id" | "name" | "description" | "slots">[];
  /** A widget added from its menu (ticket #1), checked by the core: placed once on its slide or a new one. */
  addition?: DeckAddition | null;
  /** A Snapshot being added (spec 0061), checked by the core: its slides are placed once at the end. */
  snapshot?: SnapshotSlides | null;
  /** The Snapshot numbers the person gets for what the slides keep. */
  kept: Kept };

/** The deck editor. The page sends the series of the deck's widgets; a widget placed since fetches its own
 * (ticket #125). */
export function DeckEditor(props: Props) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><DeckCanvas {...props} data={data} /></SeriesProvider>;
}

function DeckCanvas({ deck, data, saved, sharing, seed, templateSeed, deckTemplates = [], addition = null, snapshot: adding = null, kept: sent }: Props) {
  const ensure = useEnsure();
  // The newest data, for an export that first fetched what it lacked.
  const latest = useRef(data);
  latest.current = data;
  const [editor, setEditor] = useState<Editor | null>(null);
  const { kept, refresh } = useDeckKept(editor, sent, readDeckNumbers);
  const [name, setName] = useState(deck.name);
  const [footer, setFooter] = useState<string | null>(deck.footer);
  const [themeId, setThemeId] = useState<number | null>(deck.theme_id);
  const theme = themeFor(data.themes, themeId);
  // What every slide shows comes from the deck's theme; the deck may have its own footer (GLOSSARY: Theme).
  // The slides follow the viewer's dark Appearance unless the Theme says "always as designed" (#583); the PowerPoint and
  // PDF exports below always use the designed colours.
  const viewerDark = useViewerDark();
  const shown = useMemo(() => (theme ? { ...theme, tokens: tokensForViewer(theme.tokens, viewerDark) } : theme), [theme, viewerDark]);
  const master = useMemo(() => slideDesign(shown, footer), [shown, footer]);
  const designedMaster = useMemo(() => slideDesign(theme, footer), [theme, footer]);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [busy, setBusy] = useState<null | "pptx" | "pdf">(null);
  const [, start] = useTransition();
  // The dialog a ⋯ menu entry opened; each is opened after the menu has closed and returned focus.
  const [dialog, setDialog] = useState<null | "theme" | "delete">(null);
  // Who can see this and View links open in the side panel, after the menu has closed.
  const showWho = useShowWhoCanSee(data.people);
  const showLinks = useShowViewLinks();
  const openVersions = useOpenVersions();
  const show = (d: "theme" | "delete") => () => setTimeout(() => setDialog(d), 0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const masterRef = useRef<SlideDesign | null>(null);
  masterRef.current = master;
  // What onMount lays out a new deck from, read through a ref: onMount sets the editor up once, and a dependency on
  // them would set it up again (and listen twice) whenever the metrics change (#3).
  const firstLayout = useRef({ seed, templateSeed, data, addition, adding });
  firstLayout.current = { seed, templateSeed, data, addition, adding };

  // A widget added from its menu is placed once, even if the editor mounts twice.
  const placed = useRef(false);
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
      // A new deck for a Snapshot's numbers starts with the Snapshot's own slides, not a title slide of its own.
      const fromSnapshot = firstLayout.current.adding && !placed.current;
      if (!orderedSlides(ed).length && !fromSnapshot) {
        // A new deck made from a dashboard or a Deck Template gets its slides laid out; any other starts with a title slide.
        const { seed, templateSeed, data: first } = firstLayout.current;
        const byId = (ids: number[]) => ids.map((mid) => first.metrics.find((m) => m.id === mid)!).filter(Boolean);
        const id = templateSeed
          ? templateSlides(ed, masterRef.current, fromDeckTemplate({ slides: templateSeed.slides }, templateSeed.fills, (txt, ids) => fillText(txt, byId(ids), first) ?? txt), templateSeed.slides.map((s) => Boolean(s.cover)))
          : seed
            ? seedSlides(ed, masterRef.current, seed, WIDGET_SHAPE, (w) => w.title || first.metrics.find((m) => m.id === w.metric_ids[0])?.name || "")
            : addSlide(ed, "title", masterRef.current);
        seeded = Boolean(templateSeed);
        ed.zoomToBounds(ed.getShapePageBounds(id)!, { inset: 48 });
      } else if (orderedSlides(ed).length) {
        ed.zoomToBounds(ed.getShapePageBounds(orderedSlides(ed)[0].id)!, { inset: 48 });
      }
      const save = () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          setStatus("saving");
          // Plain JSON only: tldraw records can hold class instances that server actions cannot carry.
          saveDeck(deck.id, JSON.parse(JSON.stringify(getSnapshot(ed.store).document)))
            .then((r) => {
              // A refusal (in the demo: words the demo does not take, a deck it keeps as it is) is answered as words, not thrown.
              if (isActionError(r)) { setStatus("unsaved"); toast.error("Not saved", { id: "deck-save", description: r.error }); } else setStatus("saved");
            })
            .catch(() => setStatus("unsaved"));
        }, 800);
      };
      // A widget added from its menu goes on its slide, or a new one at the end; a Snapshot's slides go at the end. The
      // deck opens there.
      const { addition: added, adding: fromMenu } = firstLayout.current;
      if ((added || fromMenu) && !placed.current) {
        placed.current = true;
        const slide = added ? placeAddition(ed, masterRef.current, added, firstLayout.current.data) : snapshotSlides(ed, masterRef.current, fromMenu!);
        if (slide) {
          ed.select(slide);
          ed.zoomToBounds(ed.getShapePageBounds(slide)!, { inset: 48 });
        }
        seeded = true;
        // Placed once: the address no longer asks for it, so reloading adds nothing more. Back still leads where it
        // came from.
        window.history.replaceState(null, "", `/decks/${deck.id}`);
        // Used once: the request is cleared, so opening the same address again adds nothing.
        doneAddingToDeck().catch(() => {});
        toast.success("Added to the deck", { description: addedWords(fromMenu), action: { label: "Go back", onClick: () => window.history.back() } });
      }
      // Slides laid out from a Deck Template, or a widget added, are the deck now: kept at once.
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
    setDeckExportMaster(designedMaster);
    return () => {
      setDeckExportMaster(null);
    };
  }, [designedMaster]);
  // tldraw draws its own text and arrows: a dark theme needs its dark mode so "black" reads light.
  useEffect(() => {
    if (editor && theme) editor.user.updateUserPreferences({ colorScheme: isDark(shown!.tokens) ? "dark" : "light" });
  }, [editor, theme, shown]);
  useEffect(() => {
    setDeckExportData(data);
    return () => {
      setDeckExportData(null);
    };
  }, [data]);

  useEffect(() => {
    setDeckExportKept(kept);
    return () => {
      setDeckExportKept(null);
    };
  }, [kept]);

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

  const [layout, setLayout] = useState<{ shapes: SlideShape[]; note?: string } | null>(null);
  const [deckSlides, setDeckSlides] = useState<{ slides: SlideShape[][]; note?: string } | null>(null);
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
      // Asked again for the file: what the person may see now, not when the page opened.
      const numbers = await refresh();
      setDeckExportKept(numbers);
      if (kind === "pptx") {
        // Slides not on screen were never drawn, so a widget there may still lack its series: fetch them first.
        if (ensure) { await ensure(exportSeriesIds(editor)); await new Promise((r) => setTimeout(r, 0)); }
        await exportPptx(editor, latest.current, name, designedMaster, theme, numbers);
      }
      else await exportPdf(editor, name, latest.current, numbers);
      // For the Audit Log; a failure to note it never spoils the export the person already has.
      noteDeckExport(deck.id, kind).catch(() => {});
      toast.success(kind === "pptx" ? "PowerPoint downloaded" : "PDF ready to print", { description: numbers.asked.length ? "Slides that keep numbers show their Snapshot's; other values are today's." : "Values are a snapshot of today. The deck in Ziffr stays live." });
    } catch (e) {
      console.error(e);
      toast.error("Export failed", { description: "One slide could not be rendered. Try again, or remove the last thing you added." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DeckData.Provider value={data}>
      <KeptNumbers.Provider value={kept}>
      <DeckMaster.Provider value={master}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Presentation aria-hidden className="size-5 text-muted-foreground max-sm:hidden" />
        {/* At least room for a name of a few words: the buttons wrap to the next line before the name is cut. */}
        <label className="min-w-[min(100%,20rem)] flex-1">
          <span className="sr-only">Deck name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => start(async () => { const r = await renameDeck(deck.id, name); if (isActionError(r)) toast.error("Not renamed", { description: r.error }); })}
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
        <ElementMenu editor={editor} data={data} />
        {/* On a phone the note above the editor carries this button. */}
        <Link href={`/decks/${deck.id}/present`} className={buttonVariants({ variant: "outline", className: "max-sm:hidden" })}><MonitorPlay aria-hidden /> Present</Link>
        {sharing && <ShareSheet objectType="deck" objectId={deck.id} name={name} ownerId={sharing.ownerId} people={data.people} shares={sharing.shares} groups={sharing.groups} reveals={sharing.reveals} canInvite={sharing.canInvite} />}
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonVariants()} disabled={!editor || busy !== null}><FileDown aria-hidden /> {busy === "pptx" ? "Exporting…" : busy === "pdf" ? "Preparing…" : "Export"} <ChevronDown aria-hidden /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => run("pptx")}><FileDown aria-hidden /> PowerPoint</DropdownMenuItem>
            <DropdownMenuItem onClick={() => run("pdf")}><Printer aria-hidden /> PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="More for this deck" title="More for this deck" className={buttonVariants({ variant: "outline", size: "icon" })}><MoreHorizontal aria-hidden /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={show("theme")}><Palette aria-hidden /> Theme…</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTimeout(() => showWho("deck", deck.id), 0)}><Eye aria-hidden /> Who can see this</DropdownMenuItem>
            {sharing && <DropdownMenuItem onClick={() => setTimeout(() => showLinks("deck", deck.id, undefined, editor ? withoutKeptNumbers(getSnapshot(editor.store).document).left : 0), 0)}><Link2 aria-hidden /> View links…</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => setTimeout(() => openVersions(true), 0)}><History aria-hidden /> Versions</DropdownMenuItem>
            {sharing && (
              <DropdownMenuItem disabled={!editor || status !== "saved"} title={status === "saved" ? undefined : "Wait until the deck is saved"} onClick={() => editor && setDeckSlides({ slides: orderedSlides(editor).map((sl) => slideShapes(editor, sl.id)), note: partsNote(editor) })}><LayoutTemplate aria-hidden /> Save as Deck Template…</DropdownMenuItem>
            )}
            {sharing && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={show("delete")}><Trash2 aria-hidden /> Delete…</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {dialog === "delete" && sharing && <DeleteDeckDialog deckId={deck.id} name={name} onClose={() => setDialog(null)} />}
        {dialog === "theme" && (
          <Dialog open onOpenChange={(o) => { if (!o) setDialog(null); }}>
            <DialogContent>
              <DialogTitle>Theme</DialogTitle>
              <DialogDescription>The colours and fonts this deck is drawn in. Ziffr&rsquo;s own screens keep their look.</DialogDescription>
              <ThemePicker themes={data.themes} value={themeId} onChange={async (id) => { setThemeId(id); return setDeckTheme(deck.id, id); }} />
            </DialogContent>
          </Dialog>
        )}
        <VersionsSheetOpen type="deck" id={deck.id} people={data.people} reload="page" />
      </div>

      {editor && <LiveNumbersNote editor={editor} />}

      {/* The one column may shrink on a phone: without the minimum of 0 the Pool and the canvas set the page's width. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="order-2 space-y-4 lg:order-1">
          {/* Above the Pool, which stays in view while the column scrolls: below it a long panel would slide under. */}
          {editor && <ElementPanel editor={editor} data={data} />}
          <Pool data={data} saved={saved} onAdd={(s) => place(s)} hint="Drag onto a slide, or click + to add to the slide in view." />
          {slotFill.dialog}
          {editor && <SelectionPanel editor={editor} data={data} onSaveLayout={(slide) => setLayout({ shapes: slideShapes(editor, slide), note: partsNote(editor, slide) })} />}
          {editor && <GroupPanel editor={editor} />}
          <label className="stock block rounded-[var(--radius-card)] p-3 text-sm">
            <span className="mb-1 block text-xs font-medium">Footer on every slide</span>
            <Input
              defaultValue={footer ?? ""}
              placeholder={theme?.slides.footer || "No footer"}
              onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== footer) { setFooter(v); start(async () => { const r = await setDeckFooter(deck.id, v); if (isActionError(r)) toast.error("Footer not saved", { description: r.error }); }); } }}
            />
            <span className="mt-1 block text-xs text-muted-foreground">Empty uses the theme&rsquo;s footer. Logo, slide numbers and type come from the theme.</span>
          </label>
          {layout && <SaveSlideDialog deckId={deck.id} {...layout} data={data} onClose={() => setLayout(null)} />}
          {deckSlides && <SaveDeckDialog deckId={deck.id} {...deckSlides} data={data} existing={deckTemplates} onClose={() => setDeckSlides(null)} />}
        </div>
        <div
          // Shorter on a phone: a finger on the canvas moves the slides, so the page needs room around it to scroll.
          className="order-1 h-[calc(100vh-13rem)] min-h-[32rem] overflow-hidden rounded-[var(--radius-card)] border border-border max-sm:h-[24rem] max-sm:min-h-0 lg:order-2"
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
      </KeptNumbers.Provider>
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

/** Group and Ungroup for the selection, in the side panel while a selection can use them: tldraw does both with Ctrl+G
 * and its context menu, which few people find. */
function GroupPanel({ editor }: { editor: Editor }) {
  // Only shapes on one slide group together: a group across slides would leave both, and a slide in a group would
  // no longer count as a slide.
  const canGroup = useValue("can group", () => {
    const sel = editor.getSelectedShapes();
    return sel.length >= 2 && sel.every((s) => s.type !== "frame" && s.parentId === sel[0].parentId);
  }, [editor]);
  const canUngroup = useValue("can ungroup", () => editor.getSelectedShapes().some((s) => s.type === "group"), [editor]);
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  if (!canGroup && !canUngroup) return null;
  return (
    <div className="stock flex gap-2 rounded-[var(--radius-card)] p-3" role="group" aria-label="Selection">
      <Button variant="outline" className="flex-1" disabled={!canGroup} title={`Keep the selected shapes together (${mod}G)`} onClick={() => editor.groupShapes(editor.getSelectedShapeIds())}>
        <GroupIcon aria-hidden /> Group
      </Button>
      <Button variant="outline" className="flex-1" disabled={!canUngroup} title={`Split the selected group (${mod}Shift+G)`} onClick={() => editor.ungroupShapes(editor.getSelectedShapes().filter((s) => s.type === "group").map((s) => s.id))}>
        <Ungroup aria-hidden /> Ungroup
      </Button>
    </div>
  );
}

/** Restyle the selected widget, the same templates as on a dashboard. */
function SelectionPanel({ editor, data, onSaveLayout }: { editor: Editor; data: CanvasData; onSaveLayout: (slide: TLShapeId) => void }) {
  const slide = useValue("selected slide", () => {
    const s = editor.getOnlySelectedShape();
    return s && s.type === "frame" ? s : null;
  }, [editor]);
  const shape = useValue("selected widget", () => {
    const s = editor.getOnlySelectedShape();
    return s && s.type === WIDGET_SHAPE ? (s as WidgetShape) : null;
  }, [editor]);
  const ensure = useEnsure();
  // Read from the editor prop: this panel stands outside the canvas, where tldraw's own hooks have no editor.
  const keeps = useValue("selected kept shape", () => (shape ? keptOf(editor).get(shape.id) : undefined), [editor, shape]);
  const numbers = useContext(KeptNumbers);
  // On a slide that keeps numbers the panel reads the Snapshot's too, never the live ones.
  const on = onSlide(keeps, numbers, data, {});
  const shownData = "words" in on ? null : on.data;
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
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(slide.meta?.cover)}
            onChange={(e) => editor.updateShape({ id: slide.id, type: "frame", meta: { ...slide.meta, cover: e.target.checked } })}
            className="size-4 accent-[var(--color-ink)]"
          />
          Cover slide
        </label>
        <p className="mt-1.5 text-xs text-muted-foreground">A cover shows no logo, footer or number and is not counted in page numbers.</p>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => onSaveLayout(slide.id)}
        >
          <LayoutTemplate aria-hidden /> Save slide as layout…
        </Button>
      </div>
    );
  }
  const kind = shape ? TEMPLATES[shape.props.template as TemplateId]?.kind : null;
  if (!shape || (kind !== "metric" && kind !== "story")) return null;
  const metric = shownData?.metrics.find((x) => x.id === shape.props.metricIds[0]);
  const hasBreakdown = !!metric && Object.keys(shownData!.breakdowns[metric.id] ?? {}).length > 0;
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
          {/* Nothing fetches live series beside a Snapshot's numbers. */}
          <SeriesProvider ensure={keeps ? null : ensure}>
            <StoryEditor
              key={shape.id}
              widget={widgetFromShape(shape)}
              data={shownData!}
              m={metric}
              onSave={(settings) => editor.updateShape<WidgetShape>({ id: shape.id, type: WIDGET_SHAPE, props: { settings: JSON.stringify(settings) } })}
            />
          </SeriesProvider>
        </div>
      )}
    </div>
  );
}


/** What a layout or a Deck Template of the deck (or of one slide) leaves behind: it keeps no numbers (spec 0061). */
function partsNote(editor: Editor, slide?: TLShapeId) {
  const parts = editor.getCurrentPageShapes().filter((s) => s.type === SNAPSHOT_PART_SHAPE && (!slide || editor.getShapeAncestors(s.id).some((a) => a.id === slide)));
  return parts.length ? "Snapshot Parts are left out: a template keeps no numbers. Its widgets draw live ones." : undefined;
}

/** What is said once something was added to the deck from a menu elsewhere. */
function addedWords(snapshot: SnapshotSlides | null) {
  if (!snapshot) return "It is a copy: changes here leave the original as it is.";
  const left = snapshot.leftOut === 0 ? "" : snapshot.leftOut === 1 ? " One part is left out: you may not see it." : ` ${snapshot.leftOut} parts are left out: you may not see them.`;
  return `Its numbers never change, and each person sees them only if they may open the Snapshot.${left}`;
}

/** Places a widget added from its menu (ticket #1): on its slide at the first free spot, never on top of what is
 * there, or on a new slide at the end titled after it. Answers the slide. */
function placeAddition(ed: Editor, master: SlideDesign | null, added: DeckAddition, data: CanvasData) {
  const w = added.widget;
  const title = w.title || data.metrics.find((m) => m.id === w.metric_ids[0])?.name || "";
  const existing = added.slide ? orderedSlides(ed).find((f) => f.id === added.slide) : undefined;
  const slide = existing?.id ?? addSlide(ed, "title-content", master, { title });
  const area = contentAreas()[0];
  const fb = ed.getShapePageBounds(slide)!;
  const taken = existing ? ed.getSortedChildIdsForParent(slide).map((child) => {
    const b = ed.getShapePageBounds(child)!;
    return { x: b.x - fb.x, y: b.y - fb.y, w: b.w, h: b.h };
  }) : [];
  const spot = existing ? freeSpot(area, taken, { w: 560, h: 320 }, { w: SLIDE_W, h: SLIDE_H }) : area;
  ed.createShape<WidgetShape>({ id: createShapeId(), type: WIDGET_SHAPE, parentId: slide, x: spot.x, y: spot.y, props: { w: spot.w, h: spot.h, template: w.template, metricIds: w.metric_ids, settings: JSON.stringify(w.settings ?? {}), title: existing ? w.title ?? "" : "" } });
  return slide;
}
