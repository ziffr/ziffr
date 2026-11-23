// @ts-nocheck
// Settable limits at the Workspace and person level (ticket #518; GLOSSARY: Settable Limit): the values an Owner or
// Admin may set for their Workspace and a person for themselves, each within the range the level above allows. Pure,
// so the pages can list them and a test can check every range, default and the order person ⊂ Workspace ⊂ Installation;
// the values themselves are stored and read in limits.ts. A value that is too high for the level above is never used,
// whatever put it there (an Operator who lowered the ceiling later): the level above wins.

/** The keys of the settable limits, as the code that uses one names it. */
export type LimitKey = "alertsPerPerson" | "alertMessagesPerPerson" | "viewLinkDays" | "alertMailShare" | "unusedDays" | "overdueDaysBack" | "calendarDaysBack" | "calendarDaysAhead";

/** One settable limit: its words, its range, its default and who may set it. `ceilingFrom` names the Sending Limit that
 * the Operator sets as the ceiling; `lowerOnly` means a level may only go down from the level above (never up). */
export type LimitDefinition = {
  key: LimitKey; label: string; help: string; unit: "alerts" | "messages" | "days" | "percent";
  min: number; max: number; default: number;
  workspace: boolean; person: boolean; lowerOnly: boolean;
  ceilingFrom?: "alertsPerPerson" | "alertMessagesPerPerson";
  /** The column in `workspace_settable_limits` and `person_settable_limits`. */
  column: string;
};

/** Every settable limit, in the order the pages show them. */
export const LIMIT_DEFINITIONS: LimitDefinition[] = [
  { key: "alertsPerPerson", label: "Alerts per person", help: "The most Alerts one person may hold in this Workspace. Alerts held above a lowered number stay; only new ones wait.", unit: "alerts", min: 1, max: 200, default: 20, workspace: true, person: false, lowerOnly: true, ceilingFrom: "alertsPerPerson", column: "alerts_per_person" },
  { key: "alertMessagesPerPerson", label: "Alert messages per person per day", help: "The Alert messages one person is sent in a day. After it, Alerts still fire into the list; only the messages wait for tomorrow.", unit: "messages", min: 1, max: 200, default: 20, workspace: true, person: true, lowerOnly: true, ceilingFrom: "alertMessagesPerPerson", column: "alert_messages_per_person" },
  { key: "viewLinkDays", label: "Longest life of a View Link", help: "The longest a new View Link may live, in days. Links that exist keep the end date they were made with.", unit: "days", min: 1, max: 90, default: 90, workspace: true, person: false, lowerOnly: true, column: "view_link_days" },
  { key: "alertMailShare", label: "Share of the daily emails Alerts may use", help: "The share of the Workspace's emails per day that Alert messages may use; the rest is kept for requests for values and tasks.", unit: "percent", min: 10, max: 50, default: 40, workspace: true, person: false, lowerOnly: false, column: "alert_mail_share" },
  { key: "unusedDays", label: "Days after which a Metric counts as unused", help: "How long without a look or a value before Ziffr suggests a Metric as unused. Only a suggestion, never an action.", unit: "days", min: 30, max: 365, default: 90, workspace: true, person: false, lowerOnly: false, column: "unused_days" },
  { key: "overdueDaysBack", label: "How far back the overdue list reaches", help: "Days back from today that overdue entries on your Schedule show.", unit: "days", min: 7, max: 90, default: 90, workspace: false, person: true, lowerOnly: true, column: "overdue_days_back" },
  { key: "calendarDaysBack", label: "Calendar Link: days back", help: "Days back from today that your Calendar Link shows events.", unit: "days", min: 0, max: 30, default: 30, workspace: false, person: true, lowerOnly: true, column: "calendar_days_back" },
  { key: "calendarDaysAhead", label: "Calendar Link: days ahead", help: "Days ahead of today that your Calendar Link shows events.", unit: "days", min: 7, max: 90, default: 90, workspace: false, person: true, lowerOnly: true, column: "calendar_days_ahead" },
];

/** The definition with this key. */
export const limitDefinition = (key: LimitKey): LimitDefinition => LIMIT_DEFINITIONS.find((d) => d.key === key)!;

/** Whether a text is the key of a settable limit. */
export const isLimitKey = (v: unknown): v is LimitKey => typeof v === "string" && LIMIT_DEFINITIONS.some((d) => d.key === v);

/** The level a value is set at. */
export type LimitLevel = "workspace" | "person";

/** What the Installation gives a limit: the Operator's ceiling for the two Alert limits, the default otherwise. */
export type InstallationValues = Partial<Record<"alertsPerPerson" | "alertMessagesPerPerson", number>>;

/** The value the Installation level gives this limit. */
export function installationValue(d: LimitDefinition, installation: InstallationValues): number {
  return d.ceilingFrom ? Math.min(d.max, Math.max(d.min, installation[d.ceilingFrom] ?? d.default)) : d.default;
}

/** The value of one limit for a Workspace and a person: person ⊂ Workspace ⊂ Installation. A value above what the
 * level above allows is ignored (a lower-only limit is clamped to it). */
export function resolveLimit(d: LimitDefinition, installation: InstallationValues, workspaceValue: number | null, personValue: number | null): number {
  const inst = installationValue(d, installation);
  let value = inst;
  if (d.workspace && workspaceValue !== null) value = d.lowerOnly ? Math.min(inst, workspaceValue) : workspaceValue;
  if (d.person && personValue !== null) value = d.lowerOnly ? Math.min(value, personValue) : personValue;
  return Math.min(d.max, Math.max(d.min, value));
}

/** The sentence that says why a value is not one for this limit at this level, or null when it is: a whole number from
 * the minimum up to `ceiling`, the value the level above gives (the range's own maximum when it is not lower-only). */
export function limitProblem(d: LimitDefinition, value: unknown, ceiling: number): string | null {
  const top = d.lowerOnly ? Math.min(d.max, ceiling) : d.max;
  const range = `${d.min.toLocaleString("en-US")} to ${top.toLocaleString("en-US")}`;
  if (typeof value !== "number" || !Number.isInteger(value)) return `${d.label} is a whole number from ${range}.`;
  if (value < d.min || value > top) return `${d.label} must be from ${range}${d.lowerOnly && top < d.max ? ", the most the level above allows" : ""}.`;
  return null;
}

/** One limit as a settings page shows it: its words and range, what the level above gives, what is set at this level
 * (null: follows the level above) and the value in effect. */
export type LimitView = { key: LimitKey; label: string; help: string; unit: LimitDefinition["unit"]; min: number; max: number; ceiling: number; set: number | null; effective: number };
