// What may become of a made deck's description (GLOSSARY: Deck Description, Slide Type; spec 0069): the changes a
// person's form makes, clearing the answers, and the slides made from a list of Metrics. Pure: deck-write.ts decides who
// may do it and stores the result. A form sends changes, never a whole document, so a browser can name no Metric.
import { checkDeckDescription, DECK_DESCRIPTION_FORMAT, DECK_DESCRIPTION_LIMITS as LIMITS, type DeckDescription, type DeckDesign, type SlideDescription, type SlideType } from "@ziffr/pack/deck-description";
import { Forbidden, Refused } from "./actor";

/** What a form changes of a made deck. A field left out stays; an empty headline means Ziffr's own. */
export type DeckChange = {
  design?: DeckDesign;
  slides?: { id: string; hidden?: boolean; headline?: string | null; answers?: { question: string; text: string }[] }[];
};

/** Who changes it: the slides they are sent, how their words are taken, and the day written. */
export type DeckWriter = { sees: (slide: SlideDescription) => boolean; words: (text: string) => string; today: string };

const UNREADABLE = "Ziffr could not read this change. Reload the deck and try again.";
const NOT_KEPT = `These slides cannot be saved. A headline holds up to ${LIMITS.headline} characters, a question up to ${LIMITS.question}, and a question slide or chart up to ${LIMITS.answers} answers of ${LIMITS.answer} characters in at most ${LIMITS.answerLines} lines, all in plain text.`;

/** A value from a browser as an object with no other keys than these. */
function only(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k))) throw new Refused(UNREADABLE);
  return value as Record<string, unknown>;
}

/** Typed words as stored: trimmed, with plain line breaks. */
function typed(value: unknown, words: DeckWriter["words"]): string {
  if (typeof value !== "string") throw new Refused(UNREADABLE);
  // Far over any limit: refused before the words are looked at.
  if (value.length > 4 * LIMITS.answer) throw new Refused(NOT_KEPT);
  const text = value.replace(/\r\n?/g, "\n").trim();
  return text && words(text);
}

/** A slide's answers as stored. Ziffr dates them: words that stand as they were keep their day. */
function answersFrom(value: unknown, stored: SlideDescription["answers"], by: DeckWriter): SlideDescription["answers"] {
  if (!Array.isArray(value) || value.length > LIMITS.answers) throw new Refused(NOT_KEPT);
  return value.map((entry) => {
    const a = only(entry, ["question", "text"]);
    const question = typed(a.question, by.words), text = typed(a.text, by.words);
    return { question, text, writtenOn: text ? (stored.find((s) => s.text === text)?.writtenOn ?? by.today) : null };
  });
}

/** A description that passes its checks, or a refusal in plain words. */
function checked(description: unknown): DeckDescription {
  const result = checkDeckDescription(description);
  if (!result.ok) throw new Refused(NOT_KEPT);
  return result.value;
}

/** The stored description with a form's change. A slide the writer is not sent and a slide the deck does not have are
 * refused alike, so an id tells nothing. */
export function changedDescription(stored: DeckDescription, change: unknown, by: DeckWriter): DeckDescription {
  const { design, slides = [] } = only(change, ["design", "slides"]);
  if (!Array.isArray(slides) || slides.length > LIMITS.slides) throw new Refused(UNREADABLE);
  const changed = new Map<string, unknown>();
  for (const entry of slides) {
    const { id, hidden, headline, answers } = only(entry, ["id", "hidden", "headline", "answers"]);
    if (typeof id !== "string" || changed.has(id)) throw new Refused(UNREADABLE);
    const slide = stored.slides.find((s) => s.id === id);
    if (!slide || !by.sees(slide)) throw new Forbidden();
    changed.set(id, {
      ...slide,
      ...(hidden === undefined ? {} : { hidden }),
      ...(headline === undefined ? {} : { headline: headline === null ? null : typed(headline, by.words) || null }),
      ...(answers === undefined ? {} : { answers: answersFrom(answers, slide.answers, by) }),
    });
  }
  return checked({ ...stored, ...(design === undefined ? {} : { design }), slides: stored.slides.map((s) => changed.get(s.id) ?? s) });
}

/** The description with the answers emptied on the slides the writer is sent; the questions stay for the next meeting. */
export function clearedDescription(stored: DeckDescription, sees: DeckWriter["sees"]): DeckDescription {
  return checked({ ...stored, slides: stored.slides.map((s) => (sees(s) ? { ...s, answers: s.answers.map((a) => ({ ...a, text: "", writtenOn: null })) } : s)) });
}

const SUMMARY_METRICS = 4;
/** Slides a deck has whatever it shows: cover, summary and about. */
const FRAME_SLIDES = 3;
/** The most Metrics a made deck takes: all of them are in the table and the definitions, with room for one chart. */
const MAX_DECK_METRICS = Math.floor((LIMITS.slides - FRAME_SLIDES - 1) / 2) * LIMITS.metrics;

/** The slides of a new deck about these Metrics, in their order: cover, summary, one chart each while there is room,
 * a table and the definitions of all of them, and about. No Metric is left out of the table or the definitions. */
export function describedFrom(metricIds: readonly number[]): DeckDescription {
  const ids = [...new Set(metricIds)];
  if (!ids.length) throw new Refused("This dashboard shows no Metric, so there are no slides to make.");
  if (ids.length > MAX_DECK_METRICS) throw new Refused(`A deck takes ${MAX_DECK_METRICS} Metrics at most, and this dashboard shows ${ids.length}.`);
  const groups = Array.from({ length: Math.ceil(ids.length / LIMITS.metrics) }, (_, i) => ids.slice(i * LIMITS.metrics, (i + 1) * LIMITS.metrics));
  const charts = ids.slice(0, LIMITS.slides - FRAME_SLIDES - 2 * groups.length);
  const slides: [SlideType, number[]][] = [
    ["cover", []],
    ["summary", ids.slice(0, SUMMARY_METRICS)],
    ...charts.map((id): [SlideType, number[]] => ["chart", [id]]),
    ...groups.map((g): [SlideType, number[]] => ["table", g]),
    ...groups.map((g): [SlideType, number[]] => ["definitions", g]),
    ["about", []],
  ];
  return checked({
    format: DECK_DESCRIPTION_FORMAT,
    design: "band",
    emphasis: "strong",
    slides: slides.map(([type, metrics], i) => ({ id: `sl_${i + 1}`, type, metrics, options: {}, headline: null, hidden: false, answers: [] })),
  });
}
