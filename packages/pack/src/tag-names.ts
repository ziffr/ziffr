// Tag names and their limits (GLOSSARY: Tag; spec 0038): the one function that turns what a person, a program or a Pack
// typed into a Tag name, so the app, the API, the MCP Server and the Pack checks agree. Pure; the words of a refusal are
// ones a person may be told.

/** The longest Tag name, in characters, after normalising. */
export const TAG_NAME_MAX = 32;
/** The most Tags one Metric carries: a list that needs more is a folder tree in disguise. */
export const TAGS_PER_METRIC = 10;
/** The most Tags a Metric Catalog entry in a Pack carries (spec 0038). */
export const TAGS_PER_ENTRY = 5;
/** The most Tags in one Workspace; a Tag with no Metric left is removed, so this counts words in use. */
export const TAGS_PER_WORKSPACE = 200;

// Control and format characters (bidi controls, zero width marks, Unicode tag characters, the soft hyphen), private-use and
// unassigned code points, and the blank fillers and variation selectors that make a word look like another: a Tag shows as plain text everywhere and must look like what it is.
const UNSAFE = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\u00AD\u115F\u1160\u180E\u200B\u3164\uFFA0\uFE00-\uFE0F\u{E0100}-\u{E01EF}\u{E0000}-\u{E007F}]/u;

/** A Tag name normalised: Unicode NFC, leading `#` removed, surrounding space removed, every run of white space one
 * space. Whether the result is allowed is tagNameProblem's to say. */
export function normaliseTagName(raw: unknown): string {
  return String(raw ?? "").normalize("NFC").trim().replace(/^#+/, "").replace(/\s+/g, " ").trim();
}

/** What is wrong with a normalised Tag name, in words, or null when it is allowed: 1 to 32 characters, plain text only
 * (no control characters, no comma, no markup). */
export function tagNameProblem(name: string): string | null {
  const length = [...name].length;
  if (length < 1) return "A Tag needs a word.";
  if (length > TAG_NAME_MAX) return `A Tag is at most ${TAG_NAME_MAX} characters.`;
  if (name.includes(",")) return "A Tag has no comma: a comma separates Tags.";
  if (/[<>]/.test(name)) return "A Tag is plain text, without markup.";
  if (UNSAFE.test(name)) return "A Tag is plain text, without control characters.";
  return null;
}

/** What two names are compared by: equal ignoring case, so `Finance` and `finance` are one Tag. No other folding. */
export const tagKey = (name: string): string => name.toLowerCase();

/** A list of Tag names from untrusted input, each normalised and checked, the same Tag once (the first spelling stays),
 * in the order given. Anything that is not a list of words, more than `max` Tags, or a name that is not allowed
 * is an error in words, never a silent cut. */
export function cleanTagNames(input: unknown, max = TAGS_PER_METRIC): { names: string[] } | { error: string } {
  if (!Array.isArray(input)) return { error: "Tags are a list of words." };
  // A list far beyond the limit is refused before anything is read of it.
  if (input.length > max * 5) return { error: `A Metric has at most ${max} Tags.` };
  const seen = new Map<string, string>();
  for (const raw of input) {
    if (typeof raw !== "string") return { error: "Every Tag is a word." };
    const name = normaliseTagName(raw);
    const problem = tagNameProblem(name);
    if (problem) return { error: problem };
    if (!seen.has(tagKey(name))) seen.set(tagKey(name), name);
  }
  if (seen.size > max) return { error: `A Metric has at most ${max} Tags: take one off before adding another.` };
  return { names: [...seen.values()] };
}

/** The Tag names of a list that was checked already (or came from the database): each normalised, the same Tag once, in
 * order, at most `max`; a list that does not pass is no names rather than half of them. */
export function tagNamesOf(input: unknown, max = TAGS_PER_METRIC): string[] {
  const cleaned = cleanTagNames(input, max);
  return "names" in cleaned ? cleaned.names : [];
}
