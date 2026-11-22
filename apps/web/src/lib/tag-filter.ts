// The Tag filter of the Metrics list lives in the address (GLOSSARY: Tag; spec 0038): `?tag=finance&tag=monthly` shows the
// Metrics that carry all of them, so a filtered list can be bookmarked and shared. The address is untrusted input: it is
// cut to a few short words here and compared by the core against the Tags the person sees, never built into a query.
import { TAG_NAME_MAX, TAGS_PER_METRIC, normaliseTagName } from "@ziffr/pack/tag-names";

/** The Tag words of an address's `tag` parameter: normalised, without repeats (ignoring case), at most as many as a Metric carries. */
export function tagsFromParam(param: string | string[] | undefined): string[] {
  const raw = Array.isArray(param) ? param : param === undefined ? [] : [param];
  const seen = new Map<string, string>();
  for (const r of raw.slice(0, TAGS_PER_METRIC * 2)) {
    const n = normaliseTagName(String(r).slice(0, TAG_NAME_MAX * 2));
    if (n && n.length <= TAG_NAME_MAX && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  }
  return [...seen.values()].slice(0, TAGS_PER_METRIC);
}

/** The Metrics list's address for these Tags (and the Archived view when asked). */
export function tagFilterHref(tags: readonly string[], archived = false): string {
  const q = new URLSearchParams();
  for (const t of tags) q.append("tag", t);
  if (archived) q.set("show", "archived");
  const s = q.toString();
  return s ? `/metrics?${s}` : "/metrics";
}
