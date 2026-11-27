// What the forms that type a value in share on the way in (GLOSSARY: Token, Value Note, Breakdown; spec 0064): whether
// they offer a note, how a note goes along, what is said about it, and how a form link sends a value. It adds no right:
// every value goes through the same intake (submissions.ts), which checks the Token and the period.
import { combinedPromptsOn } from "./combined-switch";
import { submissionEffects, submitValue, type SubmissionEffects, type SubmissionResult } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";

/** The longest text of a value with its Breakdown a form link takes; more is cut off. */
const MAX_TEXT = 5000;

/** Whether the forms of a Workspace offer a note field. It comes with the Combined Prompt (combined-switch.ts); never
 * in the demo, which keeps none. */
export const noteFieldsOn = (workspaceId: string): boolean => combinedPromptsOn() && workspaceId !== DEMO_WORKSPACE_ID;

/** The note a form sent, to go with its value; nothing while the forms offer none or when the field was empty. Untrusted:
 * the core checks and cuts the words where it saves them, after the value. */
export function formNote(note: unknown): { valueNote?: string } {
  return combinedPromptsOn() && typeof note === "string" && note.trim() ? { valueNote: note } : {};
}

/** The intake's answer with what became of the note said after it. A note that was not saved never undoes the value. */
export function withNoteWords(r: SubmissionResult): SubmissionResult {
  const note = r.valueNote;
  if (!note) return r;
  const said = !note.saved ? `Your note was not saved. ${note.reason}` : note.cut ? "Your note was saved, cut to 1,000 characters." : r.outcome === "proposed_locked" ? "Your note goes with it." : "Your note was saved.";
  return { ...r, detail: `${r.detail} ${said}` };
}

/** What a form link's form sends: the number as typed, the Breakdown as pasted lines, the period when one was picked and
 * the note. All of it comes from a browser. */
export type FormLinkEntry = { value: string; breakdown?: string; period?: string; note?: unknown };

/** Sends what was typed into a form that is no sign-in: the code is the Token's, and the intake takes only the running
 * period or one that Token was asked for. A Breakdown travels as "label value" lines; a typed total joins them as a
 * Total line. */
export async function submitFormLink(code: string, entry: FormLinkEntry, effects: SubmissionEffects = submissionEffects): Promise<SubmissionResult> {
  const value = entry.value.trim();
  const breakdown = (entry.breakdown ?? "").trim();
  const text = breakdown ? `${breakdown}${value ? `\nTotal ${value}` : ""}` : value;
  return withNoteWords(await submitValue({ source: "web_form", sender: code, text: text.slice(0, MAX_TEXT), ...(entry.period === undefined ? {} : { formPeriod: entry.period }), ...formNote(entry.note) }, effects));
}
