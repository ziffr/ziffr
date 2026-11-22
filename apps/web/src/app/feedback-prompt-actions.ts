"use server";
// The Feedback Prompt (ticket #722; GLOSSARY: Feedback Prompt): thin calls into the core (@ziffr/core/feedback-prompt).
// Each answer is about the signed-in person alone; there is no person to pass.
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import * as prompt from "@ziffr/core/feedback-prompt";

/** The card was shown: starts the wait before it may come again. */
export async function feedbackPromptShown() {
  return attempt(async () => { await prompt.markFeedbackPromptShown(await currentActor()); });
}

/** "Star on GitHub" or "Don't ask again": the card never comes back. */
export async function stopFeedbackPrompt(answer: "starred" | "never") {
  return attempt(async () => { await prompt.stopFeedbackPrompt(await currentActor(), answer); });
}

/** What is missing, in the person's words; kept without their name. */
export async function sayWhatIsMissing(words: string) {
  return attempt(async () => { await prompt.sayWhatIsMissing(await currentActor(), words); });
}
