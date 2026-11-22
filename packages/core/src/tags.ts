// Tags on Metrics (GLOSSARY: Tag; spec 0038): putting words on a Metric, and keeping a Workspace's words in order. Every
// function takes the Actor first and works only inside the actor's Workspace; what a person is shown of Tags is
// tag-sight.ts (visibleTags), so nothing here returns a Tag the actor could not see through a Metric of their own sight.
//
// Who may do what: anyone who may change a Metric's description (its owner, or an Editor of it) puts Tags on it and takes
// them off, a Guest Editor only Tags they already see; Owners and Admins rename, merge and delete Tags for the whole
// Workspace. Renaming, merging and deleting are not in the API or the MCP Server: they change many Metrics at once.
// A Tag's name is sealed with the Workspace Key and found by its blind index; the counts and limits are kept by the
// database in one step under a lock of the Workspace, so requests at once cannot pass a limit together.
import { randomUUID } from "node:crypto";
import { Forbidden, Refused, type Actor } from "./actor";
import { getShares } from "./access";
import { audit } from "./audit-log";
import { db } from "./db";
import { ServerFault } from "./server-fault";
import { cleanTagNames, normaliseTagName, tagKey, tagNameProblem, TAGS_PER_METRIC, TAGS_PER_WORKSPACE } from "./tag-names";
import { readTags, tagIndexes } from "./tag-rows";
import { tagSight, type VisibleTag } from "./tag-sight";
import { recordVersion } from "./versions";
import { workspaceCipher } from "./workspace-keys";

/** What a Metric's Tags change by: `set` makes them exactly the words given, `add` puts words on top, `remove` takes them off. */
export type TagChange = "set" | "add" | "remove";

const AT_LIMIT_METRIC = `A Metric has at most ${TAGS_PER_METRIC} Tags: take one off before adding another.`;
const AT_LIMIT_WORKSPACE = `This Workspace has ${TAGS_PER_WORKSPACE} Tags. Merge or delete Tags that are not needed, then add this one.`;
const GUESTS = "Guests use only the Tags they can see, and make no new ones.";

/** Whether the actor may put Tags on this Metric: its owner, or a person it is shared with as Editor, directly or through a
 * Group, in this Workspace, the Guest Editor included (who is further limited to Tags they see). A Viewer never. */
async function mayTag(actor: Actor, metricId: number): Promise<boolean> {
  if (!Number.isSafeInteger(metricId) || metricId < 1) return false;
  const { data: m } = await db().from("metrics").select("owner_id").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m) return false;
  if (m.owner_id === actor.personId) return true;
  return (await getShares(actor.workspaceId)).some((s) =>
    s.workspace_id === actor.workspaceId && s.object_type === "metric" && s.object_id === metricId && s.user_id === actor.personId && s.role === "editor");
}

/** Changes the Tags of one Metric as the person who may change it, and answers its Tags now (names, sorted). `set` is the
 * whole list of Tags, at most 10; `add` and `remove` are applied in the database to what the Metric has at that moment, so
 * two requests at once lose neither. A word that exists is the same Tag Workspace-wide, silently, whatever Metrics carry
 * it; a new word is made within the Workspace's 200, and a limit says what to do. A Guest Editor gets only Tags they
 * see. The change is a Version of the Metric with its author. Refused with words for a bad name, a limit or a Viewer. */
export async function changeMetricTags(actor: Actor, metricId: number, change: TagChange, input: unknown): Promise<string[]> {
  if (change !== "set" && change !== "add" && change !== "remove") throw new Forbidden();
  const cleaned = cleanTagNames(input);
  if ("error" in cleaned) throw new Refused(cleaned.error);
  if (!(await mayTag(actor, metricId))) throw new Forbidden("Only the Metric's owner and its Editors change its Tags.");
  const guest = actor.role === "guest";
  if (guest && change !== "remove") {
    // A Guest names only Tags they see; the answer is the same whether a word is unknown or only on what they do not see.
    const have = new Set((await tagSight(actor)).tags.map((t) => tagKey(t.name)));
    if (cleaned.names.some((n) => !have.has(tagKey(n)))) throw new Refused(GUESTS);
  }
  // What the actor sees before the change: a word that matches a Tag outside it is answered in the actor's own spelling, so the
  // answer never tells that the word exists out of sight, nor how it was first written.
  const before = new Set((await tagSight(actor)).tags.map((t) => t.id));
  const cipher = await workspaceCipher(actor.workspaceId);
  const tags = cleaned.names.map((name) => {
    const id = randomUUID();
    const index = tagIndexes(cipher, name);
    return { id, name: cipher.seal({ table: "tags", column: "name", row: id }, name), index: index.current, indexes: index.all };
  });
  const { data, error } = await db().rpc("set_metric_tags", {
    p_ws: actor.workspaceId, p_metric: metricId, p_by: actor.personId, p_mode: change, p_tags: tags, p_allow_new: !guest, p_max_metric: TAGS_PER_METRIC, p_max_ws: TAGS_PER_WORKSPACE,
  });
  if (error || !data) throw new ServerFault("The Tags could not be saved.");
  const status = (data as { status?: string }).status;
  if (status === "metric_limit") throw new Refused(AT_LIMIT_METRIC);
  if (status === "workspace_limit") throw new Refused(AT_LIMIT_WORKSPACE);
  if (status === "new") throw new Refused(GUESTS);
  if (status !== "ok") throw new Forbidden();
  // The Tags are part of the Metric's description: a change of them is a Version, with who made it.
  await recordVersion("metric", metricId, actor.personId, { message: "Changed its Tags" });
  const ids = new Set(((data as { ids?: string[] }).ids ?? []).map(String));
  const made = new Set<string>(tags.map((t) => t.id));
  const typed = new Map(cleaned.names.map((n) => [tagKey(n), n]));
  return (await readTags(actor.workspaceId)).filter((t) => ids.has(t.id))
    .map((t) => (before.has(t.id) || made.has(t.id) ? t.name : typed.get(tagKey(t.name)) ?? t.name))
    .sort((a, b) => tagKey(a).localeCompare(tagKey(b)));
}

/** A Metric's Tags set to exactly these words (see changeMetricTags). */
export const setMetricTags = (actor: Actor, metricId: number, names: unknown): Promise<string[]> => changeMetricTags(actor, metricId, "set", names);

/** Words put on a Metric on top of its Tags (see changeMetricTags). */
export const addMetricTags = (actor: Actor, metricId: number, names: unknown): Promise<string[]> => changeMetricTags(actor, metricId, "add", names);

/** Words taken off a Metric; one it does not carry is ignored (see changeMetricTags). */
export const removeMetricTags = (actor: Actor, metricId: number, names: unknown): Promise<string[]> => changeMetricTags(actor, metricId, "remove", names);

/** Brings back the Tags a Version of a Metric kept, as its owner restoring it: matched by name, a word that was deleted
 * meanwhile made again, within the limits. Where a limit would refuse, the words that exist are put back and the rest left
 * out, so a restore of the other fields is never lost to a full list. Returns the words left out. Callers check who may restore. */
export async function restoreMetricTags(actor: Actor, metricId: number, kept: unknown): Promise<string[]> {
  // A Version holds what was valid then; a word that is not now (a changed rule) is left out rather than refused.
  const names = [...new Map((Array.isArray(kept) ? kept : []).filter((k): k is string => typeof k === "string").slice(0, TAGS_PER_METRIC * 5).map(normaliseTagName).filter((n) => !tagNameProblem(n)).map((n) => [tagKey(n), n])).values()].slice(0, TAGS_PER_METRIC);
  try {
    await changeMetricTags(actor, metricId, "set", names);
    return [];
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    const exist = new Set((await readTags(actor.workspaceId)).map((t) => tagKey(t.name)));
    const usable = names.filter((n) => exist.has(tagKey(n)));
    await changeMetricTags(actor, metricId, "set", usable);
    return names.filter((n) => !exist.has(tagKey(n)));
  }
}

/** Refuses unless the actor is an Owner or Admin of the Workspace: they keep the Workspace's words in order. */
function assertKeeper(actor: Actor): void {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only Owners and Admins rename, merge and delete Tags.");
}

/** The Tag the actor sees with this id; Forbidden for one they do not see (or that is not of their Workspace), so the answer
 * is the same whether it exists or not. */
async function seenTag(actor: Actor, id: unknown): Promise<{ tag: VisibleTag; all: VisibleTag[] }> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Forbidden();
  const all = await visibleTagsOf(actor);
  const tag = all.find((t) => t.id === id.toLowerCase());
  if (!tag) throw new Forbidden();
  return { tag, all };
}

const visibleTagsOf = async (actor: Actor): Promise<VisibleTag[]> => (await tagSight(actor)).tags;

/** What a rename, merge or delete of a Tag touches, as the actor may be told: the Metrics they see that carry it, and whether
 * any they do not see do too (only that, nothing about them). For the confirmation: "removes this Tag from 7 Metrics you can
 * see and any you cannot". Owners and Admins only, and only for a Tag they see. */
export async function tagImpact(actor: Actor, tagId: string): Promise<{ name: string; metrics: number; hidden: boolean }> {
  assertKeeper(actor);
  const { tag } = await seenTag(actor, tagId);
  const { count } = await db().from("metric_tags").select("metric_id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("tag_id", tag.id);
  return { name: tag.name, metrics: tag.metrics, hidden: (count ?? 0) > tag.metrics };
}

/** Renames a Tag for the whole Workspace (also the spelling of its capitals). Owners and Admins, for a Tag they see. A name
 * another Tag the actor sees already has is refused and says to merge; one that only Metrics the actor does not see carry
 * is the same Tag Workspace-wide, so the two are merged without a word about those Metrics. Audit Log: tag.renamed. */
export async function renameTag(actor: Actor, tagId: string, name: unknown): Promise<{ name: string }> {
  assertKeeper(actor);
  const { tag, all } = await seenTag(actor, tagId);
  const next = normaliseTagName(name);
  const problem = tagNameProblem(next);
  if (problem) throw new Refused(problem);
  const other = (await readTags(actor.workspaceId)).find((t) => t.id !== tag.id && tagKey(t.name) === tagKey(next));
  if (other) {
    if (all.some((t) => t.id === other.id)) throw new Refused(`There is already a Tag “${other.name}”. Merge the two instead.`);
    // The word is used only where the actor cannot see: it is the same Tag Workspace-wide, so this is a merge into it, answered
    // as a rename to the actor's own spelling: no signal that the word existed, and never the other Tag's name.
    await mergeInto(actor, tag, { id: other.id, name: other.name });
    return { name: next };
  }
  const cipher = await workspaceCipher(actor.workspaceId);
  const index = tagIndexes(cipher, next);
  const { data, error } = await db().rpc("rename_tag", { p_ws: actor.workspaceId, p_id: tag.id, p_name: cipher.seal({ table: "tags", column: "name", row: tag.id }, next), p_index: index.current, p_indexes: index.all });
  if (error) throw new ServerFault("The Tag could not be renamed.");
  // Another Tag took the name between the check and the change: said as a merge, with no word about which.
  if (data === "exists") throw new Refused("There is already a Tag with that name. Merge the two instead.");
  if (data !== "ok") throw new Forbidden();
  await audit(actor, { kind: "tag.renamed", object: { type: "tag", id: tag.id, name: next }, details: { from: tag.name, metrics: tag.metrics } });
  return { name: next };
}

/** Moves every Metric of a Tag to another and removes the first, as Owners and Admins, both Tags seen by them. Metrics the
 * actor does not see that carry the first carry the other afterwards, and the actor learns nothing about them. A Metric
 * with both keeps one. Audit Log: tag.merged. */
export async function mergeTags(actor: Actor, fromId: string, intoId: string): Promise<{ metrics: number }> {
  assertKeeper(actor);
  const [{ tag: from }, { tag: into }] = [await seenTag(actor, fromId), await seenTag(actor, intoId)];
  if (from.id === into.id) throw new Refused("Pick two different Tags to merge.");
  await mergeInto(actor, from, into);
  return { metrics: from.metrics };
}

async function mergeInto(actor: Actor, from: Pick<VisibleTag, "id" | "name" | "metrics">, into: { id: string; name: string }): Promise<void> {
  const { data, error } = await db().rpc("merge_tags", { p_ws: actor.workspaceId, p_from: from.id, p_into: into.id });
  if (error) throw new ServerFault("The Tags could not be merged.");
  if (data !== "ok") throw new Forbidden();
  // The first Tag is gone, so it names no one's sight: the event is shown only to the person who did it.
  await audit(actor, { kind: "tag.merged", object: { type: "tag", id: from.id, name: from.name }, details: { into: into.name, metrics: from.metrics } });
}

/** Removes a Tag from every Metric, those the actor does not see included, as Owners and Admins for a Tag they see. Answers
 * how many Metrics the actor saw it on. Audit Log: tag.deleted. */
export async function deleteTag(actor: Actor, tagId: string): Promise<{ metrics: number }> {
  assertKeeper(actor);
  const { tag } = await seenTag(actor, tagId);
  const { data, error } = await db().rpc("delete_tag", { p_ws: actor.workspaceId, p_id: tag.id });
  if (error) throw new ServerFault("The Tag could not be deleted.");
  if (data !== "ok") throw new Forbidden();
  await audit(actor, { kind: "tag.deleted", object: { type: "tag", id: tag.id, name: tag.name }, details: { metrics: tag.metrics } });
  return { metrics: tag.metrics };
}
