import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { db } from "@/lib/db";
import { currentWorkspaceId, viewerId } from "@/lib/viewer";
import { getMetrics, getProfiles } from "@/lib/data";
import { visibleDashboards, visibleMetricIds } from "@/lib/access";
import { formatValue, periodLabel } from "@ziffr/core/format";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

// Governance: who changed what, and when, across everything the viewer may see.
const NOUN: Record<string, string> = { widget: "widget", dashboard: "dashboard", deck: "deck", metric: "metric description", template: "template", theme: "theme" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const sp = await searchParams;
  const viewer = await viewerId();
  const ws = await currentWorkspaceId();
  const [people, metrics, dashboards, { data: versions }, { data: superseded }, { data: decks }, { data: widgets }] = await Promise.all([
    getProfiles(),
    getMetrics(),
    visibleDashboards(viewer),
    db.from("versions").select("id, object_type, object_id, version, author_id, message, name, updated_at").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(200),
    db.from("observation_history").select("*").eq("workspace_id", ws).order("superseded_at", { ascending: false }).limit(100),
    db.from("decks").select("id, name, owner_id").eq("workspace_id", ws),
    db.from("widgets").select("id, dashboard_id, owner_id, metric_ids, title").eq("workspace_id", ws),
  ]);
  const visible = await visibleMetricIds(viewer, metrics);
  const dash = new Map(dashboards.map((d) => [d.id, d]));
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Someone";

  const items = [
    ...(versions ?? [])
      .filter((v) => {
        if (v.object_type === "metric") return visible.has(v.object_id);
        if (v.object_type === "dashboard") return dash.has(v.object_id);
        if (v.object_type === "deck") return decks?.find((d) => d.id === v.object_id)?.owner_id === viewer;
        if (v.object_type === "widget") { const w = widgets?.find((x) => x.id === v.object_id); return w ? (w.dashboard_id ? dash.has(w.dashboard_id) : w.owner_id === viewer) : false; }
        return true;
      })
      .map((v) => {
        const label =
          v.object_type === "metric" ? metrics.find((m) => m.id === v.object_id)?.name
          : v.object_type === "dashboard" ? dash.get(v.object_id)?.name
          : v.object_type === "deck" ? decks?.find((d) => d.id === v.object_id)?.name
          : v.object_type === "widget" ? (() => { const w = widgets?.find((x) => x.id === v.object_id); return w?.title ?? metrics.find((m) => m.id === w?.metric_ids?.[0])?.name; })()
          : undefined;
        const href = v.object_type === "metric" ? `/metrics/${metrics.find((m) => m.id === v.object_id)?.slug}` : v.object_type === "dashboard" ? `/dashboards/${v.object_id}` : v.object_type === "deck" ? `/decks/${v.object_id}` : v.object_type === "theme" ? `/themes?id=${v.object_id}` : null;
        return { at: v.updated_at, who: v.author_id, text: `${v.name ? `named “${v.name}” on` : v.message?.startsWith("Restored") ? v.message.toLowerCase() + " of" : v.message === "Before version history" ? "started the history of" : v.version === 1 ? "created" : "edited"} the ${NOUN[v.object_type]}${label ? ` ${label}` : ""}`, version: v.version, href, kind: "version" as const };
      }),
    ...(superseded ?? [])
      .filter((x) => visible.has(x.metric_id))
      .map((x) => {
        const m = metrics.find((y) => y.id === x.metric_id)!;
        return { at: x.superseded_at, who: null, text: `${m.name}, ${periodLabel(x.period_start, m.period, true)}: ${formatValue(m, Number(x.value))} was ${x.change === "deleted" ? "removed" : "replaced"}`, version: null, href: `/metrics/${m.slug}`, kind: "value" as const };
      }),
  ]
    .filter((i) => !sp.who || i.who === sp.who)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 150);

  return (
    <>
      <PageHeader title="Activity" sub="Every change to what people build, and every number that was replaced. Nothing here can be edited." />
      <nav aria-label="Filter by person" className="mb-4 flex flex-wrap gap-1 text-sm">
        <Link href="/activity" aria-current={!sp.who ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2.5 py-1 no-underline", !sp.who ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>Everyone</Link>
        {people.map((p) => (
          <Link key={p.id} href={`/activity?who=${p.id}`} aria-current={sp.who === p.id ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2.5 py-1 no-underline", sp.who === p.id ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>{p.name.split(" ")[0]}</Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-6 text-sm text-muted-foreground">No changes yet. Edits to widgets, dashboards, decks, templates, themes and metric descriptions show up here, and so do replaced values.</p>
      ) : (
        <ol className="stock divide-y divide-border rounded-[var(--radius-card)]">
          {items.map((i, n) => (
            <li key={n} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
              <span className="font-medium">{i.kind === "value" ? "A value" : name(i.who)}</span>
              {i.href ? <Link href={i.href} className="min-w-0 flex-1">{i.text}</Link> : <span className="min-w-0 flex-1">{i.text}</span>}
              {i.version && <span className="fig text-xs text-muted-foreground">v{i.version}</span>}
              <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(i.at), { addSuffix: true })}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
