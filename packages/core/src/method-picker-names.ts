// The picker's questions in the Metrics' own words (GLOSSARY: Method, Slot; ticket #988): "What moves B?" becomes "What moves Cost?"
// once the Metric is known, "What does B need to reach a value?" becomes "What does Revenue need to reach 1.2m?". Where a Slot is still
// empty the generic words stay. Pure, so the list (core) and the screen (browser) word an entry the same way; the names it is given
// are the ones of Metrics the person may see, never looked up here.
import type { EntryId } from "./method-picker";

/** What is known of the answers so far, in words: the names of the Metrics in each Slot and the typed settings. */
export type Picked = { metric?: string; first?: string; second?: string; held?: string[]; metrics?: string[]; goal?: string; by?: string; percent?: string };

const and = (names: string[]) => (names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
const typed = (s: string | undefined) => (s && s.trim() !== "" ? s.trim() : undefined);

// One wording for each entry; null where a Slot it needs is empty, so the generic name stays.
const NAMED: Record<EntryId, (p: Picked) => string | null | undefined> = {
  forecast: (p) => p.metric && `Where is ${p.metric} heading?`,
  "reach-target": (p) => p.metric && `Will ${p.metric} reach its Target?`,
  correlation: (p) => p.first && p.second && `Does ${p.first} move with ${p.second}?`,
  matrix: (p) => p.metrics && p.metrics.length >= 3 ? `How do ${and(p.metrics)} move together?` : null,
  rank: (p) => p.first && p.second && `Do ${p.first} and ${p.second} rise and fall in step, whatever their size?`,
  partial: (p) => p.first && p.second && p.held?.length ? `Do ${p.first} and ${p.second} still move together when ${and(p.held)} is held the same?` : null,
  lag: (p) => p.first && p.second && `Does ${p.first} come before ${p.second}? By how long?`,
  moves: (p) => p.metric && `What moves ${p.metric}?`,
  needs: (p) => p.metric && `What does ${p.metric} need to reach ${typed(p.goal) ?? "a value"}?`,
  "what-if": (p) => p.metric && `What if we change ${p.metric}${typed(p.percent) ? ` by ${typed(p.percent)} %` : typed(p.by) ? ` by ${typed(p.by)}` : ""}?`,
  "after-date": (p) => p.metric && `Did it work for ${p.metric}?`,
  "change-point": (p) => p.metric && `Did ${p.metric} change, and when?`,
  bridge: (p) => p.metric && `Why did ${p.metric} change from last period?`,
  usual: (p) => p.metric && `What is usual for ${p.metric}? Is this value unusual?`,
  "top-share": (p) => p.metric && `How much do the biggest rows of ${p.metric} make up?`,
  pareto: (p) => p.metric && `Which few rows make up most of ${p.metric}?`,
};

/** The entry's question worded with the Metrics chosen so far, or its generic words (`generic`) where a Slot is empty. */
export function questionFor(id: EntryId, picked: Picked, generic: string): string {
  return NAMED[id](picked) || generic;
}

/** The entry's one sentence with "B" replaced by the Metric's name for the entries that speak of B; otherwise as it is. */
export function sentenceFor(id: EntryId, sentence: string, picked: Picked): string {
  return (id === "moves" || id === "needs") && picked.metric ? sentence.replace(/\bB\b/g, picked.metric) : sentence;
}
