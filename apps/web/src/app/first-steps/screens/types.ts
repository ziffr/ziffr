// What every screen of First Steps gets (spec 0067; GLOSSARY: First Steps).
import type { FirstStepsAnswers, FirstStepsResume, FirstStepsScreen, Topic } from "@ziffr/core/first-steps-screens";

/** One suggested first Metric: its catalog id, name, plain sentence and how often it is due. */
export type FirstStepsOffer = { id: number; name: string; line: string; often: string };

/** What the clean slate's screens show: the name of the first Metric once there is one, and the suggestions for a team
 * and, by topic, for someone alone. */
export type FirstStepsClean = { metricName: string | null; team: FirstStepsOffer[]; topics: Record<Topic, FirstStepsOffer[]> };

/** What the server tells the browser, and nothing more: the asker's own id (to key their draft), the Workspace they made
 * here with its answers, the Workspaces they may ask to join, and what this Ziffr offers a newcomer. */
export type FirstStepsContext = {
  personId: string;
  /** Null until the Workspace exists. */
  workspace: { id: string; answers: FirstStepsAnswers; resume: FirstStepsResume } | null;
  /** Null until the Workspace exists. */
  clean: FirstStepsClean | null;
  joinable: { id: string; name: string; asked: boolean }[];
  trialDays: number | null;
  importOffered: boolean;
  /** The Workspace was made, but not every answer was saved. */
  unsaved: boolean;
};

/** A screen's way to read and give answers and to move on. */
export type ScreenProps = {
  context: FirstStepsContext;
  answers: FirstStepsAnswers;
  /** Keeps part of the answers. */
  update: (patch: Partial<FirstStepsAnswers>) => void;
  /** Opens a screen. */
  go: (screen: FirstStepsScreen) => void;
  /** Keeps an answer and opens the next question. */
  next: (patch: Partial<FirstStepsAnswers>) => void;
  /** Drops the draft and loads a page anew, for when the server has the answers. */
  leave: (url: string) => void;
};
