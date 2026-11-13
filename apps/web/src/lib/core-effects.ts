import "server-only";
// What the core's operations set off in the app (GLOSSARY: Delivery, Workflow, Version), handed to them as effects.
// PROTOTYPE: these move into the core with tickets #13 to #15, and this module goes away.
import type { CorrectionEffects, SubmissionEffects } from "@ziffr/core/submissions";
import type { MetricEffects } from "@ziffr/core/metrics";
import type { NoticeEffects } from "@ziffr/core/sharing";
import { deliver, deliverNotice, deliverPrompt } from "./deliveries";
import { onValue } from "./workflow";
import { recordVersion } from "./versions";

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

/** For a new Metric: its first version is recorded and each submitter gets a first Prompt. */
export const metricEffects: MetricEffects = {
  recordCreated: async (metricId, by, message) => { await recordVersion("metric", metricId, by, { message }); },
  promptSubmitter: async (metricId, submitterId, by) => { await deliverPrompt({ metricId, submitterId, senderId: by }); },
};

/** For access requests: a notice through the recipient's Connector. */
export const noticeEffects: NoticeEffects = { notify: deliverNotice };
