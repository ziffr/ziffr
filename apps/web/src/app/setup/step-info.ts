// The Setup Guide's steps as the screen names them (spec 0052, spec 0067; GLOSSARY: Setup Guide). Pure words.
import type { SetupStepId } from "@ziffr/core/setup-steps";

/** A step's name on the screen and the sentence under it. */
export const STEP_INFO: Record<SetupStepId, { label: string; intro: string }> = {
  about: { label: "About you", intro: "So we can suggest what fits your work. Every question is optional." },
  ways: { label: "Ways in and out", intro: "Ziffr asks you for numbers by email, Slack or Telegram, and takes your answers back the same way. Choose the ways that suit you, so requests reach you where you already are. You can skip this: the web form link in every request always works." },
};
