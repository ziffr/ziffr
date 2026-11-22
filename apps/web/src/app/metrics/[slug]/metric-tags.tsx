// A Metric's Tags on its page (GLOSSARY: Tag; spec 0038), each read as the viewer sees them: the Metric's own Tags, and for those who
// may change it the Workspace's Tags they see as suggestions, every one known to them through a Metric they may see.
import { cache } from "react";
import type { Actor } from "@ziffr/core/actor";
import { tagSight } from "@ziffr/core/tag-sight";
import { TagChips } from "@/components/tag-chips";
import { TagsEditor } from "./tags-editor";

// One read per request for the chips above and the row below; keyed by what decides the sight.
const sightFor = cache(async (_key: string, actor: Actor) => tagSight(actor));
const sightOf = (actor: Actor) => sightFor(`${actor.workspaceId}:${actor.personId}`, actor);

/** The chips under the page's title; nothing for a Metric without Tags the viewer sees. */
export async function MetricTagChips({ actor, metricId }: { actor: Actor; metricId: number }) {
  const names = (await sightOf(actor)).namesByMetric.get(metricId) ?? [];
  return names.length ? <TagChips names={names} max={names.length} className="mb-3" /> : null;
}

/** The Tags row of the Description box: an editor for who may change the Metric, chips for everyone else. */
export async function MetricTagsRow({ actor, metricId, canEdit }: { actor: Actor; metricId: number; canEdit: boolean }) {
  const sight = await sightOf(actor);
  const names = sight.namesByMetric.get(metricId) ?? [];
  if (canEdit) return <TagsEditor metricId={metricId} tags={names} suggestions={sight.tags.map((t) => t.name)} guest={actor.role === "guest"} />;
  return names.length ? <TagChips names={names} max={names.length} /> : <>None</>;
}
