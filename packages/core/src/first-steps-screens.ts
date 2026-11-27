// First Steps' screens, answers and fixed lists (spec 0067; GLOSSARY: First Steps). Pure, so the screens in the browser
// and the checks on the server name the same things. Nothing here reads or writes; first-steps.ts checks the answers.
import type { BusinessFunction } from "@ziffr/pack/business-functions";
import type { Industry, Segment } from "@ziffr/pack/audience";

/** The page's path. */
export const FIRST_STEPS_PATH = "/first-steps";

/** The screens, by the name `?step=` takes. */
export const FIRST_STEPS_SCREENS = ["who", "role", "business", "customers", "topic", "workspace", "start", "sets", "set", "first", "own", "value", "sender", "done"] as const;
/** One screen. */
export type FirstStepsScreen = (typeof FIRST_STEPS_SCREENS)[number];

/** The three chapters, in order. */
export const FIRST_STEPS_CHAPTERS = ["About you", "Your Workspace", "Your numbers"] as const;

/** Which chapter a screen belongs to (an index into the chapters). */
export function chapterOf(screen: FirstStepsScreen): 0 | 1 | 2 {
  if (screen === "workspace" || screen === "start") return 1;
  return ["who", "role", "business", "customers", "topic"].includes(screen) ? 0 : 2;
}

/** Who will use the Workspace: a team or business, or one person alone ("Just me"). */
export const USED_BY = ["team", "me"] as const;
/** One of the two. */
export type UsedBy = (typeof USED_BY)[number];
/** The words for each. */
export const USED_BY_LABEL: Record<UsedBy, string> = { team: "My team or business", me: "Just me" };

/** What someone who uses Ziffr alone would like to track. */
export const TOPICS = ["health", "money", "habits", "club", "other"] as const;
/** One topic. */
export type Topic = (typeof TOPICS)[number];
/** The words for each topic. */
export const TOPIC_LABEL: Record<Topic, string> = { health: "Health and fitness", money: "Money", habits: "Habits and time", club: "A club or hobby", other: "Something else" };

/** Ziffr's own Packs for private use, each with the topics it fits. None so far: a Pack added here switches the
 * ready-made sets on for "Just me" with one of its topics. */
export const PRIVATE_SETS: readonly { pack: string; topics: readonly Topic[] }[] = [];

/** The Pack ids of the private sets for a topic; none while no topic was chosen. */
export function privateSets(topic: Topic | null): string[] {
  return PRIVATE_SETS.filter((s) => topic !== null && s.topics.includes(topic)).map((s) => s.pack);
}

/** Whether ready-made sets are offered: always to a team, to a person alone only where there is one for their topic. */
export function offersSets(who: UsedBy | null, topic: Topic | null): boolean {
  return who !== "me" || privateSets(topic).length > 0;
}

/** The industries shown before "Show all industries"; the rest of the app's list follows on request. */
export const FIRST_INDUSTRIES: readonly Industry[] = ["saas", "ecommerce", "professional_services", "agency", "retail", "manufacturing", "healthcare", "hospitality"];

/** The answers to "Who are your customers?", in the words of this question. */
export const CUSTOMER_LABEL: Record<Segment, string> = { b2b: "Businesses", b2c: "Consumers", b2b2c: "Both", public_sector: "Public sector", non_profit: "We are a non-profit" };

/** The most characters a Workspace's name takes in the field. */
export const FIRST_STEPS_NAME_FIELD = 60;

/** The units "Define your metric" offers. */
export const OWN_UNITS = ["number", "money", "percent", "hours"] as const;
/** One unit. */
export type OwnUnit = (typeof OWN_UNITS)[number];
/** The words for each unit. */
export const OWN_UNIT_LABEL: Record<OwnUnit, string> = { number: "Number", money: "Money", percent: "Percent", hours: "Hours" };

/** How often "Define your metric" lets a value be due. */
export const OWN_PERIODS = ["day", "week", "month"] as const;
/** One of them. */
export type OwnPeriod = (typeof OWN_PERIODS)[number];

/** How often First Steps offers a suggestion the Metric Catalog has monthly. The first is chosen already: asked weekly,
 * the next request comes soon after the first value, within a trial too. */
export const SUGGESTED_PERIODS = ["week", "month"] as const;
/** One of them. */
export type SuggestedPeriod = (typeof SUGGESTED_PERIODS)[number];

/** The most characters a first Metric's name takes. */
export const FIRST_METRIC_NAME_FIELD = 80;

/** What adding the first Metric says: an entry of the Metric Catalog, or a Metric of one's own. */
export type FirstMetricPick = { catalogId: number; period?: SuggestedPeriod } | { name: string; unit: OwnUnit; period: OwnPeriod };

/** Everything the questions and the Workspace screen ask. Null means skipped or not read. */
export type FirstStepsAnswers = {
  who: UsedBy | null;
  /** The asker's Business Function (team only). */
  role: BusinessFunction | null;
  /** The Workspace Profile's industry (team only). */
  industry: Industry | null;
  /** The Workspace Profile's segment (team only). */
  segment: Segment | null;
  /** What to track (just me only). Kept in the browser only: it orders suggestions and is not stored. */
  topic: Topic | null;
  name: string;
  country: string | null;
  currency: string | null;
  timeZone: string | null;
  /** 0 Sunday, 1 Monday. */
  weekStart: 0 | 1 | null;
};

/** Nothing answered yet. */
export const NO_ANSWERS: FirstStepsAnswers = { who: null, role: null, industry: null, segment: null, topic: null, name: "", country: null, currency: null, timeZone: null, weekStart: null };

/** The answers as they are sent: what belongs to the other branch of the first question is left out. */
export function answersToSend(a: FirstStepsAnswers): FirstStepsAnswers {
  return a.who === "me" ? { ...a, role: null, industry: null, segment: null } : { ...a, topic: null };
}

/** The question screens and the Workspace screen for an answer to the first question, in order. */
export function questionScreens(who: UsedBy | null): FirstStepsScreen[] {
  if (who === null) return ["who"];
  return who === "me" ? ["who", "topic", "workspace"] : ["who", "role", "business", "customers", "workspace"];
}

/** Where the Owner of a made Workspace resumes, worked out from what the Workspace has. */
export type FirstStepsResume = "start" | "value" | "sender" | "done" | "finished";

// The choice between the two ways in, and the sets: nothing of these is for someone who is offered no set.
const SET_SCREENS: readonly FirstStepsScreen[] = ["start", "sets", "set"];

/** The screen to show for what `?step=` asks. Before the Workspace exists only the questions that apply open (anything
 * else is the first screen, or the Workspace screen once the first question is answered and a later one was asked).
 * Once it exists every question of its branch opens again (Start over) and so does every later screen. Where no
 * ready-made set is offered, whatever would show the choice or the sets shows the first Metric instead. */
export function screenFor(asked: string | null, who: UsedBy | null, resume: FirstStepsResume | null, sets: boolean = offersSets(who, null)): FirstStepsScreen {
  const screen = screenAsked(asked, who, resume);
  return !sets && SET_SCREENS.includes(screen) ? "first" : screen;
}

function screenAsked(asked: string | null, who: UsedBy | null, resume: FirstStepsResume | null): FirstStepsScreen {
  const screen = (FIRST_STEPS_SCREENS as readonly string[]).includes(asked ?? "") ? (asked as FirstStepsScreen) : null;
  const resumed: FirstStepsScreen = resume === null || resume === "finished" ? "who" : resume;
  if (!screen) return resumed;
  const questions = questionScreens(who);
  if (questions.includes(screen)) return screen;
  const later = chapterOf(screen) === 2 || screen === "start";
  if (resume !== null) return later ? screen : resumed;
  return who !== null && later ? "workspace" : "who";
}

/** The screen before one that was opened or reloaded directly, where the browser has no step to go back to. */
export function screenBefore(screen: FirstStepsScreen, who: UsedBy | null, sets: boolean): FirstStepsScreen {
  // A set's list is the screen before it.
  if (screen === "set") return "sets";
  const questions = questionScreens(who);
  const at = questions.indexOf(screen);
  if (at > 0) return questions[at - 1];
  if (screen === "start" || (screen === "first" && !sets)) return "workspace";
  if (screen === "own") return "first";
  if (screen === "sender") return "value";
  if (screen === "done") return "sender";
  return sets ? "start" : "first";
}
