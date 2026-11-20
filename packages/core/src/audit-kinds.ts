// What the Audit Log records and how it is filtered and written out (spec 0008, GLOSSARY: Audit Log). Pure: the kinds
// of event, their words, the filter as it may be used, and CSV cells that a spreadsheet cannot run as formulas.

/** Every kind of event the Audit Log records, with the words the page and the export use for it. */
export const AUDIT_KINDS = {
  "member.role_changed": "changed the Workspace Role of",
  "member.removed": "removed and handed over the things of",
  "invitation.created": "invited",
  "invitation.revoked": "revoked the invitation for",
  "invitation.accepted": "accepted an invitation",
  "join_request.created": "asked to join",
  "join_request.approved": "let in",
  "join_request.declined": "declined the request to join of",
  "domain_joining.on": "switched Domain Joining on",
  "domain_joining.off": "switched Domain Joining off",
  "contact.added": "added the Contact",
  "contact.removed": "removed the Contact",
  "share.granted": "shared",
  "share.removed": "stopped sharing",
  "group.created": "created the Group",
  "group.renamed": "renamed the Group",
  "group.deleted": "deleted the Group",
  "group.member_added": "added someone to the Group",
  "group.member_removed": "took someone out of the Group",
  "view_link.created": "made a View Link to",
  "view_link.revoked": "revoked a View Link to",
  "access_key.created": "created the Access Key",
  "access_key.revoked": "revoked the Access Key",
  "calendar_link.made": "made a Calendar Link for",
  "calendar_link.revoked": "revoked the Calendar Link of",
  "calendar_link.names_changed": "changed whether the Calendar Link shows names, of",
  "assistant.connected": "connected the assistant",
  "assistant.disconnected": "disconnected the assistant",
  "feed.created": "created the Feed",
  "feed.renamed": "renamed the Feed",
  "feed.deleted": "deleted the Feed",
  "feed.key_created": "created a Feed Key for",
  "feed.key_revoked": "revoked a Feed Key of",
  "view_design.added": "added the View Design",
  "view_design.removed": "removed the View Design",
  "pack.installed": "installed the Pack",
  "pack.updated": "updated the Pack",
  "pack.uninstalled": "uninstalled the Pack",
  "pack.set_up": "set up Metrics, a dashboard or a Workflow from the Pack",
  "dashboard.created": "created the dashboard",
  "metric.created": "created the Metric",
  "metric.deleted": "deleted the Metric",
  "metric.archived": "archived the Metric",
  "metric.restored": "brought back the Metric",
  "metric.workflow_set": "chose the Workflow of",
  "period.locked": "locked a period of",
  "period.unlocked": "unlocked a period of",
  "period.closed": "closed a period of the Workflow",
  "workflow.run_now": "ran today's Workflow steps now",
  "approval.given": "approved a value of",
  "approval.sent_back": "sent back a value of",
  "approval.skipped": "counted without Approval, as nobody else could approve it, a value of",
  "self_check.confirmed": "confirmed, as its submitter, a value of",
  "self_check.corrected": "corrected, as its submitter, a value of",
  "correction.accepted": "accepted a Correction to",
  "correction.declined": "declined a Correction to",
  "workspace.clock_changed": "changed the workspace's time zone or run hour",
  "workspace.renamed": "renamed the workspace",
  "workspace.limit_changed": "changed the Workspace Limit",
  "workspace.profile_changed": "changed the Workspace Profile",
  "workspace.year_start_changed": "changed the month the workspace's year starts in",
  "workspace.number_style_changed": "changed how the workspace writes numbers",
  "workspace.answer_languages_changed": "changed the languages answers are read in",
  "workspace.attainment_method_changed": "changed how the workspace computes Attainment",
  "slack.connected": "connected a Slack workspace",
  "slack.disconnected": "disconnected Slack",
  "telegram.turned_on": "turned Telegram on",
  "telegram.turned_off": "turned Telegram off",
  "snapshot.taken": "took a Snapshot of",
  "snapshot.shown": "showed a Snapshot of",
  "snapshot.deleted": "deleted a Snapshot of",
  "export.audit_log": "exported the Audit Log",
  "export.deck": "exported the deck",
  "person.signed_in": "signed in",
} as const;

/** A kind of Audit Log event, such as "share.granted". */
export type AuditKind = keyof typeof AUDIT_KINDS;

/** The groups of kinds the page filters by, each with its label. */
export const AUDIT_CATEGORIES = {
  member: "Members", invitation: "Invitations", join_request: "Join requests", domain_joining: "Domain Joining", contact: "Contacts",
  share: "Shares", group: "Groups", view_link: "View Links", access_key: "Access Keys", calendar_link: "Calendar Links", assistant: "Assistants", feed: "Feeds", view_design: "View Designs", pack: "Packs", dashboard: "Dashboards", metric: "Metrics", period: "Locks",
  workflow: "Workflow runs", approval: "Approvals", self_check: "Self-checks", correction: "Corrections", workspace: "Settings", slack: "Slack", telegram: "Telegram", snapshot: "Snapshots", export: "Exports", person: "Sign-ins",
} as const;

/** What an Audit Log event can be about. */
export type AuditObjectType = "workspace" | "person" | "invitation" | "group" | "metric" | "dashboard" | "deck" | "access_key" | "feed" | "view_design" | "workflow" | "pack" | "audit_log";

/** Every object type, for checking a filter. */
export const AUDIT_OBJECT_TYPES: AuditObjectType[] = ["workspace", "person", "invitation", "group", "metric", "dashboard", "deck", "access_key", "feed", "view_design", "workflow", "pack", "audit_log"];

/** Objects whose names only people who see them may read: Owners and Admins do not see every Metric, dashboard or deck. */
export const NAMED_IF_SEEN: AuditObjectType[] = ["metric", "dashboard", "deck"];

/** Small structured facts about an event, such as the old and the new role. Never a value or a message body. */
export type AuditDetails = Record<string, string | number | boolean | null | string[]>;

/** A filter for the Audit Log, cleaned: every part known or left out. */
export type AuditFilter = { person?: string; kind?: AuditKind; category?: keyof typeof AUDIT_CATEGORIES; objectType?: AuditObjectType; objectId?: string; from?: string; to?: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (v: unknown) => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** A filter from untrusted input (a page's or a link's query): parts that are not known kinds, ids or days are
 * dropped, so nothing a browser sends reaches a query as text. */
export function cleanAuditFilter(raw: Record<string, unknown> | null | undefined): AuditFilter {
  const r = raw ?? {};
  const f: AuditFilter = {};
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const person = one(r.person), kind = one(r.kind), type = one(r.type), id = one(r.id), from = one(r.from), to = one(r.to);
  if (typeof person === "string" && ID.test(person)) f.person = person;
  if (typeof kind === "string" && kind in AUDIT_KINDS) f.kind = kind as AuditKind;
  else if (typeof kind === "string" && kind in AUDIT_CATEGORIES) f.category = kind as keyof typeof AUDIT_CATEGORIES;
  if (typeof type === "string" && (AUDIT_OBJECT_TYPES as string[]).includes(type)) {
    f.objectType = type as AuditObjectType;
    if (typeof id === "string" && ID.test(id)) f.objectId = id;
  }
  if (realDay(from)) f.from = from as string;
  if (realDay(to)) f.to = to as string;
  if (f.from && f.to && f.to < f.from) [f.from, f.to] = [f.to, f.from];
  return f;
}

/** The kinds a filter's category stands for. */
export function kindsOf(category: keyof typeof AUDIT_CATEGORIES): AuditKind[] {
  return (Object.keys(AUDIT_KINDS) as AuditKind[]).filter((k) => k.startsWith(`${category}.`));
}

/** Details as they may be stored: at most 12 keys of letters, short strings, finite numbers, booleans and short lists. */
export function cleanDetails(details: AuditDetails | undefined): AuditDetails {
  const out: AuditDetails = {};
  for (const [k, v] of Object.entries(details ?? {}).slice(0, 12)) {
    if (!/^[a-z_]{1,30}$/.test(k)) continue;
    if (v === null || typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (Array.isArray(v)) out[k] = v.slice(0, 10).map((x) => String(x).slice(0, 40));
  }
  return out;
}

/** One CSV cell, quoted. A cell that starts with = + - @, a tab or a carriage return gets an apostrophe first, so a
 * spreadsheet shows it as text instead of running it as a formula (CSV injection): names are chosen by people. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** One CSV line of cells, ended with CRLF as RFC 4180 says. */
export function csvLine(cells: unknown[]): string {
  return `${cells.map(csvCell).join(",")}\r\n`;
}
