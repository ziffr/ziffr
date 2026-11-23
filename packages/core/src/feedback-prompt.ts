// The Feedback Prompt (ticket #722; GLOSSARY: Feedback Prompt, Installation Settings): a card that now and then asks a
// signed-in person whether they like Ziffr and, when they do, points them to the repository on GitHub, where they star
// it themselves (Ziffr cannot, and tells GitHub nothing). Whoever says something is missing writes it down; the words
// are kept without the person's name and only Installation Admins read them.
// Visibility: a person sees only their own card and nothing about anyone else's; the browser gets whether to show the
// card and whether a star is asked for, never the state behind it.
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import {
  afterNo, afterShown, afterStopped, asksForStar, cleanWords, FEEDBACK_MIN_DAYS, feedbackPromptOn, FRESH_STATE, isDue, type PromptState,
} from "./feedback-prompt-rules";
import { assertInstallationAdmin, type InstallationActor } from "./installation-admins";
import { hostedByCloud } from "./installation-days";
import { settingsInEffect } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";

/** What the card needs: whether a yes is followed by the request for a star. */
export type FeedbackPromptView = { askForStar: boolean };

/** One thing someone said was missing: the words and the day, never who wrote them. */
export type FeedbackWords = { at: string; words: string };

/** How many of the newest "What is missing?" words are kept. */
const KEEP_WORDS = 500;
/** How many an Installation Admin sees. */
const SHOW_WORDS = 50;

// Who has too few active days is asked about again only after a while, so the count is not made on every page.
const fewDays = new Map<string, number>();
const FEW_DAYS_MS = 10 * 60_000;
const TOLD_US = "Thank you, you have told us already.";

// Only a signed-in member (Owner, Admin or Member) of a real Workspace is asked: not a key, a Contact, a Guest, or anyone
// in the demo. Returns false rather than throwing, so the caller decides whether that is a refusal.
async function isAskable(actor: Actor): Promise<boolean> {
  if (actor.key || actor.workspaceId === DEMO_WORKSPACE_ID) return false;
  const { data } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  return ["owner", "admin", "member"].includes(String(data?.role));
}

// The one gate in front of the card and of every write that follows from it: the setting is on, and the person may be
// asked. Showing it and saying what is missing check it again, so a call made by hand cannot do what the card could not.
async function gate(actor: Actor): Promise<boolean> {
  const settings = await settingsInEffect();
  return feedbackPromptOn(settings, hostedByCloud(settings)) && (await isAskable(actor));
}

async function readState(personId: string): Promise<PromptState & { updatedAt: string }> {
  const { data } = await db().from("feedback_prompts").select("shown_count, next_ask_at, stopped, answer, updated_at").eq("person_id", personId).maybeSingle();
  if (!data) return { ...FRESH_STATE, updatedAt: "" };
  return {
    shownCount: Number(data.shown_count), stopped: data.stopped === true,
    nextAskAt: data.next_ask_at ? new Date(data.next_ask_at as string) : null,
    answer: data.answer === "no" || data.answer === "starred" || data.answer === "never" ? data.answer : null,
    updatedAt: data.updated_at as string,
  };
}

async function writeState(personId: string, s: PromptState): Promise<void> {
  const { error } = await db().from("feedback_prompts").upsert({
    person_id: personId, shown_count: s.shownCount, next_ask_at: s.nextAskAt?.toISOString() ?? null, stopped: s.stopped, answer: s.answer, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Your answer could not be saved.");
}

async function activeDays(personId: string): Promise<number> {
  const { data, error } = await db().rpc("feedback_submission_days", { p_person: personId });
  return error ? 0 : Number(data ?? 0);
}

/** Whether Ziffr should show the card to the actor now, and how: null when not. Reads only; showing it is recorded by
 * markFeedbackPromptShown. Off unless the Installation turned it on (or is hosted Ziffr). */
export async function feedbackPromptFor(actor: Actor, now: Date = new Date()): Promise<FeedbackPromptView | null> {
  if (!(await gate(actor))) return null;
  const state = await readState(actor.personId);
  if (!isDue(state, now)) return null;
  const seen = fewDays.get(actor.personId);
  if (seen !== undefined && now.getTime() - seen < FEW_DAYS_MS) return null;
  if ((await activeDays(actor.personId)) < FEEDBACK_MIN_DAYS) {
    fewDays.set(actor.personId, now.getTime());
    return null;
  }
  return { askForStar: asksForStar(state) };
}

/** Records that the card was shown to the actor, which starts the wait before it may come again. Does nothing when it
 * was not due (a second tab, a repeated call), so showing it twice never counts twice. */
export async function markFeedbackPromptShown(actor: Actor, now: Date = new Date()): Promise<void> {
  if (!(await gate(actor)) || (await activeDays(actor.personId)) < FEEDBACK_MIN_DAYS) throw new Forbidden();
  const before = await readState(actor.personId);
  if (!isDue(before, now)) return;
  const next = afterShown(before, now);
  // Only the call that still sees the count it read wins: two tabs showing the card at once count once.
  await db().from("feedback_prompts").upsert({ person_id: actor.personId }, { onConflict: "person_id", ignoreDuplicates: true });
  await db().from("feedback_prompts").update({
    shown_count: next.shownCount, next_ask_at: next.nextAskAt?.toISOString() ?? null, stopped: next.stopped, updated_at: now.toISOString(),
  }).eq("person_id", actor.personId).eq("shown_count", before.shownCount);
}

/** The actor's answer "Star on GitHub" or "Don't ask again": the card never comes back. */
export async function stopFeedbackPrompt(actor: Actor, answer: unknown): Promise<void> {
  if (answer !== "starred" && answer !== "never") throw new Error("Pick one of the choices.");
  if (!(await isAskable(actor))) throw new Forbidden();
  await writeState(actor.personId, afterStopped(await readState(actor.personId), answer));
}

/** The actor says what is missing. The words are kept without their name; the card comes back only after a long while,
 * and without a request for a star. A person who has just said it cannot say it again at once. */
export async function sayWhatIsMissing(actor: Actor, input: unknown, now: Date = new Date()): Promise<void> {
  if (!(await gate(actor))) throw new Forbidden();
  const clean = cleanWords(input);
  if (!clean.ok) throw new Error(clean.reason);
  const state = await readState(actor.personId);
  // Only someone who was shown the card, and not twice in the same wait: the table cannot be filled by one account.
  if (state.shownCount < 1) throw new Forbidden();
  if (state.answer === "no" && state.nextAskAt && state.nextAskAt.getTime() > now.getTime()) throw new Error(TOLD_US);
  const next = afterNo(state, now);
  // The change only lands while the row is still as it was read, and the words are kept only when it did: two answers
  // sent at once cannot both pass the check above.
  const { data: won, error: stateError } = await db().from("feedback_prompts").update({
    next_ask_at: next.nextAskAt?.toISOString() ?? null, answer: next.answer, updated_at: now.toISOString(),
  }).eq("person_id", actor.personId).eq("updated_at", state.updatedAt).select("person_id");
  if (stateError) throw new Error("Your answer could not be saved.");
  if (!won?.length) throw new Error(TOLD_US);
  const { error } = await db().from("feedback_prompt_words").insert({ words: clean.words, created_at: now.toISOString() });
  if (error) throw new Error("Your answer could not be saved.");
  // Keeps the newest ones only; best effort, the next answer prunes again.
  const { data: old } = await db().from("feedback_prompt_words").select("id").order("id", { ascending: false }).range(KEEP_WORDS, KEEP_WORDS + 200);
  if (old?.length) await db().from("feedback_prompt_words").delete().in("id", old.map((r) => r.id as number));
}

/** What people said was missing, newest first, for an Installation Admin only. No names: the table holds none. */
export async function feedbackPromptWords(actor: InstallationActor): Promise<FeedbackWords[]> {
  await assertInstallationAdmin(actor);
  const { data } = await db().from("feedback_prompt_words").select("words, created_at").order("id", { ascending: false }).limit(SHOW_WORDS);
  return (data ?? []).map((r) => ({ at: r.created_at as string, words: r.words as string }));
}
