// Who may fill in a value for someone else, and when (GLOSSARY: Filled-in Value, Stand-in, Away, Due Date, Submission
// Rule, Lock; spec 0046). Pure: one function decides, from facts the core has read, and the core asks it again for every
// way a value can come in for someone else (fill-in-check.ts), so the app, a Prompt's answer and a form link never
// disagree. It refuses in words that say what to do instead.

/** The three who may fill in: the submitter's Stand-in, answering the Prompt Ziffr sent them in the submitter's place, the
 * Metric's owner and the owner of the Metric's Workflow. Recorded in the Audit Log as `as`. */
export type FillInRole = "stand_in" | "metric_owner" | "workflow_owner";

/** Who is entering: a person's Workspace Role (a Contact has none), or an Access Key, which never fills in. */
export type Enterer = { id: string; role: "owner" | "admin" | "member" | "guest" | "contact"; viaKey: boolean };

/** Everything the rule needs to know, read by the core. */
export type FillInFacts = {
  by: Enterer;
  /** Whom the value is for. */
  submitterId: string;
  /** The submitter is a Feed, a program. */
  submitterIsFeed: boolean;
  metric: { ownerId: string; derived: boolean; archived: boolean; rule: "add" | "reject" | "overwrite" | "keep_both" };
  /** The Metric's Workflow: its owner, and the Due Date of the period; null for a Metric without one. */
  workflow: { ownerId: string; dueDate: string } | null;
  /** `by` is the submitter's Stand-in now. */
  isStandIn: boolean;
  /** Ziffr asked `by`, in the submitter's place, for this Metric and period (a Prompt exists for it). */
  standInAsked: boolean;
  /** `by` sees the Metric (Shares and Groups, as everywhere): asked of the Workflow's owner. */
  bySeesMetric: boolean;
  /** Today in the Workspace's time zone, and whether the submitter is Away on that day. */
  today: string;
  submitterAway: boolean;
  periodHasValue: boolean;
  periodLocked: boolean;
  periodCondensed: boolean;
  demo: boolean;
};

/** Allowed, in which role; or refused, in words for the person. */
export type FillInVerdict = { ok: true; as: FillInRole } | { ok: false; refusal: string };

/** Why not, or in which role: the order of the checks is the order of what a person can still change (who, what, when). */
export function mayFillIn(f: FillInFacts): FillInVerdict {
  const no = (refusal: string): FillInVerdict => ({ ok: false, refusal });
  if (f.demo) return no("Nothing is saved in the demo.");
  // Never an Access Key: the API and the MCP Server do not fill in for anyone.
  if (f.by.viaKey) return no("Values for someone else are entered in the app or by answering the Prompt.");
  if (f.by.role === "guest") return no("A Guest cannot fill in for someone.");
  if (f.by.id === f.submitterId) return no("A person's own value is recorded as their own: record it as yours.");
  if (f.submitterIsFeed) return no("A Feed's missing value is for the Metric's owner to fix: check that the Feed still runs.");
  if (f.metric.derived) return no("A Derived Metric is computed, never filled in.");
  if (f.metric.archived) return no("An Archived Metric takes no values.");
  // Several people's values are combined in one period and do not keep whose part is whose.
  if (f.metric.rule !== "reject" && f.metric.rule !== "overwrite") return no("This Metric adds up or keeps the values of several people, so nobody can fill in for someone else.");
  if (f.periodCondensed) return no("This period was condensed and takes no more values.");
  if (f.periodLocked) return no("This period is locked: a late value is proposed as a Correction.");
  if (f.periodHasValue) return no("This period already has a value: a Correction changes it.");

  // Which role: a Stand-in only for what they were asked about, then the owners.
  let role: FillInRole | null = null;
  if (f.isStandIn && f.standInAsked) role = "stand_in";
  else if (f.by.id === f.metric.ownerId) role = "metric_owner";
  else if (f.workflow && f.by.id === f.workflow.ownerId) {
    if (!f.bySeesMetric) return no("You do not see this Metric, so you cannot fill in for its submitter.");
    role = "workflow_owner";
  }
  if (!role) {
    if (f.isStandIn) return no("You stand in for this submitter only for the periods you were asked about.");
    return no("Only the Metric's owner, its Workflow's owner or the submitter's Stand-in can fill in for someone.");
  }

  // When: after the Due Date, or at any time while the submitter is Away. Without a Workflow there is no Due Date.
  const afterDue = f.workflow !== null && f.today > f.workflow.dueDate;
  if (!afterDue && !f.submitterAway) {
    return no(f.workflow
      ? `Filling in opens after the Due Date, ${f.workflow.dueDate}, or while the submitter is Away.`
      : "Without a Workflow there is no Due Date: filling in is open only while the submitter is Away.");
  }
  return { ok: true, as: role };
}
