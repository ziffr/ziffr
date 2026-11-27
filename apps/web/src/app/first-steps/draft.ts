// First Steps' answers before the server has them (spec 0067; GLOSSARY: First Steps): kept in this browser only, per
// person (and per Workspace once one exists), and cleared on creation, saving, Start over and sign-out. What is read back
// is whatever the browser holds, so it is checked field by field; the server checks everything again.
import { FIRST_STEPS_NAME_FIELD, NO_ANSWERS, TOPICS, USED_BY, type FirstStepsAnswers } from "@ziffr/core/first-steps-screens";
import { COUNTRIES, CURRENCIES, INDUSTRIES, SEGMENTS } from "@ziffr/core/workspace-profile";
import { BUSINESS_FUNCTIONS } from "@ziffr/pack/business-functions";

/** Where a person's draft is kept. */
export function draftKey(personId: string, workspaceId: string | null): string {
  return `ziffr-first-steps:${personId}${workspaceId ? `:${workspaceId}` : ""}`;
}

/** The answers in a kept text, or null when it holds none; a field that is not on its list counts as not answered. */
export function readDraft(text: string | null): FirstStepsAnswers | null {
  if (!text) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const one = <T extends string>(list: readonly T[], v: unknown): T | null => list.find((x) => x === v) ?? null;
  return {
    ...NO_ANSWERS,
    who: one(USED_BY, raw.who), role: one(BUSINESS_FUNCTIONS, raw.role), industry: one(INDUSTRIES, raw.industry), segment: one(SEGMENTS, raw.segment), topic: one(TOPICS, raw.topic),
    name: typeof raw.name === "string" ? raw.name.slice(0, FIRST_STEPS_NAME_FIELD * 2) : "",
    country: one(COUNTRIES, raw.country), currency: one(CURRENCIES, raw.currency),
    timeZone: typeof raw.timeZone === "string" && raw.timeZone.length <= 64 ? raw.timeZone : null,
    weekStart: raw.weekStart === 0 || raw.weekStart === 1 ? raw.weekStart : null,
  };
}

// Storage can be blocked, full or absent (a private window): the flow then works for as long as the page is open.
/** The kept answers, if any. */
export function loadDraft(key: string): FirstStepsAnswers | null {
  try { return readDraft(window.localStorage.getItem(key)); } catch { return null; }
}
/** Keeps the answers. */
export function keepDraft(key: string, answers: FirstStepsAnswers): void {
  try { window.localStorage.setItem(key, JSON.stringify(answers)); } catch { /* not kept */ }
}
/** Drops the kept answers. */
export function dropDraft(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* nothing kept */ }
}
