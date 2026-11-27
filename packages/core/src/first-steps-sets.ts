// First Steps' ready-made sets (spec 0067; GLOSSARY: First Steps, Pack, Pack Audience): which of Ziffr's own Packs a new
// Workspace is offered, in which order and why, and the one a person opens. It only reads: nothing is installed or
// written. Owners and Admins only (they alone install Packs), never an Access Key, never the demo. A browser names a set
// by its Pack id alone, which is looked up among those offered and never used as a path or a query. What goes back is
// what Ziffr's own Pack files say and why each fits, in words: nothing of a person.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { privateSets, TOPICS, USED_BY, type Topic, type UsedBy } from "./first-steps-screens";
import { bundledPacks, readIncludedPack, recommendedPacks, type RecommendedPack } from "./included-packs";
import type { Reason } from "./pack-ranking";
import type { PackPreview } from "./packs";

// Not a start for a new Workspace: a deck for a board, the numbers about this Workspace, and the operator's.
const NOT_OFFERED: readonly string[] = ["ziffr/board-meeting", "ziffr/workspace-usage", "ziffr/ziffr-operations"];

// Each reason in the words of the question First Steps asked.
const ANSWER_WORDS: Record<Reason, string> = { industry: "business", function: "role", segment: "customers", employeeBand: "size", revenueBand: "revenue", country: "country" };

/** Why a set fits, such as "Matches your business and role" (the two that count most), or null when nothing matches. */
function matchWords(because: readonly Reason[]): string | null {
  const words = because.slice(0, 2).map((r) => ANSWER_WORDS[r]);
  return words.length ? `Matches your ${words.join(" and ")}` : null;
}

/** One ready-made set as the list shows it. */
export type FirstStepsSet = {
  /** The Pack's id. */
  id: string;
  name: string;
  /** The Pack's one sentence about what setting it up does, or its summary when it has none. */
  summary: string;
  /** How many Metric Catalog entries it brings. */
  metrics: number;
  /** Why it fits the answers, or null. */
  match: string | null;
};

/** The sets offered, best fit first, and whether the Workspace is for one person alone. */
export type FirstStepsSets = { alone: boolean; sets: FirstStepsSet[] };

/** Of Ziffr's own Packs, in the order given, those First Steps offers: a team gets all but the three that are no start,
 * a person alone only those for private use that fit their topic (spec 0067, decision 6). */
export function offeredSets(recommended: readonly RecommendedPack[], usedBy: UsedBy, topic: Topic | null = null): FirstStepsSet[] {
  const own = privateSets(topic);
  const offered = (id: string) => (usedBy === "me" ? own.includes(id) : !NOT_OFFERED.includes(id));
  return recommended.filter((p) => offered(p.id)).map((p) => ({
    id: p.id, name: p.name, summary: bundledPacks().get(p.id)?.pack.setUp?.line || p.summary,
    metrics: p.brings.find((b) => b.kind === "metric")?.count ?? 0,
    match: matchWords(p.because),
  }));
}

/** The ready-made sets for this Workspace, ordered by its answers; none for anyone who may not install a Pack. The
 * topic is not stored, so the browser says it: anything not on the list counts as none, and it only narrows the sets. */
export async function firstStepsSets(actor: Actor, topic?: unknown): Promise<FirstStepsSets> {
  const recommended = await recommendedPacks(actor);
  if (!recommended.length) return { alone: false, sets: [] };
  const { data, error } = await db().from("workspaces").select("used_by").eq("id", actor.workspaceId).single();
  if (error) throw new Error("The sets could not be read.");
  const usedBy = USED_BY.find((u) => u === data.used_by) ?? "team";
  return { alone: usedBy === "me", sets: offeredSets(recommended, usedBy, TOPICS.find((t) => t === topic) ?? null) };
}

/** The Pack Preview of one offered set, to draw before anything is installed; any other id is refused. */
export async function firstStepsSet(actor: Actor, packId: unknown, topic?: unknown): Promise<PackPreview> {
  const set = (await firstStepsSets(actor, topic)).sets.find((s) => s.id === packId);
  if (!set) throw new Forbidden("That set is not offered here.");
  const read = await readIncludedPack(actor, set.id);
  if (!read.ok) throw new Error("This set could not be read.");
  return read.preview;
}
