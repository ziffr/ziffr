// Tags from a Metric Catalog entry (GLOSSARY: Tag, Metric Catalog, Pack; spec 0038): a Metric made from an entry that brings
// Tags gets them, through the Tags core as the person who made it, so every rule of a Tag holds: the words are matched by
// name and made when new, within the limits, a Version records it. A limit never stops the Metric: the words that do not fit
// are left out and handed back for the page to say so. There is no link back to the entry (spec 0030).
import { Refused, type Actor } from "./actor";
import { addMetricTags } from "./tags";
import { tagNamesOf, TAGS_PER_ENTRY } from "./tag-names";

/** Puts an entry's Tags on the Metric just made from it. Answers the words left out (a limit, or a rule the words no longer
 * meet), never throws: the Metric is made either way. All at once when they fit; else one by one, so a word that exists
 * still goes on when a new one cannot be made. */
export async function tagMetricFromEntry(actor: Actor, metricId: number, entryTags: unknown): Promise<string[]> {
  const names = tagNamesOf(entryTags, TAGS_PER_ENTRY);
  if (!names.length) return [];
  try {
    await addMetricTags(actor, metricId, names);
    return [];
  } catch (e) {
    if (!(e instanceof Refused)) {
      console.error("Tags of a Metric Catalog entry could not be put on its Metric:", e);
      return names;
    }
  }
  const left: string[] = [];
  for (const name of names) {
    try {
      await addMetricTags(actor, metricId, [name]);
    } catch (e) {
      if (!(e instanceof Refused)) console.error("A Tag of a Metric Catalog entry could not be put on its Metric:", e);
      left.push(name);
    }
  }
  return left;
}
