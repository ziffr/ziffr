import "server-only";
// What submitting values sets off in the app (GLOSSARY: Delivery, Workflow), handed to the core's submission
// functions. PROTOTYPE: these move into the core with ticket #15, and this module goes away.
import type { CorrectionEffects, SubmissionEffects } from "@ziffr/core/submissions";
import { deliver } from "./deliveries";
import { onValue } from "./workflow";

/** For values that arrive: a late value is announced to the Metric owner, a new one goes to its Workflow. */
export const submissionEffects: SubmissionEffects = {
  notifyCorrection: ({ actionId, senderId, ownerId, value }) =>
    deliver({ kind: "correction", actionId, senderId, recipientId: ownerId, correction: value, text: "Late value for a locked period." }),
  afterValue: onValue,
};

/** For a decided Correction: the proposer hears the decision, an accepted value goes to the Workflow again. */
export const correctionEffects: CorrectionEffects = {
  notifyDecision: ({ actionId, ownerId, authorId, accepted }) =>
    deliver({ kind: "decision", actionId, senderId: ownerId, recipientId: authorId, text: accepted ? "accepted" : "declined" }),
  afterValue: onValue,
};
