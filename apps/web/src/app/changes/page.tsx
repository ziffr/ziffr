import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { currentActor } from "@/lib/viewer";
import { getNumberStyle, getProfiles, getYearStart } from "@/lib/data";
import { activityView } from "@ziffr/core/page-data";
import { formatValue } from "@ziffr/core/format";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { periodLabel } from "@ziffr/core/periods";

// Governance: who changed what, and when, across everything the viewer may see.
const NOUN: Record<string, string> = { widget: "widget", dashboard: "dashboard", deck: "deck", metric: "metric description", template: "template", theme: "theme", workflow: "Workflow", master: "slide master", snapshot: "words of a Snapshot" };

export default async function ChangesPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const sp = await searchParams;
  // The core passes only versions and replaced values the person may see, and what labels them.
  const [people, { metrics, dashboards, versions, superseded, decks, widgets }, yearStart, numberStyle] = await Promise.all([getProfiles(), activityView(await currentActor()), getYearStart(), getNumberStyle()]);
  const dash = new Map(dashboards.map((d) => [d.id, d]));
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Someone";

  const items = [
    ...versions
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
    ...superseded
      .map((x) => {
        const m = metrics.find((y) => y.id === x.metric_id)!;
        return { at: x.superseded_at, who: null, text: `${m.name}, ${periodLabel(x.period_start, m.period, yearStart, true)}: ${formatValue(m, Number(x.value), numberStyle)} was ${x.change === "deleted" ? "removed" : "replaced"}`, version: null, href: `/metrics/${m.slug}`, kind: "value" as const };
      }),
  ]
    .filter((i) => !sp.who || i.who === sp.who)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 150);

  return (
    <>
      <PageHeader title="Changes" sub="Every change to what people build, and every number that was replaced. Nothing here can be edited." />
      <nav aria-label="Filter by person" className="mb-4 flex flex-wrap gap-1 text-sm">
        <Link href="/changes" aria-current={!sp.who ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2.5 py-1 no-underline", !sp.who ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>Everyone</Link>
        {people.map((p) => (
          <Link key={p.id} href={`/changes?who=${p.id}`} aria-current={sp.who === p.id ? "true" : undefined} className={cn("rounded-[var(--radius-input)] px-2.5 py-1 no-underline", sp.who === p.id ? "stock font-medium" : "text-muted-foreground hover:bg-muted")}>{p.name.split(" ")[0]}</Link>
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
