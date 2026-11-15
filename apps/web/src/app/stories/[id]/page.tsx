// One story (spec 0010, ticket #148; GLOSSARY: Story, Finding): read top to bottom; its owner and Editors write it.
// A story is kept as a dashboard, so who may open, share and change it is decided by the dashboard rules in the core.
import { notFound, redirect } from "next/navigation";
import { currentActor, viewerId } from "@/lib/viewer";
import { getCanvasData, getRawShares, revealedBy } from "@/lib/access";
import { closedDashboardOwner, dashboardWidgets } from "@ziffr/core/page-data";
import { visibleStories } from "@ziffr/core/stories";
import { switchableDashboards } from "@ziffr/core/home";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { StoryReader } from "@/components/story-reader";
import { can } from "@ziffr/core/actor";
import { RequestAccess } from "@/components/who-can-see";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const actor = await currentActor();
  const story = (await visibleStories(actor)).find((s) => s.id === id);
  if (!story) {
    // A dashboard opened by this address goes to its own page; one not shared offers to ask its owner.
    if ((await switchableDashboards(actor)).some((d) => d.id === id)) redirect(`/dashboards/${id}`);
    const owner = await closedDashboardOwner(actor, id);
    if (!owner) notFound();
    return (
      <div className="mx-auto max-w-md rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm">
        <p className="font-medium">This story isn&rsquo;t shared with you</p>
        <RequestAccess type="dashboard" id={id} owner={owner} />
      </div>
    );
  }
  const widgets = await dashboardWidgets(actor, id);
  const ids = [...new Set(widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))];
  const [data, shares] = await Promise.all([getCanvasData(await viewerId(), ids), getRawShares()]);
  const owner = story.role === "owner";
  const reveals = owner ? await revealedBy(ids, story.owner_id) : {};
  return (
    <StoryReader
      story={{ id: story.id, name: story.name, intro: story.intro ?? "", theme_id: story.theme_id }}
      widgets={widgets}
      data={data}
      editable={story.role === "owner" || story.role === "editor"}
      // Only the owner's Share dialog uses Shares, and only this story's: nobody else gets the workspace's list.
      sharing={{ owner, ownerId: story.owner_id, shares: owner ? shares.filter((s) => s.object_type === "dashboard" && s.object_id === story.id) : [], groups: data.groups, reveals, canCreate: can(actor, "create") }}
    />
  );
}
