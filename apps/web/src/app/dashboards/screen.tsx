"use client";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { Eye, LayoutDashboard, MonitorPlay, MoreHorizontal, Pencil, Plus, Users } from "lucide-react";
import { Pool } from "@/components/pool";
import { WidgetFrame } from "@/components/widget-frame";
import { SeriesProvider, useCanvasSeries } from "@/canvas/series-store";
import { createDashboardNamed, placeWidget, saveLayout, type DropSource } from "@/app/canvas-actions";
import { getDrag, setDrag } from "@/lib/drag";
import { TEMPLATES, DEFAULT_TEMPLATE } from "@/views/templates";
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
  /** Set when the workspace has no dashboards yet: what the viewer may do about it (outside the demo). */
  firstRun?: { canCreate: boolean; canManage: boolean; clockSet: boolean; hasValue: boolean } | null;
};

const sizeOf = (s: DropSource | null, saved: Widget[], templates: CanvasData["templates"]) => {
  if (!s) return TEMPLATES[DEFAULT_TEMPLATE].size;
  if (s.type === "widget") {
    const w = saved.find((x) => x.id === s.id);
    return w ? { w: w.w, h: w.h } : TEMPLATES[DEFAULT_TEMPLATE].size;
  }
  if (s.type === "spec") return TEMPLATES[s.template].size;
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

function DashboardCanvas({ data, dashboards, current, widgets, saved, shares, reveals, closed, firstRun }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const { width, containerRef, mounted } = useContainerWidth();
  const editable = current?.role === "owner" || current?.role === "editor";
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
    if (current && editable) start(() => saveLayout(current.id, items));
  };
  const slotFill = useSlotFill(data);
  /** Templates ask for their slots first, then land like any other drop. */
  const place = async (s: DropSource, pos?: { x: number; y: number }) => {
    if (!current) return;
    const c = await slotFill.complete(s);
    if (c) start(() => placeWidget(current.id, c, pos));
  };
  const add = (s: DropSource) => place(s);

  const newDashboard = () => {
    const name = window.prompt("Name of the new dashboard:", "My dashboard");
    if (name) start(async () => router.push(`/dashboards/${await createDashboardNamed(name)}`));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {slotFill.dialog}
      <div className="order-2 lg:order-1">
        <Pool data={data} saved={saved} onAdd={editable ? add : undefined} hint={editable ? "Drag onto the dashboard, or click +." : current ? "This dashboard is view-only for you." : "What you can place on a dashboard once you have one."} />
      </div>
      <div className="order-1 min-w-0 lg:order-2">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {dashboards.map((d) => (
            <Link key={d.id} href={`/dashboards/${d.id}`} aria-current={d.id === current?.id ? "page" : undefined} className={cn("flex min-h-9 items-center gap-1.5 rounded-[var(--radius-stock)] px-3 text-sm transition-colors", d.id === current?.id ? "stock font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {d.name}
              {d.role !== "owner" && <span className="text-xs text-muted-foreground">from {people[d.owner_id]?.name.split(" ")[0]}</span>}
            </Link>
          ))}
          <button onClick={newDashboard} className="flex min-h-9 items-center gap-1 rounded-[var(--radius-stock)] px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Plus aria-hidden className="size-3.5" /> New dashboard</button>
        </div>

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
            <p className="font-medium">No dashboards yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create one, or ask a colleague to share theirs with you.</p>
            <Button onClick={newDashboard} className="mt-4">Create dashboard</Button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[length:var(--text-2xl)] leading-tight">{current.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">{current.role === "owner" ? <><Users aria-hidden className="size-4" /> Yours</> : current.role === "editor" ? <><Pencil aria-hidden className="size-4" /> {people[current.owner_id]?.name} shared this with you as Editor</> : <><Eye aria-hidden className="size-4" /> {people[current.owner_id]?.name} shared this with you as Viewer</>}</span>
                  <span className="flex items-center gap-1.5"><MoreHorizontal aria-hidden className="size-4" /> <span>A widget&rsquo;s ⋯ menu has its history, questions and tasks<span className="hidden pointer-fine:inline">, or right-click it</span></span></span>
                </p>
              </div>
              <ObjectToolbar
                type="dashboard"
                id={current.id}
                people={data.people}
                share={current.role === "owner" ? { name: current.name, ownerId: current.owner_id, shares, groups: data.groups, reveals } : null}
                viewLinks={current.role === "owner"}
                theme={editable ? { themes: data.themes, value: current.theme_id, onChange: (id) => setDashboardTheme(current.id, id) } : null}
              >
                <Link href={`/dashboards/${current.id}/present`} className={buttonVariants({ variant: "outline" })}><MonitorPlay aria-hidden /> Present</Link>
              </ObjectToolbar>
            </div>
            <ThemeScope theme={themeFor(data.themes, current.theme_id)} ref={containerRef} className="desk relative min-h-[60vh] rounded-[var(--radius-card)]">
              {widgets.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  {editable ? "Drag metrics or saved widgets from the Pool and drop them here." : "This dashboard is empty."}
                </div>
              )}
              {mounted && (
                <ReactGridLayout
                  layout={narrow ? stacked : layout}
                  width={width}
                  gridConfig={{ cols: narrow ? 1 : 12, rowHeight: 36, margin: [16, 16], containerPadding: [16, 16] }}
                  dragConfig={{ enabled: editable && !narrow, handle: ".widget-drag" }}
                  resizeConfig={{ enabled: editable && !narrow }}
                  dropConfig={{
                    enabled: editable && !narrow,
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
                      <WidgetFrame widget={w} data={data} targets={targets.filter((d) => d.id !== current.id)} editable={editable} dragHandle={editable} saved={saved} />
                    </div>
                  ))}
                </ReactGridLayout>
              )}
            </ThemeScope>
          </>
        )}
      </div>
    </div>
  );
}
