// @ts-nocheck
// Alert limits (GLOSSARY: Alert; spec 0032, "Limits"): abuse safeguards against spam, the same at every Size and
// never a price. One file so the numbers can be tuned in one place.

import { sendingLimitDefault } from "./sending-limits";

/** Alerts one person may hold in one Workspace. */
export const ALERTS_PER_PERSON = 20;
/** Alerts one person may hold on one Metric. */
export const ALERTS_PER_METRIC = 5;
/** Alerts a Workspace may hold in all, unless ZIFFR_LIMIT_ALERTS_PER_WORKSPACE says otherwise (the default). */
export const ALERTS_PER_WORKSPACE = sendingLimitDefault("alertsPerWorkspace");
/** Alert messages one person is sent per day; the last one says that more fired. */
export const ALERT_MESSAGES_PER_PERSON_PER_DAY = 20;
/** Alert messages a Workspace is sent per day; after it Alerts fire into the list only. Unless ZIFFR_LIMIT_ALERT_MESSAGES_PER_WORKSPACE_PER_DAY says otherwise (the default). */
export const ALERT_MESSAGES_PER_WORKSPACE_PER_DAY = sendingLimitDefault("alertMessagesPerWorkspace");

/** Tell steps one Workflow holds (spec 0032). */
export const TELL_STEPS_PER_WORKFLOW = 3;
/** People one Tell step tells, after its Groups are expanded. */
export const TELL_PEOPLE_PER_STEP = 20;
/** Groups one Tell step names. */
export const TELL_GROUPS_PER_STEP = 10;
/** Webhooks one Tell step names (spec 0034): they get the message as a program, so the number is small. */
export const TELL_WEBHOOKS_PER_STEP = 3;
