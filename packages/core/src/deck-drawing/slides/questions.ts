// The questions slide (spec 0069; GLOSSARY: Slide Type, Period): up to three questions with the answers a person typed.
// An answer shows the day it was written once a newer period has begun. Answers that do not fit go on to another slide.
// Words are drawn as words. Visibility: it shows nothing where a Metric it lists is not there, as an answer may speak
// of it. Pure.
import { formatDate } from "../../format";
import { periodStart, type Span } from "../../periods";
import { badge } from "../frame";
import type { Obj } from "../objects";
import type { Region, SlideType } from "../slide-type";
import { listedData, NOT_THERE, sourceOf } from "./listed";
import { pagesOf } from "./rows";

/** How many questions a slide holds. */
const QUESTIONS = 3;

/** One question, its answer and, where it is from before the current period, the day it was written. */
export type Asked = { number: number; question: string; answer: string; written: string | null };

/** What a questions slide shows. */
export type QuestionsContent = { asked: Asked[] };

const LEFT = 48;
const QUESTION = 18;
const ANSWER = 14;
const GAP = 20;
/** The most lines an answer of the format's length takes. */
const ANSWER_LINES = 12;

/** Whether a period newer than the one an answer was written in has begun, by any of these spans. */
const outdated = (writtenOn: string, today: string, spans: Span[], yearStart: Parameters<typeof periodStart>[2]) =>
  spans.some((span) => periodStart(today, span, yearStart) > periodStart(writtenOn, span, yearStart));

/** A question's words as they stand in the room it has, and the height of the whole block. */
function set({ w, measure }: Region, asked: Asked) {
  const room = w - LEFT;
  const question = measure.fit(asked.question, room, { size: QUESTION, face: "head", bold: true }, 3);
  const answer = measure.fit(asked.answer, room, { size: ANSWER }, ANSWER_LINES);
  const tall = (words: string, size: number) => Math.ceil(words.split("\n").length * size * 1.35);
  const heights = { question: tall(question, QUESTION), answer: tall(answer, ANSWER), written: asked.written ? 20 : 0 };
  return { question, answer, heights, height: 12 + heights.question + 6 + heights.answer + heights.written + GAP };
}

/** The questions slide. */
export const questions: SlideType<QuestionsContent> = {
  id: "questions",
  section: "Questions",
  wide: true,
  /** The typed questions and answers, each answer dated where the figures have moved on since. */
  fill(slide, data, deck) {
    // Questions may be about no Metric at all.
    const listed = slide.metrics.length ? listedData(slide, data) : null;
    if (slide.metrics.length && !listed) return NOT_THERE;
    const source = sourceOf(listed?.metrics ?? []);
    const typed = (slide.answers ?? []).filter((a) => a.question.trim()).slice(0, QUESTIONS);
    if (!typed.length) return { headline: "Questions", source, cannot: "No question has been typed for this slide yet." };
    const spans: Span[] = listed ? listed.metrics.map((m) => m.period) : ["month"];
    const asked = typed.map((a, i): Asked => {
      const answer = a.text.trim();
      const dated = answer && a.writtenOn && outdated(a.writtenOn, deck.today, spans, data.yearStart);
      return { number: i + 1, question: a.question.trim(), answer: answer || "No answer is written yet.", written: dated ? `Written ${formatDate(a.writtenOn!)}` : null };
    });
    const headline = asked.length === 1 ? "One question and its answer" : `${asked.length === 2 ? "Two" : "Three"} questions and their answers`;
    return { headline, source, content: { asked } };
  },
  /** As many questions to a slide as the region holds. */
  pages(content, region) {
    return pagesOf(content.asked, (a) => set(region, a).height, () => region.h + GAP).map((asked) => ({ asked }));
  },
  /** Each question with its number, one under the other. */
  draw(content, region) {
    const { x, y, w, pen } = region;
    let top = y;
    return content.asked.flatMap((asked): Obj[] => {
      const { question, answer, heights, height } = set(region, asked);
      const at = { x: x + LEFT, w: w - LEFT };
      const body = top + 12 + heights.question + 6;
      const objects: Obj[] = [
        pen.rect({ x, y: top, w, h: 1 }, "rule"),
        badge(pen, x + 16, top + 26, asked.number),
        pen.text({ ...at, y: top + 12, h: heights.question }, [question], { size: QUESTION, face: "head", bold: true }),
        pen.text({ ...at, y: body, h: heights.answer }, [answer], { size: ANSWER }),
        ...(asked.written ? [pen.text({ ...at, y: body + heights.answer + 2, h: 18 }, [asked.written], { size: 12, color: "muted" })] : []),
      ];
      top += height;
      return objects;
    });
  },
};
