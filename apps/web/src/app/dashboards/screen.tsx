"use client";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { inUse } from "@ziffr/core/metric-row";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { BookOpen, Check, Eye, Home, LayoutDashboard, LayoutGrid, LayoutTemplate, MonitorPlay, MoreHorizontal, Pencil, Presentation, Users } from "lucide-react";
import { NewDashboardDialog } from "@/components/new-dashboard-dialog";
import { SaveDashboardTemplateDialog } from "@/components/save-dashboard-template-dialog";
import type { DashboardTemplateSummary } from "@ziffr/core/dashboard-templates";
import { Pool } from "@/components/pool";
import { WidgetFrame } from "@/components/widget-frame";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { placeWidget, saveDashboardText, saveLayout, type DropSource } from "@/app/canvas-actions";
import { getDrag, setDrag } from "@/lib/drag";
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
import { FirstRun } from "@/components/first-run";
import { DashboardSwitcher } from "@/components/dashboard-switcher";
import { PinButton } from "@/components/pinned-dashboards";
import { setHome } from "@/app/home-actions";
import { makeDeck } from "@/app/convert-actions";
import { DashboardReader } from "@/components/dashboard-reader";
import { SnapshotMenu } from "@/components/snapshot-menu";
import type { SnapshotSummary } from "@ziffr/core/snapshots";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";

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
  /** The Dashboard Templates a new dashboard can start from (empty for a Guest). */
  dashboardTemplates: DashboardTemplateSummary[];
  /** May start new dashboards (not a Guest). */
  canCreate: boolean;
  /** May invite people (Owners and Admins): the Share panel then offers to invite someone. */
  canInvite?: boolean;
  /** Set when the workspace has no dashboards yet: what the viewer may do about it (outside the demo). */
  firstRun?: { canCreate: boolean; canManage: boolean; clockSet: boolean; hasValue: boolean } | null;
  /** Shows the Read view (spec 0013): the introduction, then the widgets top to bottom. Else the grid. */
  reading?: boolean;
  /** The current dashboard's Snapshots the viewer may open (spec 0013). */
  snapshots?: SnapshotSummary[];
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

/** The Dashboards screen: the Pool, the viewer's dashboards and the canvas of the current one. The page sends the
 * series of the widgets on it; widgets and editors fetch any other they need (ticket #125). */
export function DashboardScreen(props: Props) {
  const { data, ensure } = useCanvasSeries(props.data);
  return <SeriesProvider ensure={ensure}><DashboardCanvas {...props} data={data} /></SeriesProvider>;
}

function DashboardCanvas({ data, dashboards, current, widgets, saved, shares, reveals, closed, firstRun, homeId, pinned, canCreate, canInvite, dashboardTemplates, reading = false, snapshots = [] }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  // A refusal says why in a toast; anything unforeseen says only that it went wrong (lib/action-error.ts).
  const act = (f: () => Promise<unknown>, ok?: string) => start(async () => {
    try { unwrap(await f()); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); }
  });
  const { width, containerRef, mounted } = useContainerWidth();
  const editable = current?.role === "owner" || current?.role === "editor";
  // A dashboard opens to look at; its owner and Editors switch into editing on purpose. An empty one they may change
  // opens in edit mode, since there is nothing to look at yet. The core checks every change either way.
  const [editing, setEditing] = useState(editable && widgets.length === 0);
  useEffect(() => setEditing(editable && widgets.length === 0), [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Read view only reads; changes are made in the grid.
  const changing = editable && editing && !reading;
  const toLayout = (ws: Widget[]): Layout => ws.map((w) => ({ i: String(w.id), x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 3 }));
  const [layout, setLayout] = useState<Layout>(toLayout(widgets));
  useEffect(() => setLayout(toLayout(widgets)), [widgets]);
  const targets = dashboards.filter((d) => d.role !== "viewer");
  // Under 40rem the grid becomes one column in reading order, full width, not draggable.
  const narrow = mounted && width < 640;
  const stacked: Layout = [...layout]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .reduce<{ items: Layout; y: number }>((acc, it) => {
      const h = Math.max(it.h, 5);
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
  const slotFill = useSlotFill(data);
  /** Templates ask for their slots first, then land like any other drop. */
  const place = async (s: DropSource, pos?: { x: number; y: number }) => {
    if (!current) return;
    const c = await slotFill.complete(s);
    if (c) act(() => placeWidget(current.id, c, pos));
  };
  const add = (s: DropSource) => place(s);

  // The Grid and Read switch: in the toolbar row on every screen, the one button besides Share that a phone keeps there.
  const viewToggle = current && (
    <div role="group" aria-label="View" className="flex gap-0.5 rounded-[var(--radius-input)] border border-[var(--border)] p-0.5">
      <Link href={`/dashboards/${current.id}`} aria-current={!reading ? "page" : undefined} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), !reading && "bg-[var(--muted)] font-medium")}><LayoutGrid aria-hidden /> Grid</Link>
      <Link href={`/dashboards/${current.id}?view=read`} aria-current={reading ? "page" : undefined} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), reading && "bg-[var(--muted)] font-medium")}><BookOpen aria-hidden /> Read</Link>
    </div>
  );
  const [newOpen, setNewOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const newDashboard = () => setNewOpen(true);

  return (
    <div className={cn("grid gap-4", changing && "lg:grid-cols-[15rem_minmax(0,1fr)]")}>
      {slotFill.dialog}
      {newOpen && <NewDashboardDialog open onOpenChange={setNewOpen} templates={dashboardTemplates} metrics={inUse(data.metrics).map((m) => ({ id: m.id, name: m.name }))} viewer={data.viewer} numberStyle={data.numberStyle} />}
      {savingTemplate && current && <SaveDashboardTemplateDialog dashboardId={current.id} dashboardName={current.name} metricName={(id) => data.metrics.find((m) => m.id === id)?.name} onClose={() => setSavingTemplate(false)} />}
      {changing && (
        <div className="order-2 lg:order-1">
          <Pool data={data} saved={saved} onAdd={add} layouts hint="Drag onto the dashboard, or click +." />
        </div>
      )}
      <div className="order-1 min-w-0 lg:order-2">

        {closed ? (
          <div className="mx-auto max-w-md rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm">
            <p className="font-medium">This dashboard isn&rsquo;t shared with you</p>
            <RequestAccess type="dashboard" id={closed.id} owner={closed.owner} />
          </div>
        ) : !current && firstRun?.canCreate ? (
          <FirstRun steps={[
            { title: "Describe a metric", body: "Pick one from the catalog, such as revenue or customer satisfaction, and say who submits it.", done: data.metrics.length > 0, href: "/metrics/new" },
            { title: "Add its first value", body: "Submit it yourself on the metric’s form link, or wait for the first answer.", done: firstRun.hasValue, href: "/metrics" },
            ...(firstRun.canManage ? [{ title: "Invite a teammate", body: "They see what you share with them, and can submit values and answer questions.", done: data.people.filter((p) => !p.contact).length > 1, href: "/team" }] : []),
            { title: "Build a dashboard", body: "Drag metrics from the Pool onto it and share it with the team.", done: false, action: <Button size="sm" onClick={newDashboard}>Create dashboard</Button> },
            ...(firstRun.canManage ? [{ title: "Set the workspace time", body: "The time zone and hour when Ziffr asks for values and sends reminders each day.", done: firstRun.clockSet, href: "/settings/workspace" }] : []),
          ]} />
        ) : !current ? (
          <div className="desk rounded-[var(--radius-card)] p-12 text-center">
            <LayoutDashboard className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">{canCreate ? "No dashboards yet" : "Nothing has been shared with you yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{canCreate ? "Create one, or ask a colleague to share theirs with you." : "Ask whoever invited you."}</p>
            {canCreate && <Button onClick={newDashboard} className="mt-4">Create dashboard</Button>}
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <DashboardSwitcher current={current} dashboards={dashboards} homeId={homeId} ownerName={(id) => people[id]?.name ?? ""} onNew={canCreate ? newDashboard : undefined} />
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">{current.role === "owner" ? <><Users aria-hidden className="size-4" /> Yours</> : current.role === "editor" ? <><Pencil aria-hidden className="size-4" /> {people[current.owner_id]?.name} shared this with you as Editor</> : <><Eye aria-hidden className="size-4" /> {people[current.owner_id]?.name} shared this with you as Viewer</>}</span>
                  <span className="flex items-center gap-1.5 max-md:hidden"><MoreHorizontal aria-hidden className="size-4" /> <span>A widget&rsquo;s ⋯ menu has its history, questions and tasks<span className="hidden pointer-fine:inline">, or right-click it</span></span></span>
                </p>
                {changing ? <DashboardText key={current.id} id={current.id} name={current.name} intro={current.intro ?? ""} /> : !reading && current.intro && <p className="mt-3 max-w-3xl whitespace-pre-line text-muted-foreground">{current.intro}</p>}
              </div>
              <ObjectToolbar
                type="dashboard"
                id={current.id}
                people={data.people}
                phone={<div className="md:hidden">{viewToggle}</div>}
                share={current.role === "owner" ? { name: current.name, ownerId: current.owner_id, shares, groups: data.groups, reveals, canInvite } : null}
                viewLinks={current.role === "owner"}
                theme={editable ? { themes: data.themes, value: current.theme_id, onChange: (id) => setDashboardTheme(current.id, id) } : null}
                menu={canCreate ? [
                  { label: "Make a deck", icon: <Presentation aria-hidden />, onSelect: () => act(() => makeDeck(current.id)) },
                  ...(editable && widgets.length ? [{ label: "Save as template", icon: <LayoutTemplate aria-hidden />, onSelect: () => setSavingTemplate(true) }] : []),
                ] : undefined}
              >
                <button
                  type="button"
                  aria-pressed={current.id === homeId}
                  title={current.id === homeId ? "Ziffr opens on this dashboard" : "Open Ziffr on this dashboard"}
                  onClick={() => act(async () => { unwrap(await setHome(current.id)); toast.success(`${current.name} is your home`); router.refresh(); })}
                  disabled={current.id === homeId}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <Home aria-hidden className={cn(current.id === homeId && "fill-current")} /> {current.id === homeId ? "Home" : "Make this my home"}
                </button>
                <PinButton dashboardId={current.id} name={current.name} pinned={pinned} />
                <div className="max-md:hidden">{viewToggle}</div>
                <SnapshotMenu dashboardId={current.id} yearStart={data.yearStart} snapshots={snapshots} canTake={editable && canCreate} auto={current.role === "owner" ? { every: current.snapshot_every ?? null, waitDays: current.snapshot_wait_days ?? 5 } : null} />
                <Link href={`/dashboards/${current.id}/present`} className={buttonVariants({ variant: "outline" })}><MonitorPlay aria-hidden /> Present</Link>
                {editable && !reading && (
                  <Button variant={editing ? "default" : "outline"} onClick={() => setEditing(!editing)} aria-pressed={editing}>
                    {editing ? <><Check aria-hidden /> Done</> : <><Pencil aria-hidden /> Edit</>}
                  </Button>
                )}
              </ObjectToolbar>
            </div>
            {reading ? <DashboardReader dashboard={{ id: current.id, name: current.name, intro: current.intro ?? "", theme_id: current.theme_id }} widgets={widgets} data={data} header={false} /> : (
            <ThemeScope theme={themeFor(data.themes, current.theme_id)} ref={containerRef} className="desk relative min-h-[60vh] rounded-[var(--radius-card)]">
              {widgets.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  {changing ? "Drag metrics or saved widgets from the Pool and drop them here." : editable ? "This dashboard is empty. Press Edit to add widgets." : "This dashboard is empty."}
                </div>
              )}
              {mounted && (
                <ReactGridLayout
                  layout={narrow ? stacked : layout}
                  width={width}
                  gridConfig={{ cols: narrow ? 1 : 12, rowHeight: 36, margin: [16, 16], containerPadding: [16, 16] }}
                  dragConfig={{ enabled: changing && !narrow, handle: ".widget-drag" }}
                  resizeConfig={{ enabled: changing && !narrow }}
                  dropConfig={{
                    enabled: changing && !narrow,
                    defaultItem: TEMPLATES[DEFAULT_TEMPLATE].size,
                    onDragOver: () => sizeOf(getDrag(), saved, data.templates),
                  }}
                  onDragStop={(l) => persist(l)}
                  onResizeStop={(l) => persist(l)}
                  onDrop={(_l, item, e) => {
                    let s = getDrag();
                    try {
                      s = JSON.parse((e as DragEvent).dataTransfer?.getData("text/plain") ?? "") as DropSource;
                    } catch {}
                    setDrag(null);
                    if (s && item && current) place(s, { x: item.x, y: item.y });
                  }}
                >
                  {widgets.map((w) => (
                    <div key={String(w.id)}>
                      <WidgetFrame widget={w} data={data} targets={targets.filter((d) => d.id !== current.id)} editable={changing} dragHandle={changing} saved={saved} />
                    </div>
                  ))}
                </ReactGridLayout>
              )}
            </ThemeScope>
            )}
          </>
        )}
      </div>
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
