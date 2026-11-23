// What a Heads-up message says (GLOSSARY: Heads-up, Takeaway; spec 0041, "Heads-ups"): the Takeaway's own sentence, what it is based
// on and the one footer line, nothing else about any Metric. Pure: it is given the Heads-up and the names of the Metrics it is
// about (which the person it goes to may see), so what it holds cannot depend on any other Metric. The same sentence is on the
// Analyze page, in the API and here: nothing is worded twice.
import type { HeadsUp } from "./methods/heads-up";

/** How many Heads-ups reach a person by message in a week at most. */
export const WEEKLY_CAP = 3;

/** The longest subject of a message, in characters. */
const SUBJECT_MAX = 120;

/** What the message of one Heads-up says: a subject naming its Metrics, and the text; null for a Heads-up that has no sentence to say. */
export function headsUpMessage(h: Pick<HeadsUp, "takeaway">, names: readonly string[]): { subject: string; text: string } | null {
  const t = h.takeaway;
  // The footer is part of what a Heads-up says: without it nothing is sent.
  if (t.kind !== "answer" || !t.sentence || !t.footer) return null;
  const basis = t.basis ? `${t.basis[0].toUpperCase()}${t.basis.slice(1)}.` : null;
  const subject = `Heads-up: ${names.join(" and ")}`;
  return {
    subject: [...subject].length > SUBJECT_MAX ? `${[...subject].slice(0, SUBJECT_MAX - 1).join("")}…` : subject,
    text: [t.sentence, basis, t.footer, `At most ${WEEKLY_CAP} Heads-ups a week reach you by message; the rest wait under Analyze. You can turn these messages off under Your Deliveries.`].filter(Boolean).join("\n"),
  };
}
