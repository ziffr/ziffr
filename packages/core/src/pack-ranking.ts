// Pack ranking (spec 0052, ticket 5; GLOSSARY: Pack Audience, Workspace Profile, Business Function): which of Ziffr's own
// Packs to suggest first, from a Workspace's answers. Pure and deterministic: the same answers always give the same list,
// with no model, no randomness and no data from anyone else. It only orders and explains: it never hides a Pack, so the
// full list stays behind "See all Packs". Nothing here reads the database or builds a query; it compares keys.
import type { BusinessFunction } from "@ziffr/pack/business-functions";
import type { PackAudience } from "@ziffr/pack/audience";

/** What the ranking knows about the person asking: the Workspace Profile's answers and the Business Functions in play. */
export type RankAnswers = {
  industry: string | null;
  segment: string | null;
  country: string | null;
  employeeBand: string | null;
  revenueBand: string | null;
  functions: readonly BusinessFunction[];
};

/** A part of an audience that matched an answer, in the order the points are worth. */
export type Reason = "industry" | "function" | "segment" | "employeeBand" | "revenueBand" | "country";

/** The points each matched part adds, and so the order of the reasons: industry 4, function 3, segment 2, the rest 1. */
export const REASON_POINTS: Record<Reason, number> = { industry: 4, function: 3, segment: 2, employeeBand: 1, revenueBand: 1, country: 1 };

/** What each reason is called on screen ("suggested because: your industry, your function"). */
export const REASON_WORDS: Record<Reason, string> = {
  industry: "your industry", function: "your function", segment: "who you sell to", employeeBand: "your size", revenueBand: "your revenue", country: "your country",
};

/** A Pack as the ranking sees it: its id, name and optional audience. */
export type RankablePack = { id: string; name: string; audience?: PackAudience };

/** One Pack's place in the ranking: its score and the parts of its audience that matched. */
export type Ranked = { id: string; score: number; because: Reason[] };

/** How many Packs are suggested at the top. */
export const SUGGESTED = 3;

const REASONS = Object.keys(REASON_POINTS) as Reason[];

/** Which parts of `audience` match `answers`: a part the Pack does not list, or the person did not answer, adds nothing,
 * and a part the Pack lists and the answers miss adds nothing either, so no Pack is pushed down for being specific. */
function matched(audience: PackAudience | undefined, a: RankAnswers): Reason[] {
  if (!audience) return [];
  const has = (list: readonly string[] | undefined, v: string | null) => v !== null && Array.isArray(list) && list.includes(v);
  const hit: Record<Reason, boolean> = {
    industry: has(audience.industries, a.industry),
    function: Array.isArray(audience.functions) && a.functions.some((f) => audience.functions!.includes(f)),
    segment: has(audience.segments, a.segment),
    employeeBand: has(audience.employeeBands, a.employeeBand),
    revenueBand: has(audience.revenueBands, a.revenueBand),
    country: has(audience.countries, a.country),
  };
  return REASONS.filter((r) => hit[r]);
}

/** Every Pack, best fit first, none left out: by score, then by `order` (the fixed list Ziffr ships its Packs in; a Pack
 * not on it comes after those that are), then by name. With no answers, or none that match, nothing scores and the list
 * is the fixed order. `because` lists the matched parts in the order of their points. */
export function rankPacks(answers: RankAnswers, packs: readonly RankablePack[], order: readonly string[] = []): Ranked[] {
  const place = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  return packs
    .map((p) => { const because = matched(p.audience, answers); return { pack: p, because, score: because.reduce((n, r) => n + REASON_POINTS[r], 0) }; })
    .sort((x, y) => y.score - x.score || place(x.pack.id) - place(y.pack.id) || (x.pack.name < y.pack.name ? -1 : x.pack.name > y.pack.name ? 1 : 0) || (x.pack.id < y.pack.id ? -1 : x.pack.id > y.pack.id ? 1 : 0))
    .map((r) => ({ id: r.pack.id, score: r.score, because: r.because }));
}

/** The Packs to suggest at the top: the first three with a score above 0. Empty when nothing matches (the screen then
 * says "Answer About you to get suggestions" and lists every Pack in the fixed order). */
export function suggestedPacks(ranked: readonly Ranked[]): Ranked[] {
  return ranked.filter((r) => r.score > 0).slice(0, SUGGESTED);
}

/** The reasons as one sentence for the screen, at most `max` of them: "your industry and your function". */
export function becauseText(because: readonly Reason[], max = 2): string {
  const words = because.slice(0, max).map((r) => REASON_WORDS[r]);
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
