// Other people's names in text a Guest is shown or sent (GLOSSARY: Guest): a Guest does not see who else is in the
// Workspace, and a message written for the Workspace (an Alert, a notice, a Prompt) may carry a colleague's name.
// A View Link's page follows the same rule (ticket #590).
import type { Profile } from "./types";

type Person = Pick<Profile, "name" | "email" | "slack_handle">;
const escape = (w: string) => w.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
const longestFirst = (words: string[]) => [...new Set(words)].sort((a, b) => b.length - a.length).map(escape);
const usable = (words: (string | null | undefined)[], min = 3) => words.filter((w): w is string => typeof w === "string" && w.length >= min);

/** A function that replaces the names, first names, emails and Slack handles of these people with "Someone". Names
 * and first names are whole words and case-sensitive, so a surname inside another word, or a first name written as an
 * ordinary word in lower case, stays ("Al sent late" is hidden, "also" and "al dente" are not); a first name is a
 * name from two letters, since matching only as written and as a whole word keeps it off ordinary words. Emails and handles are matched in any capitalisation, as they are the same address either way. */
export function nameHider(others: readonly Person[]): (text: string) => string {
  const names = longestFirst([...usable(others.map((p) => p.name)), ...usable(others.map((p) => p.name.trim().split(/\s+/)[0]), 2)]);
  const contacts = longestFirst(usable(others.flatMap((p) => [p.email, p.slack_handle])));
  const edge = (alternatives: string[], flags: string) => (alternatives.length ? new RegExp(`(?<![\\p{L}\\p{N}@])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, flags) : null);
  const byName = edge(names, "gu");
  const byContact = edge(contacts, "giu");
  return (text) => {
    const hidden = byContact ? text.replace(byContact, "Someone") : text;
    return byName ? hidden.replace(byName, "Someone") : hidden;
  };
}

/** A function telling whether a text mentions one of these people in any capitalisation and anywhere inside it (a slug
 * such as "revenue-sara" has no word edges), for text that is kept as it is or replaced whole, never edited. */
export function mentionsPerson(others: readonly Person[]): (text: string) => boolean {
  const words = longestFirst(usable(others.flatMap((p) => [p.name, p.name.split(/\s+/)[0], p.email, p.slack_handle])));
  const re = words.length ? new RegExp(words.join("|"), "iu") : null;
  return (text) => Boolean(re?.test(text));
}
