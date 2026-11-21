// The dashboards list (spec 0010, ticket #146; GLOSSARY: Dashboard): every dashboard the person may open, theirs
// first, then those shared with them, and which one is their Home. The core decides what is listed.
import Link from "next/link";
import { Home, LayoutDashboard } from "lucide-react";
import { getNumberStyle, getProfileMap } from "@/lib/data";
import { currentActor } from "@/lib/viewer";
import { pinnedDashboards } from "@ziffr/core/pinned-dashboards";
import { PinButton } from "@/components/pinned-dashboards";
import { homeDashboard, switchableDashboards } from "@ziffr/core/home";
import { can } from "@ziffr/core/actor";
import { newDashboard } from "@/app/home-actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DashboardAccess } from "@/lib/access";
import { dashboardTemplateChoices } from "@ziffr/core/dashboard-templates";
import { NewDashboardButton } from "@/components/new-dashboard-dialog";
import { AnsweredForm } from "@/components/answered-form";

export default async function DashboardsPage() {
  const actor = await currentActor();
  const [dashboards, people, choices, numberStyle] = await Promise.all([switchableDashboards(actor), getProfileMap(), dashboardTemplateChoices(actor), getNumberStyle()]);
  const home = await homeDashboard(actor, dashboards);
  const pinned = new Set((await pinnedDashboards(actor)).map((d) => d.id));
  const mine = dashboards.filter((d) => d.role === "owner");
  const shared = dashboards.filter((d) => d.role !== "owner");
  const card = (d: DashboardAccess) => (
    <li key={d.id} className="relative">
      <Link href={`/dashboards/${d.id}`} className="stock flex items-start gap-3 rounded-[var(--radius-card)] p-4 pr-12 no-underline transition-[transform,box-shadow] hover:-translate-y-px hover:[box-shadow:var(--edge-stock),var(--cast-stock-lift)]">
        <LayoutDashboard aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">{d.name}{d.id === home?.id && <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground"><Home aria-hidden className="size-3.5" /> Home</span>}</div>
          <div className="text-xs text-muted-foreground">{d.role === "owner" ? "Yours" : `From ${people[d.owner_id]?.name ?? "someone"}, you ${d.role === "editor" ? "can edit it" : "can look at it"}`}</div>
        </div>
      </Link>
      <PinButton compact dashboardId={d.id} name={d.name} pinned={pinned.has(d.id)} className="absolute top-3 right-3" />
    </li>
  );
  return (
    <>
      <PageHeader title="Dashboards" sub="Watch your numbers as they come in. Ziffr opens on your Home dashboard; choose it on any dashboard with Make this my home.">
        {can(actor, "create") && (
          <AnsweredForm action={newDashboard} className="flex gap-2">
            <Input name="name" required maxLength={120} placeholder="Name of the new dashboard" aria-label="Name of the new dashboard" className="w-60" />
            <Button type="submit">New dashboard</Button>
          </AnsweredForm>
        )}
        {can(actor, "create") && (
          <NewDashboardButton templates={choices.templates} metrics={choices.metrics} numberStyle={numberStyle} label="From a template…" variant="outline" />
        )}
      </PageHeader>
      {!dashboards.length ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-10 text-center">
          <LayoutDashboard aria-hidden className="mx-auto mb-3 size-7 text-muted-foreground" />
          <p className="font-medium">No dashboards yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Name one above, or ask a colleague to share theirs with you.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {mine.length > 0 && <section><h2 className="mb-3 text-sm font-medium text-muted-foreground">Mine</h2><ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{mine.map(card)}</ul></section>}
          {shared.length > 0 && <section><h2 className="mb-3 text-sm font-medium text-muted-foreground">Shared with me</h2><ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shared.map(card)}</ul></section>}
        </div>
      )}
    </>
  );
}
