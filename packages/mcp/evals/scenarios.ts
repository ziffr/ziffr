// Scenario evals for the MCP server (ticket #614; GLOSSARY: Metric, Asking Schedule, Submitter): what a person who knows
// nothing about Ziffr says to an assistant, what they answer when it asks back, and what Ziffr must hold afterwards.
// Data only: the harness runs them, the checks read the state the harness collected.
import type { Check, EvalState } from "./state";

/** One newcomer conversation: the request, canned answers to the assistant's questions, and what must be true after. */
export type Scenario = {
  id: string;
  language: "de" | "en";
  /** The first thing the person says, in their own words. */
  opening: string;
  /** What they answer to the first, second and third question; after these (or without one) they say `fallback`. */
  replies: string[];
  /** The people besides the person themselves that exist in the Workspace (teammates), by name. */
  teammates?: string[];
  checks: (s: EvalState) => Check[];
};

const FALLBACK = { de: "Das weiß ich nicht, nimm einfach, was sinnvoll ist, und mach es bitte direkt.", en: "I don't know, just pick whatever makes sense and please do it right away." };
/** The answer to a question the scenario has no canned reply for. */
export const fallbackReply = (language: Scenario["language"]) => FALLBACK[language];

const check = (name: string, ok: boolean, detail = ""): Check => ({ name, ok, detail });
const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();
const only = (s: EvalState) => (s.metrics.length === 1 ? s.metrics[0] : undefined);

/** The checks every scenario shares: nothing refused, something made. */
const common = (s: EvalState): Check[] => [
  check("no tool errors", s.toolErrors.length === 0, s.toolErrors.slice(0, 2).join(" | ")),
  check("a Metric exists", s.metrics.length > 0),
  // Principle 5 of #614 (and the audit #628): the last words carry the Metric's link, so the person can open it.
  check("the last answer links to a Metric", /\/metrics\//.test(s.lastWords), s.lastWords.slice(0, 160)),
];

const buses = (language: "de" | "en"): Scenario => ({
  id: `buses-${language}`,
  language,
  opening: language === "de" ? "Ich möchte zählen, wie viele Busse pro Woche an meinem Haus vorbeifahren." : "I want to count how many buses pass my house per week.",
  replies: language === "de" ? ["Ich zähle das selbst, einmal pro Woche."] : ["I'll count them myself, once a week."],
  checks: (s) => {
    const m = only(s);
    return [...common(s), check("exactly one Metric", s.metrics.length === 1, `${s.metrics.length} Metrics`), check("period is week", m?.period === "week", m?.period), check("the person is its Submitter", Boolean(m?.submitters.includes(s.personId)))];
  },
});

const kmDaily = (language: "de" | "en"): Scenario => ({
  id: `km-daily-${language}`,
  language,
  opening: language === "de" ? "Frag mich jeden Tag um 13 Uhr nach den gefahrenen Kilometern. Mein erster Wert ist 13573." : "Ask me every day at 13:00 for the kilometres I drove. My first value is 13573.",
  replies: language === "de" ? ["Ja, 13573 stimmt, bitte so eintragen.", "Höher ist egal."] : ["Yes, 13573 is right, please record it as it is.", "Higher or lower doesn't matter."],
  checks: (s) => {
    const m = only(s);
    const days = m?.asking?.days.kind;
    return [
      ...common(s),
      check("period is day", m?.period === "day", m?.period),
      check("unit is kilometres", /km|kilomet/.test(lower(m?.unit)), m?.unit),
      check("asked at 13:00", m?.asking?.hour === 13, JSON.stringify(m?.asking)),
      check("asked every day", days === "every_day", days),
      check("first value 13573 recorded", Boolean(m?.values.includes(13573)), JSON.stringify(m?.values)),
    ];
  },
});

const coffee: Scenario = {
  id: "coffee-en",
  language: "en",
  opening: "I want to track how much coffee I drink.",
  replies: ["Cups per day, I guess.", "Just record it, I don't care about the details."],
  checks: (s) => {
    const m = only(s);
    return [...common(s), check("exactly one Metric", s.metrics.length === 1, `${s.metrics.length} Metrics`), check("named for coffee", /coffee|kaffee/.test(lower(m?.name)), m?.name), check("period is day", m?.period === "day", m?.period), check("the person is its Submitter", Boolean(m?.submitters.includes(s.personId)))];
  },
};

const salesMonday = (language: "de" | "en"): Scenario => ({
  id: `sales-monday-${language}`,
  language,
  opening: language === "de" ? "Mein Team soll jeden Montag den Umsatz melden." : "My team reports sales every Monday.",
  replies: language === "de" ? ["Das Team sind Anna und Ben. In Euro bitte.", "Mehr ist besser."] : ["The team is Anna and Ben. In euros please.", "Higher is better."],
  teammates: ["Anna", "Ben"],
  checks: (s) => {
    const m = only(s);
    const days = m?.asking?.days;
    return [
      ...common(s),
      check("exactly one Metric", s.metrics.length === 1, `${s.metrics.length} Metrics`),
      check("period is week", m?.period === "week", m?.period),
      check("unit is euro", /eur|€/.test(lower(m?.unit)), m?.unit),
      check("asked on Mondays", days?.kind === "chosen_weekdays" && days.days.length === 1 && days.days[0] === 1, JSON.stringify(days)),
      check("Anna and Ben are Submitters", s.teammateIds.every((id) => m?.submitters.includes(id)), `${m?.submitters.length ?? 0} Submitters`),
      check("polarity is higher", m?.polarity === "higher", m?.polarity),
    ];
  },
});

const odometer: Scenario = {
  id: "odometer-en",
  language: "en",
  opening: "I note my car's odometer reading every Sunday and I want to see how many kilometres I drive per day. It reads 13573 now.",
  replies: ["Yes, record 13573 as this week's reading.", "Fewer kilometres is not better or worse, it's just for my information."],
  checks: (s) => {
    const odo = s.metrics.find((m) => /odometer|mileage|kilometre reading|kilometer reading/.test(lower(m.name)));
    // Counted by the odometer's own period (a Derived Metric has its inputs' period), worked out as the change since the
    // reading before, over the 7 days between two weekly readings (ticket #619).
    const perDay = s.metrics.find((m) => m !== odo && Boolean(m.formula) && /km|kilomet/.test(lower(`${m.name} ${m.unit}`)));
    return [
      ...common(s),
      check("an odometer Metric exists", Boolean(odo), s.metrics.map((m) => m.name).join(", ")),
      check("the odometer is read weekly", odo?.period === "week", odo?.period),
      check("first reading 13573 recorded", Boolean(odo?.values.includes(13573)), JSON.stringify(odo?.values)),
      check("a kilometres-per-day Metric exists", Boolean(perDay), s.metrics.map((m) => `${m.name} (${m.period})`).join(", ")),
      check("kilometres per day is derived from the odometer", Boolean(perDay?.formula && odo && perDay.formula.includes(`{${odo.slug}}`)), perDay?.formula ?? "no formula"),
      check("it uses the change since the previous reading, over 7 days", /change\(/.test(perDay?.formula ?? "") && /\/\s*7\b/.test(perDay?.formula ?? ""), perDay?.formula ?? "no formula"),
    ];
  },
};

const steps: Scenario = {
  id: "steps-unusual-en",
  language: "en",
  opening: "Track my daily steps. Yesterday I walked 8000 steps and today 80000 steps.",
  replies: ["Yes, both are right, please record them as they are.", "Higher is better."],
  checks: (s) => {
    const m = only(s);
    return [
      ...common(s),
      check("period is day", m?.period === "day", m?.period),
      // Principle 7 of #614: an unusual value is a warning the person can overrule, never a refusal.
      check("both values recorded, the unusual one too", Boolean(m?.values.includes(8000) && m?.values.includes(80000)), JSON.stringify(m?.values)),
    ];
  },
};

// Spec 0038: a newcomer groups a number the way they would say it; the assistant reuses or makes the word, no questions about "tags".
const tagged: Scenario = {
  id: "finance-tag-en",
  language: "en",
  opening: "I want to keep track of my shop's monthly revenue, and file it under finance so I find it with my other money numbers.",
  replies: ["Euros, and it is the total for the month.", "Higher is better, just do it."],
  checks: (s) => {
    const m = only(s);
    return [...common(s), check("exactly one Metric", s.metrics.length === 1, `${s.metrics.length} Metrics`), check("period is month", m?.period === "month", m?.period), check("it carries the Tag finance", Boolean(m?.tags.some((t) => t.toLowerCase() === "finance")), JSON.stringify(m?.tags))];
  },
};

/** Every scenario, in the order the report lists them. */
export const SCENARIOS: Scenario[] = [buses("de"), buses("en"), kmDaily("de"), kmDaily("en"), coffee, salesMonday("de"), salesMonday("en"), odometer, steps, tagged];
