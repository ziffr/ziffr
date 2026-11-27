// What ziffr.pack/3 adds for a Pack's set-up (spec 0068; GLOSSARY: Pack, Position, Repeat, Metric Catalog, Total): the
// words of its preview, the questions that fill its Positions and list a Repeat's lines, and the numbers asked and
// written as targets, as schemas and as the rules a schema cannot say. The types and limits are in set-up.ts.
// Security: a Pack is untrusted input. A Pack brings words only, never a screen, markup or code: every text is plain
// text of limited length that must hold something to read, and the check for words aimed at assistants reads them. A
// number is asked only for a Metric that takes values and whose period fits into the span, and at most a few per Pack,
// so a file cannot make a person's one answer write targets without end.
import type { Schema } from "./json-check.js";
import { plainText } from "./file-text.js";
import type { MetricFile } from "./metric-file.js";
import { PACK_ASK_EVERY, PACK_SET_UP_LIMITS as L } from "./set-up.js";
import type { Pack } from "./pack.js";

// The description of a text is also what its refusal says ("must be plain text, ..."), so what a field means is said on
// the object or list that holds it.
const text = (max: number): Schema => ({ ...plainText(max), minLength: 1 });
const list = (min: number, max: number, description: string): Schema => ({ type: "array", ...(min ? { minItems: min } : {}), maxItems: max, items: text(L.listed), description });

const SET_UP_FIELD: Schema = {
  type: "object",
  description: "What the preview of the Pack's set-up says: “line” is one sentence under its name.",
  properties: {
    line: text(L.line),
    happens: list(1, L.happens, "The lines under “Every week” (or the period of the first Workflow Template): what happens once it is set up."),
    needs: list(0, L.needs, "The lines under “You need”: what the person has ready."),
  },
  required: ["line", "happens"],
  additionalProperties: false,
};

const ASK_FIELD: Schema = {
  type: "object",
  description: `A number asked at set-up with “question”, one field called “name” (per line, where the entry is made once per line), and written unchanged as the Metric's target for every period of the span “every”. At most ${L.asks} in a Pack. Not on a Derived Metric or a Total, nor on a Metric whose period is longer than the span.`,
  properties: { question: text(L.question), name: text(L.name), every: { enum: [...PACK_ASK_EVERY], description: "The span one answer holds for." } },
  required: ["question", "name", "every"],
  additionalProperties: false,
};

/** A list of the manifest whose entries gain fields. */
const gaining = (of: Schema, fields: Record<string, Schema>, description = of.description): Schema => ({ ...of, description, items: { ...of.items!, properties: { ...of.items!.properties, ...fields } } });

/** What schema /3 changes of schema /2's properties: `setUp`, the questions of Positions and Repeats, and `ask` on a
 * Metric Catalog entry's wrapper. */
export function setUpProperties(base: NonNullable<Schema["properties"]>): Record<"setUp" | "positions" | "repeats" | "contents", Schema> {
  const kinds = base.contents.properties!;
  return {
    setUp: SET_UP_FIELD,
    positions: gaining(base.positions, { question: text(L.question), hint: text(L.hint) }, `${base.positions.description} “question” is asked to fill it at set-up, with “hint” under it.`),
    repeats: gaining(base.repeats, { question: text(L.question) }, `${base.repeats.description} “question” is asked above the lines at set-up.`),
    contents: { ...base.contents, properties: { ...kinds, metrics: gaining(kinds.metrics, { ask: ASK_FIELD }) } },
  };
}

type At = (path: string, message: string) => void;

// How long each period is, shortest first.
const LENGTH: Record<MetricFile["period"], number> = { day: 1, week: 2, month: 3, quarter: 4, year: 5 };

/** Whether a text holds something a person can read: a letter or a digit that shows. */
const readable = (words: string) => /[\p{L}\p{N}]/u.test(words.replace(/\p{Default_Ignorable_Code_Point}/gu, ""));

/** Every text of a set-up, by its path. */
function setUpTexts(p: Pack): [string, string | undefined][] {
  const of = (path: string, lines: string[] = []) => lines.map((line, i): [string, string] => [`${path}[${i}]`, line]);
  return [
    ["setUp.line", p.setUp?.line],
    ...of("setUp.happens", p.setUp?.happens),
    ...of("setUp.needs", p.setUp?.needs),
    ...(p.positions ?? []).flatMap((x, i): [string, string | undefined][] => [[`positions[${i}].question`, x.question], [`positions[${i}].hint`, x.hint]]),
    ...(p.repeats ?? []).map((x, i): [string, string | undefined] => [`repeats[${i}].question`, x.question]),
    ...(p.contents.metrics ?? []).flatMap((m, i): [string, string | undefined][] => [[`contents.metrics[${i}].ask.question`, m.ask?.question], [`contents.metrics[${i}].ask.name`, m.ask?.name]]),
  ];
}

/** What a schema cannot say of a Pack's set-up. `sound` tells which items passed their own format's checks: only their
 * periods are read. */
export function checkSetUp(p: Pack, sound: (item: object) => boolean, at: At): void {
  for (const [path, words] of setUpTexts(p)) if (words !== undefined && !readable(words)) at(path, "holds no words.");
  let asks = 0;
  (p.contents.metrics ?? []).forEach((m, i) => {
    if (!m.ask) return;
    const here = `contents.metrics[${i}].ask`;
    if (++asks > L.asks) at(here, `is one too many: a Pack asks at most ${L.asks} numbers at set-up.`);
    if (m.total) at(here, "is on a Total, which is computed from its parts: ask the number on the entry it adds up.");
    else if (m.metric.formula !== undefined) at(here, "is on a Derived Metric, which is computed: no number is asked for it.");
    if (sound(m) && LENGTH[m.metric.period] > LENGTH[m.ask.every]) at(`${here}.every`, `is “${m.ask.every}”, shorter than the Metric's period, ${m.metric.period}: ask for a span at least as long.`);
  });
}
