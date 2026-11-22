// Tags in the workspace settings (GLOSSARY: Tag; spec 0038): the Workspace's words for Metrics with how many Metrics each is on,
// for Owners and Admins to rename, merge and delete, and for Members to look at. Only Tags the person sees are listed, and
// counts are of Metrics they see: a Tag only on Metrics out of their sight is not here. A Guest has no Tags page.
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { visibleTags } from "@ziffr/core/tag-sight";
import { TAGS_PER_WORKSPACE } from "@ziffr/core/tag-names";
import { currentActor } from "@/lib/viewer";
import { TagsList } from "./form";

export default async function TagsPage() {
  const actor = await currentActor();
  if (actor.role === "guest") redirect("/metrics");
  const keeper = actor.role === "owner" || actor.role === "admin";
  const tags = (await visibleTags(actor)).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return (
    <>
      <PageHeader title="Tags" sub={`Free words on Metrics, to find and group them. A Workspace has at most ${TAGS_PER_WORKSPACE}. ${keeper ? "Rename, merge or delete them here." : "Owners and Admins rename, merge and delete them."}`} />
      <div className="max-w-3xl">
        {tags.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-8 text-center text-sm text-muted-foreground">No Tags yet. Add one to a Metric on its Settings tab.</p>
        ) : (
          <TagsList tags={tags.map((t) => ({ id: t.id, name: t.name, metrics: t.metrics }))} keeper={keeper} />
        )}
      </div>
    </>
  );
}
