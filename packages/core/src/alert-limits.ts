// Alert limits (GLOSSARY: Alert; spec 0032, "Limits"): abuse safeguards against spam, the same at every Size and
// never a price. One file so the numbers can be tuned in one place.

/** Alerts one person may hold in one Workspace. */
export const ALERTS_PER_PERSON = 20;
/** Alerts one person may hold on one Metric. */
export const ALERTS_PER_METRIC = 5;
/** Alerts a Workspace may hold in all. */
export const ALERTS_PER_WORKSPACE = 500;
/** Alert messages one person is sent per day; the last one says that more fired. */
export const ALERT_MESSAGES_PER_PERSON_PER_DAY = 20;
/** Alert messages a Workspace is sent per day; after it Alerts fire into the list only. */
export const ALERT_MESSAGES_PER_WORKSPACE_PER_DAY = 2000;

/** Tell steps one Workflow holds (spec 0032). */
export const TELL_STEPS_PER_WORKFLOW = 3;
/** People one Tell step tells, after its Groups are expanded. */
export const TELL_PEOPLE_PER_STEP = 20;
/** Groups one Tell step names. */
export const TELL_GROUPS_PER_STEP = 10;
