// The setting **Ask for a note** and the words of the question (spec 0064, "The setting" and "The question"; GLOSSARY:
// Metric Description, Value Note). Pure, so the screens, the senders and the core word it alike. No wording here gives
// a reason: whether a question comes may depend on whether a value is off target or unusual, and its words never say so.

/** When a Metric asks for a note after only a number came in. */
export const ASK_NOTE = ["always", "off_target_or_unusual", "never"] as const;
/** One choice of **Ask for a note**. */
export type AskNote = (typeof ASK_NOTE)[number];

/** What a Metric does until its owner or an Editor says otherwise, existing Metrics included. */
export const ASK_NOTE_DEFAULT: AskNote = "always";

/** The name of the setting on every screen. */
export const ASK_NOTE_SETTING = "Ask for a note";

/** Each choice as the screens name it. */
export const ASK_NOTE_LABEL: Record<AskNote, string> = { always: "Always", off_target_or_unusual: "Only when off target or unusual", never: "Never" };

/** What the setting does, said under it. */
export const ASK_NOTE_HINT = "Asked once, inside the confirmation, when only a number came in. Never an extra message.";

/** Whether something from a browser, a program or a row is one of the choices. */
export const isAskNote = (v: unknown): v is AskNote => (ASK_NOTE as readonly unknown[]).includes(v);

/** The most Metrics one change of **Ask for a note** covers. */
export const ASK_NOTE_MANY = 500;

/** The question a text reply's confirmation ends with. In a message with several numbers (`numbered`), `positions` are
 * those it asks about, and the reply says which one its words are for. */
export function noteQuestion(numbered: boolean, positions: readonly number[]): string {
  const [first] = positions;
  if (positions.length > 1) return `Anything behind them? Reply "${first}: your words" (${positions.join(", ")}), or leave it. Everyone who sees a Metric can read the words on it.`;
  return `Anything behind it? Reply ${numbered ? `"${first}: your words"` : "with a few words"}, or leave it. Everyone who sees this Metric can read them.`;
}

/** The question where the words are typed into a field: on a form, a panel and a Held Reply's page. */
export const NOTE_FIELD_QUESTION = "Anything behind it?";
