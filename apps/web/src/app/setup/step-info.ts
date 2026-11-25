// The Setup Guide's steps as the screen names them (spec 0052; GLOSSARY: Setup Guide). Pure words and one table of what
// is built yet: a step that is not built shows what it will do instead of a dead link.
import type { SetupStepId } from "@ziffr/core/setup-steps";

/** A step's name on the screen and, for one not built yet, what it will do. */
export const STEP_INFO: Record<SetupStepId, { label: string; built: boolean; willDo: string; intro?: string }> = {
  about: { label: "About you", built: true, willDo: "" },
  start: { label: "Starting point", built: true, willDo: "Choose how to begin: from scratch, or from a Pack, which is a ready-made set of Metrics, a Workflow that asks for them and a dashboard. Packs are suggested from your answers in About you, and you change everything afterwards." },
  ways: { label: "Ways in and out", built: true, willDo: "Choose how Ziffr reaches you with a request for a number and how you answer: by email, in Slack or in Telegram. You can send yourself a test message to see that it arrives.", intro: "Ziffr asks you for numbers by email, Slack or Telegram, and takes your answers back the same way. Choose the ways that suit you, so requests reach you where you already are. You can skip this: the web form link in every request always works." },
  first_metric: { label: "First Metric", built: true, willDo: "Try one Metric both ways: Ziffr asks you for a value, you send one back, and you see it arrive.", intro: "Try one Metric from start to finish: Ziffr asks you for a number, you answer, and you see it arrive. It shows that asking works before anyone else is involved. You can skip this and try it later." },
  team: { label: "Team", built: true, willDo: "Invite the people who send in numbers or look at them, and say who is asked for what.", intro: "Invite the people who send in numbers or look at them, so the numbers are not all on you. You can skip this and invite people later under Members and Groups." },
};
