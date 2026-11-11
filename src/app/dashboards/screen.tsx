"use client";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { Eye, LayoutDashboard, MousePointerClick, Pencil, Plus, Users } from "lucide-react";
import { Pool } from "@/components/pool";
import { WidgetFrame } from "@/components/widget-frame";
import { ShareDialog } from "@/components/share-dialog";
import { createDashboardNamed, placeWidget, saveLayout, type DropSource } from "@/app/canvas-actions";
import { getDrag, setDrag } from "@/lib/drag";
import { TEMPLATES, DEFAULT_TEMPLATE } from "@/views/templates";
import type { CanvasData, Share, Widget } from "@/lib/types";
import type { DashboardAccess } from "@/lib/access";
import { cn } from "@/lib/utils";

type Props = {
  data: CanvasData;
  dashboards: DashboardAccess[];
  current: DashboardAccess | null;
  widgets: Widget[];
  saved: Widget[];
  shares: Share[];
};

const sizeOf = (s: DropSource | null, saved: Widget[]) => {
  if (!s) return TEMPLATES[DEFAULT_TEMPLATE].size;
  if (s.type === "widget") {
    const w = saved.find((x) => x.id === s.id);
    return w ? { w: w.w, h: w.h } : TEMPLATES[DEFAULT_TEMPLATE].size;
  }
  if (s.type === "spec") return TEMPLATES[s.template].size;
  return TEMPLATES[DEFAULT_TEMPLATE].size;
};

export function DashboardScreen({ data, dashboards, current, widgets, saved, shares }: Props) {
  const router = useRouter();
  const [, start] = useTransition();
  const { width, containerRef, mounted } = useContainerWidth();
  const editable = current?.role === "owner" || current?.role === "editor";
  const toLayout = (ws: Widget[]): Layout => ws.map((w) => ({ i: String(w.id), x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 3 }));
  const [layout, setLayout] = useState<Layout>(toLayout(widgets));
  useEffect(() => setLayout(toLayout(widgets)), [widgets]);
  const targets = dashboards.filter((d) => d.role !== "viewer");
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]));

  const persist = (l: Layout) => {
    const items = l.filter((it) => it.i !== "__dropping-elem__").map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    setLayout(items);
    if (current && editable) start(() => saveLayout(current.id, items));
  };
  const add = (s: DropSource) => current && start(() => placeWidget(current.id, s));

  const newDashboard = () => {
    const name = window.prompt("Name of the new dashboard:", "My dashboard");
    if (name) start(async () => router.push(`/dashboards/${await createDashboardNamed(name)}`));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="order-2 lg:order-1">
        <Pool data={data} saved={saved} onAdd={editable ? add : undefined} hint={editable ? "Drag onto the dashboard, or click +." : "This dashboard is view-only for you."} />
      </div>
      <div className="order-1 min-w-0 lg:order-2">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {dashboards.map((d) => (
            <Link key={d.id} href={`/dashboards/${d.id}`} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", d.id === current?.id ? "border-primary bg-primary/5 font-medium" : "bg-background hover:bg-muted")}>
              {d.role !== "owner" && <span title={`Shared by ${people[d.owner_id]?.name}`} className="size-2 rounded-full" style={{ background: people[d.owner_id]?.color }} />}
              {d.name}
            </Link>
          ))}
          <button onClick={newDashboard} className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground hover:text-foreground"><Plus className="size-3.5" /> New dashboard</button>
        </div>

        {!current ? (
          <div className="rounded-xl border border-dashed bg-background p-12 text-center">
            <LayoutDashboard className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">No dashboards yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create one, or ask a colleague to share theirs with you.</p>
            <button onClick={newDashboard} className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">Create dashboard</button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{current.name}</h1>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {current.role === "owner" ? <><Users className="size-3.5" /> Yours</> : current.role === "editor" ? <><Pencil className="size-3.5" /> {people[current.owner_id]?.name} shared this with you as Editor</> : <><Eye className="size-3.5" /> {people[current.owner_id]?.name} shared this with you as Viewer</>}
                  <span className="mx-1">·</span><MousePointerClick className="size-3.5" /> Right-click any widget for history, questions and tasks
                </p>
              </div>
              {current.role === "owner" && <ShareDialog objectType="dashboard" objectId={current.id} name={current.name} ownerId={current.owner_id} people={data.people} shares={shares} />}
            </div>
            <div ref={containerRef} className={cn("relative min-h-[60vh] rounded-xl", editable && "bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:20px_20px]")}>
              {widgets.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  {editable ? "Drag metrics or saved widgets from the Pool and drop them here." : "This dashboard is empty."}
                </div>
              )}
              {mounted && (
                <ReactGridLayout
                  layout={layout}
                  width={width}
                  gridConfig={{ cols: 12, rowHeight: 36, margin: [12, 12] }}
                  dragConfig={{ enabled: editable, handle: ".widget-drag" }}
                  resizeConfig={{ enabled: editable }}
                  dropConfig={{
                    enabled: editable,
                    defaultItem: TEMPLATES[DEFAULT_TEMPLATE].size,
                    onDragOver: () => sizeOf(getDrag(), saved),
                  }}
                  onDragStop={(l) => persist(l)}
                  onResizeStop={(l) => persist(l)}
                  onDrop={(_l, item, e) => {
                    let s = getDrag();
                    try {
                      s = JSON.parse((e as DragEvent).dataTransfer?.getData("text/plain") ?? "") as DropSource;
                    } catch {}
                    setDrag(null);
                    if (s && item && current) start(() => placeWidget(current.id, s!, { x: item.x, y: item.y }));
                  }}
                >
                  {widgets.map((w) => (
                    <div key={String(w.id)}>
                      <WidgetFrame widget={w} data={data} targets={targets.filter((d) => d.id !== current.id)} editable={editable} dragHandle={editable} />
                    </div>
                  ))}
                </ReactGridLayout>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
