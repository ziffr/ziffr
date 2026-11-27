// The deck description's checks (GLOSSARY: Deck, Slide Type; spec 0069): one example of every Slide Type passes, and
// what an untrusted browser could send instead is refused.
import {
  checkDeckDescription, DECK_DESCRIPTION_LIMITS, SLIDE_METRICS, SLIDE_TYPES,
  type DeckDescription, type SlideDescription, type SlideType,
} from "./deck-description.js";

const L = DECK_DESCRIPTION_LIMITS;

function slide<T extends SlideType>(type: T, id: string, over: Record<string, unknown> = {}): SlideDescription<T> {
  return { id, type, metrics: [], options: {}, headline: null, hidden: false, answers: [], ...over } as unknown as SlideDescription<T>;
}

const answer = { question: "What puts the commit at risk?", text: "", writtenOn: null };

const EXAMPLES: Record<SlideType, SlideDescription> = {
  cover: slide("cover", "sl_cover"),
  summary: slide("summary", "sl_summary", { metrics: [1, 2, 3, 4], options: { periods: 6, target: true, form: "line" } }),
  chart: slide("chart", "sl_chart", { metrics: [12, 13, 14], options: { periods: 12, target: true, form: "columns", part: true, reference: true } }),
  table: slide("table", "sl_table", { metrics: [1, 2, 3], options: { periods: 8 } }),
  "gap-table": slide("gap-table", "sl_gap", { metrics: [5, 6, 7], options: { total: true } }),
  bridge: slide("bridge", "sl_bridge", { metrics: [8] }),
  mosaic: slide("mosaic", "sl_mosaic", { metrics: [9] }),
  "driver-tree": slide("driver-tree", "sl_tree", { metrics: [10, 11], options: { levels: 3 } }),
  questions: slide("questions", "sl_questions", { answers: [answer, { question: "What do we need?", text: "Two hires.\nA budget.", writtenOn: "2026-11-27" }] }),
  definitions: slide("definitions", "sl_definitions", { metrics: [1, 2], headline: "How we count" }),
  about: slide("about", "sl_about"),
};

const deck = (...slides: unknown[]) => ({ format: "ziffr.deck/1", design: "band", emphasis: "strong", slides: [...slides, EXAMPLES.about] });

/** The problems of a value, each as "path message". */
function problems(value: unknown): string {
  const res = checkDeckDescription(value);
  return res.ok ? "" : res.problems.map((p) => `${p.path} ${p.message}`).join("\n");
}

/** The problems of a deck holding one changed example slide. */
const changed = (type: SlideType, over: Record<string, unknown>) => problems(deck({ ...EXAMPLES[type], ...over }));

describe("a deck description", () => {
  it("takes one example of every Slide Type", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual([...SLIDE_TYPES].sort());
    const all = deck(...SLIDE_TYPES.filter((t) => t !== "about").map((t) => EXAMPLES[t]));
    expect(checkDeckDescription(all)).toEqual({ ok: true, value: all });
  });

  it("takes the spec's example, both designs and both emphases", () => {
    const spec = slide("chart", "sl_a1", { metrics: [12], options: { periods: 12, target: true }, answers: [answer] });
    expect(problems({ ...deck(spec), design: "column", emphasis: "quiet" })).toBe("");
    expect(problems(deck())).toBe("");
  });

  it("returns a copy of its own, not the object given", () => {
    const given = deck(EXAMPLES.chart);
    const res = checkDeckDescription(given);
    expect(res.ok && res.value).not.toBe(given);
    given.slides.length = 0;
    expect(res.ok && res.value.slides).toHaveLength(2);
  });

  it("refuses another format by name, and what is not a deck", () => {
    expect(problems({ ...deck(), format: "ziffr.deck/2" })).toContain("this Ziffr reads ziffr.deck/1");
    expect(problems({ ...deck(), format: "ziffr.deck-template/1" })).toContain("must be “ziffr.deck/1”");
    for (const value of [null, undefined, 1, "ziffr.deck/1", [], {}]) expect(checkDeckDescription(value).ok).toBe(false);
  });

  it("refuses unknown fields wherever they stand", () => {
    expect(problems({ ...deck(), name: "Review" })).toContain("name is not a field here");
    expect(changed("chart", { notes: "x" })).toContain("slides[0].notes is not a field here");
    expect(changed("chart", { options: { x: 1 } })).toContain("slides[0].options.x is not a field here");
    expect(changed("mosaic", { options: { periods: 4 } })).toContain("is not a field here");
    expect(changed("questions", { answers: [{ ...answer, by: 3 }] })).toContain("slides[0].answers[0].by is not a field here");
    for (const key of ["__proto__", "constructor", "toString"]) {
      expect(problems(JSON.parse(`{"${key}": {}, ${JSON.stringify(deck()).slice(1)}`))).toContain("is not a field here");
      expect(changed("chart", { options: JSON.parse(`{"${key}": 1}`) })).toContain("is not a field here");
    }
    expect(({} as Record<string, unknown>).periods).toBeUndefined();
  });

  it("needs every field", () => {
    for (const field of ["format", "design", "emphasis", "slides"]) {
      const d: Record<string, unknown> = deck();
      delete d[field];
      expect(problems(d)).not.toBe("");
    }
    for (const field of Object.keys(EXAMPLES.chart)) {
      const s: Record<string, unknown> = { ...EXAMPLES.chart };
      delete s[field];
      expect(problems(deck(s))).toContain(field);
    }
  });

  it("refuses unknown types, designs and options out of range", () => {
    expect(changed("chart", { type: "assessment" })).toContain("slides[0].type must be one of");
    expect(problems({ ...deck(), design: "column-left" })).toContain("design must be one of");
    expect(problems({ ...deck(), emphasis: "loud" })).toContain("emphasis must be one of");
    for (const periods of [1, L.maxPeriods + 1, 2.5, "12", null]) expect(changed("table", { options: { periods } })).toContain("options.periods");
    for (const levels of [1, 4]) expect(changed("driver-tree", { options: { levels } })).toContain("options.levels");
    expect(changed("chart", { options: { form: "pie" } })).toContain("options.form must be one of");
    expect(changed("chart", { hidden: "no" })).toContain("slides[0].hidden");
  });

  it("refuses ids that are not whole positive numbers, and a Metric listed twice", () => {
    for (const id of [1.5, 0, -1, "12", null, 2 ** 31, Number.NaN, Number.POSITIVE_INFINITY, 12n, { id: 12 }]) {
      expect(changed("mosaic", { metrics: [id] })).not.toBe("");
    }
    expect(changed("table", { metrics: [3, 3] })).toContain("listed twice");
  });

  it("refuses slide ids of another shape, or used twice", () => {
    for (const id of ["", "sl_", "a1", "sl_A1", "sl_a1\n", `sl_${"a".repeat(33)}`, 1]) expect(changed("chart", { id })).toContain("slides[0].id");
    expect(problems(deck(EXAMPLES.chart, EXAMPLES.chart))).toContain("is used by an earlier slide");
    expect(changed("chart", { id: EXAMPLES.about.id })).toContain("slides[1].id");
  });

  it("holds each Slide Type to its number of Metrics", () => {
    for (const type of SLIDE_TYPES) {
      const { min, max } = SLIDE_METRICS[type];
      const list = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
      const over = { ...EXAMPLES[type], options: {} };
      const check = (n: number) => problems(type === "about" ? { ...deck(), slides: [{ ...over, metrics: list(n) }] } : deck({ ...over, metrics: list(n) }));
      expect(check(max + 1)).toContain("metrics");
      if (min > 0) expect(check(min - 1)).toContain("metrics");
    }
    expect(changed("table", { metrics: Array.from({ length: L.metrics + 1 }, (_, i) => i + 1) })).toContain(`at most ${L.metrics}`);
  });

  it("holds a chart's and a gap table's Metrics to their options", () => {
    expect(changed("chart", { options: {}, metrics: [1, 2] })).toBe("");
    expect(changed("chart", { options: {}, metrics: [1, 2, 3] })).toContain("at most 2 Metrics");
    expect(changed("chart", { options: { part: true }, metrics: [1, 2] })).toBe("");
    expect(changed("chart", { options: { part: true }, metrics: [1] })).toContain("must list 2 Metrics");
    expect(changed("chart", { options: { reference: true }, metrics: [1, 2, 3] })).toContain("must list 2 Metrics");
    expect(changed("chart", { options: { part: true, form: "line" }, metrics: [1, 2] })).toContain("needs columns");
    expect(changed("gap-table", { options: {}, metrics: [1, 2] })).toBe("");
    expect(changed("gap-table", { options: { total: false }, metrics: [1, 2, 3] })).toContain("must list 2 Metrics");
  });

  it("takes text up to its length and refuses it past that", () => {
    const answered = (a: Record<string, unknown>) => changed("questions", { answers: [{ ...answer, ...a }] });
    expect(changed("chart", { headline: "é".repeat(L.headline) })).toBe("");
    // Characters are counted as a person counts them: one outside the basic plane is one, not two.
    expect(changed("chart", { headline: "😀".repeat(L.headline) })).toBe("");
    expect(changed("chart", { headline: "a".repeat(L.headline + 1) })).toContain("slides[0].headline");
    expect(changed("chart", { headline: "" })).toContain("must not be empty");
    expect(answered({ question: "a".repeat(L.question + 1) })).toContain("question");
    expect(answered({ question: "" })).toContain("question");
    expect(answered({ text: "a".repeat(L.answer) })).toBe("");
    expect(answered({ text: "a".repeat(L.answer + 1) })).toContain("text");
    expect(answered({ text: "1\n2\n3\n4" })).toBe("");
    expect(answered({ text: "1\n2\n3\n4\n5" })).toContain("at most 4 lines");
    expect(changed("questions", { answers: Array(L.answers + 1).fill(answer) })).toContain(`at most ${L.answers}`);
  });

  it("refuses characters XML forbids, and invisible or direction-reversing ones", () => {
    const bad = ["\u0000", "\u0001", "\u0008", "\u000B", "\u000C", "\u001F", "\t", "\r", "\u007F", "\uD800", "\uDFFF", "￾", "￿", "‮", "​", " ", "\u{E0041}"];
    for (const c of bad) {
      const code = c.codePointAt(0)!.toString(16);
      expect(changed("chart", { headline: `a${c}b` }), code).toContain("headline");
      expect(changed("questions", { answers: [{ ...answer, question: `a${c}b` }] }), code).toContain("question");
      expect(changed("questions", { answers: [{ ...answer, text: `a${c}b` }] }), code).toContain("text");
    }
    expect(changed("chart", { headline: "a\nb" })).toContain("headline");
  });

  it("keeps markup and addresses as the words a person typed", () => {
    expect(changed("chart", { headline: "<b>Churn</b> > 3 % & {latest} at example.com → 👩‍👧" })).toBe("");
  });

  it("takes a real day or none as the day an answer was written", () => {
    for (const writtenOn of ["2026-02-30", "2026-13-01", "27.11.2026", "2026-11-27T10:00:00Z", "", 20261127]) {
      expect(changed("questions", { answers: [{ ...answer, writtenOn }] })).toContain("writtenOn");
    }
    expect(changed("questions", { answers: [{ ...answer, writtenOn: "2028-02-29" }] })).toBe("");
  });

  it("takes answers only on question and chart slides", () => {
    for (const type of SLIDE_TYPES.filter((t) => t !== "questions" && t !== "chart" && t !== "about")) {
      expect(changed(type, { answers: [answer] }), type).toContain("slides[0].answers");
    }
  });

  it("takes at most 40 slides", () => {
    const many = (n: number) => deck(...Array.from({ length: n - 1 }, (_, i) => ({ ...EXAMPLES.chart, id: `sl_${i}` })));
    expect(problems(many(L.slides))).toBe("");
    expect(problems(many(L.slides + 1))).toContain(`at most ${L.slides}`);
    expect(problems({ ...deck(), slides: [] })).toContain("slides");
  });

  it("refuses an “about” slide that is missing, twice, hidden, changed or not last", () => {
    const d = (...slides: unknown[]) => ({ ...deck(), slides });
    const { about, chart } = EXAMPLES;
    expect(problems(d(chart))).toContain("must be the “about” slide");
    expect(problems(d(about, chart))).toContain("must be the “about” slide");
    expect(problems(d(about, chart))).toContain("slides[0] is an “about” slide");
    expect(problems(d({ ...about, id: "sl_other" }, about))).toContain("there is one");
    expect(problems(d({ ...about, hidden: true }))).toContain("slides[0].hidden");
    expect(problems(d({ ...about, headline: "Mine" }))).toContain("slides[0].headline");
    expect(problems(d({ ...about, metrics: [1] }))).toContain("slides[0].metrics");
    expect(problems(d({ ...about, answers: [answer] }))).toContain("slides[0].answers");
    expect(problems(d({ ...about, options: { periods: 2 } }))).toContain("slides[0].options.periods");
  });

  it("refuses more than 512 KB before reading it through", () => {
    const big = "is larger than 512 KB";
    expect(changed("chart", { headline: "a".repeat(L.bytes) })).toContain(big);
    // Fewer characters than the limit, but more bytes.
    expect(changed("chart", { headline: "€".repeat(L.bytes / 2) })).toContain(big);
    expect(problems({ ...deck(), ["a".repeat(L.bytes)]: 1 })).toContain(big);
    expect(problems({ ...deck(), slides: new Array(100_000_000) })).toContain("not plain data");
    expect(problems({ ...deck(), slides: Array(L.bytes).fill(0) })).toContain(big);
  });

  it("refuses deep nesting, loops and what is not plain data", () => {
    let nested: unknown = 1;
    for (let i = 0; i < 100_000; i++) nested = [nested];
    expect(problems({ ...deck(), slides: nested })).toContain("nested more than");
    const loop: Record<string, unknown> = { ...deck() };
    loop.self = loop;
    expect(problems(loop)).toContain("nested more than");
    class Slide {}
    for (const odd of [new Map(), new Set(), new Date(), new Slide(), () => 1, Symbol("x"), 1n, undefined, Number.NaN]) {
      expect(changed("chart", { options: { periods: odd } })).toContain("not plain data");
    }
  });

  it("is typed as it is checked", () => {
    const typed: DeckDescription = { format: "ziffr.deck/1", design: "column", emphasis: "quiet", slides: [slide("about", "sl_z")] };
    expect(problems(typed)).toBe("");
  });
});
