"use client";
import { RecipeBudgetProvider } from "@/views/recipe-budget";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { inUse } from "@ziffr/core/metric-row";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { BookOpen, Check, Eye, Home, Pin, LayoutDashboard, LayoutGrid, LayoutTemplate, MonitorPlay, MoreHorizontal, Pencil, Plus, Presentation, Users } from "lucide-react";
import { NewDashboardDialog } from "@/components/new-dashboard-dialog";
import { SaveDashboardTemplateDialog } from "@/components/save-dashboard-template-dialog";
import type { DashboardTemplateSummary } from "@ziffr/core/dashboard-templates";
import { GridStage, scaledGrid, useAddWidget } from "@/components/dashboard-add";
import { fitGrid, FEW_WIDGETS, GRID, ONE_COLUMN_BELOW } from "@/lib/dashboard-grid";
import { WidgetFrame } from "@/components/widget-frame";
import { frameTitle } from "@/components/read-only-frame";
import { OpenLarge } from "@/components/open-large";
import { LargerScreenNote } from "@/components/larger-screen-note";
import { widgetMetrics } from "@/views/widget-body";
import { largeHref } from "@/lib/open-large";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { placeWidget, saveDashboardText, saveLayout, type DropSource } from "@/app/canvas-actions";
import { getDrag } from "@/lib/drag";
import { noteRows } from "@ziffr/core/note-widget";
import { noteTextOf } from "@/views/note-view";
import { TEMPLATES, DEFAULT_TEMPLATE, templateOf } from "@/views/templates";
import type { CanvasData, Share, Widget } from "@ziffr/core/types";
import type { DashboardAccess } from "@/lib/access";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSlotFill } from "@/components/slot-dialog";
import { RequestAccess } from "@/components/who-can-see";
import { ObjectToolbar } from "@/components/object-toolbar";
import { ThemeScope } from "@/components/theme-scope";
import { setDashboardTheme } from "@/app/theme-actions";
import { themeFor } from "@ziffr/core/themes";
import { DashboardSwitcher } from "@/components/dashboard-switcher";
import { usePin } from "@/components/pinned-dashboards";
import { useDemoPrefs } from "@/components/demo-visit-prefs";
import { useWidgetMenuSeen } from "@/lib/widget-menu-hint";
import { setHome } from "@/app/home-actions";
import { MakeDeckDialog } from "@/components/make-deck-dialog";
import { DashboardReader } from "@/components/dashboard-reader";
import { SnapshotMenu } from "@/components/snapshot-menu";
import type { SnapshotSummary } from "@ziffr/core/snapshots";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RecordActions } from "./record-actions";
import type { RecordingOffer } from "@ziffr/core/record-own-value";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { StartScreen } from "@/app/dashboards/start-screen";
import { ExampleNote } from "@/app/dashboards/example-note";
import type { ExampleNote as Example, StartChoices } from "@ziffr/core/trial-example";

type Props = {
  data: CanvasData;
  dashboards: DashboardAccess[];
  current: DashboardAccess | null;
  widgets: Widget[];
  saved: Widget[];
  shares: Share[];
  reveals?: Record<string, string[]>;
  /** A dashboard the viewer opened by link but may not see. */
  closed?: { id: number; owner: string } | null;
  /** The dashboard Home opens for this person (their choice, or the default), for the switcher's mark. */
  homeId: number | null;
  /** Whether the viewer pinned this dashboard to the sidebar. */
  pinned: boolean;
  /** In the demo, which saves nothing, the Pin button shows as off. */
  demo?: boolean;
  /** The Dashboard Templates a new dashboard can start from (empty for a Guest). */
  dashboardTemplates: DashboardTemplateSummary[];
  /** May start new dashboards (not a Guest). */
  canCreate: boolean;
  /** May invite people (Owners and Admins): the Share panel then offers to invite someone. */
  canInvite?: boolean;
  /** Shows the Read view (spec 0013): the introduction, then the widgets top to bottom. Else the grid. */
  reading?: boolean;
  /** Whether the desktop-only message of Edit mode offers "Send me the link" (not in the demo or to a Guest). */
  sendLink?: boolean;
  /** The current dashboard's Snapshots the viewer may open (spec 0013). */
  snapshots?: SnapshotSummary[];
  /** The way to record a value, for the Metrics on this dashboard that have none yet and that the viewer submits. */
  offers?: Record<number, RecordingOffer>;
  /** Home's start screen, when the person has nothing but an untouched example or nothing at all (#1292). */
  start?: StartChoices | null;
  /** What the current dashboard's line says when it is a trial's example. */
  example?: Example | null;
};

const sizeOf = (s: DropSource | null, saved: Widget[], templates: CanvasData["templates"]) => {
  if (!s) return TEMPLATES[DEFAULT_TEMPLATE].size;
  if (s.type === "widget") {
    const w = saved.find((x) => x.id === s.id);
    return w ? { w: w.w, h: w.h } : TEMPLATES[DEFAULT_TEMPLATE].size;
  }
  if (s.type === "spec") return templateOf({ template: s.template, settings: s.settings ?? {} }).size;
  if (s.type === "template") {
    const t = templates.find((x) => x.id === s.id);
    return t ? { w: t.w, h: t.h } : TEMPLATES[DEFAULT_TEMPLATE].size;
  }
  return TEMPLATES[DEFAULT_TEMPLATE].size;
};

const NO_OFFERS: Record<number, RecordingOffer> = {};

/** The Dashboards screen: the viewer's dashboards, the canvas of the current one and its Add widget panel. The page sends
 * the series of the widgets on it; widgets, editors and the panel fetch any other they need (ticket #125). */
export function DashboardScreen(props: Props) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><DashboardCanvas {...props} data={data} /></SeriesProvider>;
}

function DashboardCanvas({ data, dashboards, current, widgets, saved, shares, reveals, closed, homeId, pinned, demo = false, canCreate, canInvite, dashboardTemplates, reading = false, snapshots = [], sendLink = false, offers = NO_OFFERS, start: startChoices = null, example = null }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  // A refusal says why in a toast; anything unforeseen says only that it went wrong (lib/action-error.ts).
  const act = (f: () => Promise<unknown>, ok?: string, where?: { position: "bottom-left" }) => start(async () => {
    try { unwrap(await f()); if (ok) toast.success(ok, where); } catch (err) { toast.error("Not done", { description: shown(err) }); }
  });
  const { width, containerRef, mounted } = useContainerWidth();
  const editable = current?.role === "owner" || current?.role === "editor";
  // A dashboard opens to look at; its owner and Editors switch into editing, or open Add widget, on purpose. The core
  // checks every change either way.
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [current?.id]);
  // The Read view only reads; changes are made in the grid.
  const mayChange = editable && !reading;
  const slotFill = useSlotFill(data);
  // The message stands on the left: on the right it would lie over the Add widget panel's buttons.
  const add = useAddWidget({ dashboardId: current?.id, mayChange, widgets, complete: slotFill.complete, put: (id, s, at) => act(() => placeWidget(id, s, at), "Widget added", { position: "bottom-left" }) });
  // Beside the Add widget panel widgets can be moved too, to make room for the new one.
  const changing = mayChange && (editing || add.beside);
  const toLayout = (ws: Widget[]): Layout => ws.map((w) => ({ i: String(w.id), x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 3 }));
  const [layout, setLayout] = useState<Layout>(toLayout(widgets));
  useEffect(() => setLayout(toLayout(widgets)), [widgets]);
  const targets = dashboards.filter((d) => d.role !== "viewer");
  // Under 40rem the grid becomes one column in reading order, full width, not draggable. Beside the Add widget panel a
  // narrow one keeps its columns and is drawn smaller.
  const { gridWidth, scale } = fitGrid(width, add.beside);
  const narrow = mounted && gridWidth < ONE_COLUMN_BELOW;
  // A note is as high as its words need there, with room to write where it can be written; every other widget keeps its own.
  const rowsOf = (it: Layout[number]) => {
    const w = widgets.find((x) => String(x.id) === it.i);
    if (w?.template !== "note") return Math.max(it.h, 5);
    const text = noteTextOf(w.settings);
    return noteRows(w.title, text, changing || (mayChange && !text));
  };
  const stacked: Layout = [...layout]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .reduce<{ items: Layout; y: number }>((acc, it) => {
      const h = rowsOf(it);
      acc.items = [...acc.items, { ...it, x: 0, y: acc.y, w: 1, h }];
      acc.y += h;
      return acc;
    }, { items: [], y: 0 }).items;
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]));

  const persist = (l: Layout) => {
    const items = l.filter((it) => it.i !== "__dropping-elem__").map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    setLayout(items);
    if (current && changing) act(() => saveLayout(current.id, items));
  };
  const grid = scaledGrid(scale, add.carrying === "card", () => sizeOf(getDrag(), saved, data.templates));
  const addCard = mayChange && widgets.length < FEW_WIDGETS ? { layout: narrow ? stacked : layout, oneColumn: narrow, first: widgets.length === 0, hidden: add.carrying !== null, onOpen: add.openAdd } : null;

  // The Grid and Read switch: in the toolbar row on every screen, the one button besides Share that a phone keeps there.
  const viewToggle = current && (
    <div role="group" aria-label="View" className="flex gap-0.5 rounded-[var(--radius-input)] border border-[var(--border)] p-0.5">
      <Link href={`/dashboards/${current.id}`} aria-current={!reading ? "page" : undefined} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-md:h-11 max-[360px]:min-w-11 max-[360px]:justify-center", !reading && "bg-[var(--muted)] font-medium")}><LayoutGrid aria-hidden /> <span className="max-[360px]:sr-only">Grid</span></Link>
      <Link href={`/dashboards/${current.id}?view=read`} aria-current={reading ? "page" : undefined} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-md:h-11 max-[360px]:min-w-11 max-[360px]:justify-center", reading && "bg-[var(--muted)] font-medium")}><BookOpen aria-hidden /> <span className="max-[360px]:sr-only">Read</span></Link>
    </div>
  );
  const pin = usePin({ dashboardId: current?.id ?? 0, name: current?.name ?? "", pinned, demo });
  // Where visitors may change the demo, Home is this visit's own, kept in the browser (demo-visit-prefs.tsx).
  const visit = useDemoPrefs();
  const homeShown = visit?.homeId ?? homeId;
  const menuSeen = useWidgetMenuSeen(data.viewer);
  const [newOpen, setNewOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [makingDeck, setMakingDeck] = useState(false);
  const newDashboard = () => setNewOpen(true);

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-4", add.beside && "lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_21rem]")}>
      {slotFill.dialog}
      {newOpen && <NewDashboardDialog open onOpenChange={setNewOpen} templates={dashboardTemplates} metrics={inUse(data.metrics).map((m) => ({ id: m.id, name: m.name }))} tags={data.tags} viewer={data.viewer} numberStyle={data.numberStyle} />}
      {makingDeck && current && <MakeDeckDialog key={current.id} source={{ dashboardId: current.id, snapshots: snapshots.filter((s) => s.shownAt) }} onClose={() => setMakingDeck(false)} />}
      {savingTemplate && current && <SaveDashboardTemplateDialog dashboardId={current.id} dashboardName={current.name} metricName={(id) => data.metrics.find((m) => m.id === id)?.name} onClose={() => setSavingTemplate(false)} />}
      <div className="min-w-0">

        {closed ? (
          <div className="mx-auto max-w-md rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm">
            <p className="font-medium">This dashboard isn&rsquo;t shared with you</p>
            <RequestAccess type="dashboard" id={closed.id} owner={closed.owner} />
          </div>
        ) : !current && startChoices ? (
          <StartScreen choices={startChoices} />
        ) : !current ? (
          <div className="desk rounded-[var(--radius-card)] p-12 text-center">
            <LayoutDashboard className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">{canCreate ? "No dashboards yet" : "Nothing has been shared with you yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{canCreate ? "Create one, or ask a colleague to share theirs with you." : "Ask whoever invited you."}</p>
            {canCreate && <Button onClick={newDashboard} className="mt-4">Create dashboard</Button>}
          </div>
        ) : (
          <>
            {/* Only while editing: looking at a dashboard is what a phone is good for. "Look at it" leaves Edit mode. */}
            {editing && mayChange && <LargerScreenNote key={current.id} path={`/dashboards/${current.id}`} send={sendLink} look={{ onLook: () => setEditing(false) }} />}
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <DashboardSwitcher current={current} dashboards={dashboards} homeId={homeShown} ownerName={(id) => people[id]?.name ?? ""} onNew={canCreate ? newDashboard : undefined} />
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">{current.role === "owner" ? <><Users aria-hidden className="size-4" /> Yours</> : current.role === "editor" ? <><Pencil aria-hidden className="size-4" /> {people[current.owner_id]?.name} shared this with you as Editor</> : <><Eye aria-hidden className="size-4" /> {people[current.owner_id]?.name} shared this with you as Viewer</>}</span>
                  {!menuSeen && widgets.length > 0 && <span className="flex items-center gap-1.5 max-md:hidden"><MoreHorizontal aria-hidden className="size-4" /> <span>A widget&rsquo;s ⋯ menu has its history, questions and tasks<span className="hidden pointer-fine:inline">, or right-click it</span></span></span>}
                </p>
                {editing && mayChange ? <DashboardText key={current.id} id={current.id} name={current.name} intro={current.intro ?? ""} /> : !reading && current.intro && <p className="mt-3 max-w-3xl whitespace-pre-line text-muted-foreground">{current.intro}</p>}
              </div>
              <ObjectToolbar
                type="dashboard"
                id={current.id}
                people={data.people}
                phone={<div className="md:hidden">{viewToggle}</div>}
                share={current.role === "owner" ? { name: current.name, ownerId: current.owner_id, shares, groups: data.groups, reveals, canInvite } : null}
                viewLinks={current.role === "owner"}
                theme={editable ? { themes: data.themes, value: current.theme_id, onChange: (id) => setDashboardTheme(current.id, id) } : null}
                menu={[
                  // On a phone, where the toolbar's buttons sit in a sheet that stays open, Add widget closes it first.
                  ...(mayChange ? [{ label: "Add widget", icon: <Plus aria-hidden />, phoneOnly: true, onSelect: () => setTimeout(add.openAdd, 0) }] : []),
                  // Home and Pin are switches: "Home dashboard ✓", "Pinned ✓". The switcher's list shows them too. In the demo
                  // Pin shows as off and says why (#764), as the Pin button on the list does.
                  { label: "Home dashboard", icon: <Home aria-hidden />, checked: current.id === homeShown, hint: current.id === homeShown ? "Ziffr opens on this dashboard" : "Open Ziffr on this dashboard", onSelect: () => { if (current.id !== homeShown && visit) { visit.setHome({ id: current.id, name: current.name }); toast.success(`${current.name} is your home`); } else if (current.id !== homeShown) act(async () => { unwrap(await setHome(current.id)); toast.success(`${current.name} is your home`); router.refresh(); }); } },
                  { label: "Pinned", icon: <Pin aria-hidden />, checked: pin.demo ? false : pin.pinned, dimmed: pin.demo, hint: pin.label, onSelect: pin.onPress },
                  ...(canCreate ? [
                  { label: "Make a deck…", icon: <Presentation aria-hidden />, onSelect: () => setTimeout(() => setMakingDeck(true), 0) },
                  ...(editable && widgets.length ? [{ label: "Save as template", icon: <LayoutTemplate aria-hidden />, onSelect: () => setSavingTemplate(true) }] : []),
                  ] : []),
                ]}
              >
                {mayChange && <Button variant="outline" className="max-md:hidden" aria-expanded={add.open} aria-controls={add.beside ? "add-widget" : undefined} onClick={add.open ? add.close : add.openAdd}><Plus aria-hidden /> Add widget</Button>}
                <div className="max-md:hidden">{viewToggle}</div>
                <SnapshotMenu dashboardId={current.id} yearStart={data.yearStart} snapshots={snapshots} canTake={editable && canCreate} auto={current.role === "owner" ? { every: current.snapshot_every ?? null, waitDays: current.snapshot_wait_days ?? 5 } : null} />
                <Link href={`/dashboards/${current.id}/present`} className={buttonVariants({ variant: "outline" })}><MonitorPlay aria-hidden /> Present</Link>
                {editable && !reading && (
                  <Button variant={editing ? "default" : "outline"} onClick={() => { setEditing(!editing); if (editing) add.close(); }} aria-pressed={editing}>
                    {editing ? <><Check aria-hidden /> Done</> : <><Pencil aria-hidden /> Edit</>}
                  </Button>
                )}
              </ObjectToolbar>
            </div>
            {example && <ExampleNote key={`example-${current.id}`} dashboardId={current.id} note={example} />}
            {/* The element whose width the grid is laid out by stays in place in both views: the width hook observes the element it
                first finds, so one that came and went with the Read view left the grid at the width of a removed node (0), and it
                came back as a narrow single column. It has no padding of its own, so its width is the grid's. */}
            <div ref={containerRef}>
            {reading ? <DashboardReader dashboard={{ id: current.id, name: current.name, intro: current.intro ?? "", theme_id: current.theme_id }} widgets={widgets} data={data} header={false} /> : (
            <ThemeScope theme={themeFor(data.themes, current.theme_id)} className="desk relative min-h-[60vh] rounded-[var(--radius-card)]">
              {widgets.length === 0 && !mayChange && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">This dashboard is empty.</div>
              )}
              {mounted && (
                <RecipeBudgetProvider data={data}>
                <RecordActions offers={offers}>
                <GridStage width={gridWidth} scale={scale} card={addCard}>
                <ReactGridLayout
                  key={add.gridKey}
                  layout={narrow ? stacked : layout}
                  width={gridWidth}
                  // While it can be changed the grid fills the desk, so a card can be dropped below the last widget.
                  className={changing ? "min-h-[60vh]" : undefined}
                  positionStrategy={grid.positionStrategy}
                  gridConfig={{ cols: narrow ? 1 : 12, rowHeight: GRID.rowHeight, margin: [GRID.margin, GRID.margin], containerPadding: [GRID.padding, GRID.padding] }}
                  dragConfig={{ enabled: changing && !narrow, handle: ".widget-drag" }}
                  resizeConfig={{ enabled: changing && !narrow }}
                  dropConfig={{ enabled: changing && !narrow, defaultItem: TEMPLATES[DEFAULT_TEMPLATE].size, onDragOver: grid.onDragOver }}
                  onDragStart={add.moveStart}
                  onDragStop={(l) => { add.moveEnd(); persist(l); }}
                  onResizeStart={add.moveStart}
                  onResizeStop={(l) => { add.moveEnd(); persist(l); }}
                  onDrop={(_l, item, e) => { if (item) add.drop(e, { x: item.x, y: item.y }); }}
                >
                  {widgets.map((w) => (
                    <div key={String(w.id)} data-widget={w.id}>
                      {changing || !w.id ? (
                        <WidgetFrame widget={w} data={data} targets={targets.filter((d) => d.id !== current.id)} editable={changing} dragHandle={changing} saved={saved} />
                      ) : (
                        // Outside Edit mode a tap on the card opens it large, as Present does one at a time (#826).
                        <OpenLarge className="h-full" title={frameTitle(w, widgetMetrics(w, data), data)} onOpen={() => router.push(largeHref(current.id, w.id!))}>
                          <WidgetFrame widget={w} data={data} targets={targets.filter((d) => d.id !== current.id)} editable={false} saved={saved} mayWrite={mayChange} />
                        </OpenLarge>
                      )}
                    </div>
                  ))}
                </ReactGridLayout>
                </GridStage>
                </RecordActions>
                </RecipeBudgetProvider>
              )}
            </ThemeScope>
            )}
            </div>
          </>
        )}
      </div>
      {add.panel(data, saved)}
    </div>
  );
}

/** The dashboard's name and introduction, changed in edit mode (spec 0013); the core lets only its owner and Editors. */
function DashboardText({ id, name: savedName, intro: savedIntro }: { id: number; name: string; intro: string }) {
  const router = useRouter();
  const [name, setName] = useState(savedName);
  const [intro, setIntro] = useState(savedIntro);
  const [pending, start] = useTransition();
  const changed = name !== savedName || intro !== savedIntro;
  const save = () => start(async () => {
    try { unwrap(await saveDashboardText(id, { name, intro })); toast.success("Saved"); router.refresh(); } catch (err) { toast.error("Not saved", { description: shown(err) }); }
  });
  return (
    <div className="mt-3 max-w-3xl space-y-2">
      <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <Textarea aria-label="Introduction" value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={4000} rows={2} placeholder="An introduction: what this dashboard tells, in a sentence or two. Shown above it, and first in its Read view." />
      {changed && <Button size="sm" disabled={pending || !name.trim()} onClick={save}>Save name and introduction</Button>}
    </div>
  );
}
