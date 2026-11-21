// Other people's names in text a Guest is shown or sent (GLOSSARY: Guest): a Guest does not see who else is in the
// Workspace, and a message written for the Workspace (an Alert, a notice, a Prompt) may carry a colleague's name.
import type { Profile } from "./types";

/** A function that replaces the names, first names, emails and Slack handles of these people with "Someone". Whole
 * words only and case-sensitive, so a surname inside another word, or a first name written as an ordinary word in
 * lower case, stays; a first name under three letters is left alone, since it would hit ordinary words. */
export function nameHider(others: readonly Pick<Profile, "name" | "email" | "slack_handle">[]): (text: string) => string {
  const words = others.flatMap((p) => [p.name, p.name.split(/\s+/)[0], p.email, p.slack_handle]).filter((w): w is string => typeof w === "string" && w.length >= 3);
  if (!words.length) return (text) => text;
  const escaped = [...new Set(words)].sort((a, b) => b.length - a.length).map((w) => w.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&"));
  const re = new RegExp(`(?<![\\p{L}\\p{N}@])(?:${escaped.join("|")})(?![\\p{L}\\p{N}])`, "gu");
  return (text) => text.replace(re, "Someone");
}
