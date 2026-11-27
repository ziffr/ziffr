import { currentActor, viewerId } from "@/lib/viewer";
import { closedDashboardOwner, dashboardWidgets, savedWidgets } from "@ziffr/core/page-data";
import { getCanvasData, getRawShares, revealedBy } from "@/lib/access";
import { homeDashboard, switchableDashboards } from "@ziffr/core/home";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { pinnedDashboards } from "@ziffr/core/pinned-dashboards";
import { DashboardScreen } from "@/app/dashboards/screen";
import { maySendLink } from "@/components/desktop-only";
import { can } from "@ziffr/core/actor";
import { isDemo } from "@/lib/auth";
import { listDashboardTemplates } from "@ziffr/core/dashboard-templates";
import { listSnapshots } from "@ziffr/core/snapshots";
import { countView } from "@/lib/count-view";
import { DemoHomeRedirect } from "@/components/demo-visit-prefs";
import { followDemoSuccessor } from "@/lib/demo-follow";
import { visibleTags } from "@ziffr/core/tag-sight";
import { isTagWidget } from "@ziffr/core/tag-widgets";
import { exampleNote, startChoices } from "@ziffr/core/trial-example";
import { recordingOffers } from "@ziffr/core/record-own-value";

/** One dashboard of the viewer's, or their Home (spec 0010), with everything its screen needs; `view` is "read" for
 * its Read view (spec 0013), else the grid. */
export async function DashboardView({ id, view }: { id?: number; view?: string }) {
  const viewer = await viewerId();
  const actor = await currentActor();
  const [dashboards, shares, saved] = await Promise.all([switchableDashboards(actor), getRawShares(), savedWidgets(actor)]);
  // Home alone may offer where to start instead of a dashboard (#1292).
  const start = id ? null : await startChoices(actor, dashboards);
  const home = start ? null : await homeDashboard(actor, dashboards);
  const current = id ? dashboards.find((d) => d.id === id) ?? null : home;
  // Opened by a signed-in person who sees it (Home counts as the dashboard it shows): one View Count, no person.
  if (current) void countView(actor, { kind: "dashboard", id: current.id });
  const [ws, snapshots] = current ? await Promise.all([dashboardWidgets(actor, current.id), listSnapshots(actor, current.id)]) : [[], []];
  const example = current ? await exampleNote(actor, current.id) : null;
  // Only the series this dashboard draws go to the browser; a widget placed or a Metric picked later fetches its own.
  const loaded = await getCanvasData(viewer, [...new Set(ws.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))]);
  // Those who place widgets pick a Tag by name; a Tag is shown only through Metrics the person sees (spec 0038).
  const data = can(actor, "create") || current?.role === "editor" ? { ...loaded, tags: (await visibleTags(actor)).map((t) => ({ id: t.id, name: t.name })) } : loaded;
  // Where a Widget has nothing to draw yet, someone who submits its Metric may record the first value there. Not in the
  // Read view, which only reads; the core answers only for the viewer's own submitting.
  const empty = current && view !== "read" ? ws.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)).filter((id) => {
    const m = loaded.metrics.find((x) => x.id === id);
    return m && !loaded.series[m.slug]?.length;
  }) : [];
  const offers = await recordingOffers(actor, empty);
  // Only the owner shares, so only they need to know what a share would also show. A Tag widget's Metrics are no one's through the Share (spec 0038).
  const reveals = current?.role === "owner" ? await revealedBy([...new Set(ws.filter((w) => !isTagWidget(w)).flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))], current.owner_id) : {};
  // Opened by link but not shared: offer to ask the owner, without showing its name.
  let closed: { id: number; owner: string } | null = null;
  if (id && !current) {
    // Only a dashboard of this workspace; one elsewhere stays unknown.
    const owner = await closedDashboardOwner(actor, id);
    if (owner) closed = { id, owner };
    else await followDemoSuccessor("dashboard", id, view === "read" ? "?view=read" : "");
  }
  const demo = await isDemo();
  // Only the owner's Share dialog uses Shares, and only this dashboard's: nobody else gets the workspace's list.
  const own = current?.role === "owner" ? shares.filter((s) => s.object_type === "dashboard" && s.object_id === current.id) : [];
  // Only someone who may create starts a dashboard, so only they get the templates.
  const dashboardTemplates = can(actor, "create") ? await listDashboardTemplates(actor, new Set(data.metrics.map((m) => m.id))) : [];
  // Whether Edit mode on a phone offers the person their own link to this dashboard.
  const sendLink = current ? await maySendLink() : false;
  return <>
    {/* Home is the visit's own where visitors may change the demo (demo-visit-prefs.tsx): go to it when it is not the one drawn. */}
    {demo && !id && <DemoHomeRedirect shownId={current?.id ?? null} />}
    <DashboardScreen data={data} dashboards={dashboards} current={current} widgets={ws} saved={saved} shares={own} reveals={reveals} closed={closed} homeId={home?.id ?? null} pinned={current ? (await pinnedDashboards(actor)).some((d) => d.id === current.id) : false} demo={demo} canCreate={can(actor, "create")} canInvite={can(actor, "manage-members")} dashboardTemplates={dashboardTemplates} reading={view === "read"} snapshots={snapshots} sendLink={sendLink} offers={offers} start={start} example={example} />
  </>;
}
