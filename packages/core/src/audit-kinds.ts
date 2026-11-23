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
  "view_link.names_changed": "changed whether a View Link shows names, on",
  "share_proposal.proposed": "received a Share Proposal, from an assistant or program, for",
  "share_proposal.confirmed": "confirmed a Share Proposal for",
  "share_proposal.declined": "declined a Share Proposal for",
  "access_key.created": "created the Access Key",
  "access_key.revoked": "revoked the Access Key",
  "calendar_link.made": "made a Calendar Link for",
  "schedule.read": "read the Schedule of",
  "calendar_link.revoked": "revoked the Calendar Link of",
  "calendar_link.names_changed": "changed whether the Calendar Link shows names, of",
  "assistant.connected": "connected the assistant",
  "assistant.disconnected": "disconnected the assistant",
  "feed.created": "created the Feed",
  "feed.renamed": "renamed the Feed",
  "feed.deleted": "deleted the Feed",
  "feed.key_created": "created a Feed Key for",
  "feed.key_revoked": "revoked a Feed Key of",
  "feed.template_downloaded": "downloaded an n8n template for",
  "webhook.created": "added the Webhook",
  "webhook.changed": "changed the Webhook",
  "webhook.secret_replaced": "replaced the secret of the Webhook",
  "webhook.switched_on": "switched on the Webhook",
  "webhook.switched_off": "switched off the Webhook",
  "webhook.deleted": "deleted the Webhook",
  "webhook.resent": "sent a message again to the Webhook",
  "webhook.personal_added": "added their own Webhook",
  "webhook.personal_changed": "changed their own Webhook",
  "webhook.personal_secret_replaced": "replaced the secret of their own Webhook",
  "webhook.personal_switched_on": "switched on their own Webhook",
  "webhook.personal_switched_off": "switched off their own Webhook",
  "webhook.personal_switched_off_failing": "switched off, because it kept failing, the Personal Webhook",
  "webhook.personal_deleted": "deleted their own Webhook",
  "webhook.personal_removed": "removed the Personal Webhook",
  "webhook.personal_ended": "ended, with its person's place in the Workspace, the Personal Webhook",
  "webhook.marked_done": "marked a Task done, through the Webhook",
  "webhook.replied": "replied to a Thread, through the Webhook",
  "webhook.answered": "answered a Question, through the Webhook",
  "webhook.reopened": "reopened a Task, through the Webhook",
  "view_design.added": "added the View Design",
  "view_design.removed": "removed the View Design",
  "theme.added": "added the standard Theme",
  "theme.imported": "imported the Theme",
  "workspace.imported": "finished importing a Workspace Export into",
  "pack.installed": "installed the Pack",
  "pack.updated": "updated the Pack",
  "pack.uninstalled": "uninstalled the Pack",
  "pack.set_up": "set up Metrics, a dashboard or a Workflow from the Pack",
  "dashboard.created": "created the dashboard",
  "metric.created": "created the Metric",
  "metric.deleted": "deleted the Metric",
  "metric.handed_over": "handed over the Metric",
  "metric.archived": "archived the Metric",
  "metric.restored": "brought back the Metric",
  "metric.retention_set": "set the Retention of",
  "metric.retention_cancelled": "cancelled the Retention of",
  "retention.run": "ran the Retention of",
  "retention.mismatch": "left a span alone, as its check did not match, in the Retention of",
  "retention.needs_confirmation": "held back the Retention of, as it would take more than was confirmed,",
  "retention.stopped": "stopped the Retention of, after three failed runs,",
  "metric.workflow_set": "chose the Workflow of",
  "metric.details_changed": "changed the description of",
  "period.locked": "locked a period of",
  "period.unlocked": "unlocked a period of",
  "period.closed": "closed a period of the Workflow",
  "workflow.run_now": "ran today's Workflow steps now",
  "workflow.webhooks_set": "changed the Webhooks the Tell steps tell, of the Workflow",
  "workflow.checklist_set": "changed the checklist of the Workflow",
  "workflow.send_snapshot_set": "changed who gets the Snapshot of the Workflow",
  "workflow.snapshot_sent": "sent the Snapshot of a period of the Workflow",
  "away.set": "set the Away dates of",
  "away.cleared": "cleared the Away dates of",
  "value.filled_in": "filled in a value for someone, of",
  "approval.given": "approved a value of",
  "approval.sent_back": "sent back a value of",
  "approval.skipped": "counted without Approval, as nobody else could approve it, a value of",
  "self_check.confirmed": "confirmed, as its submitter, a value of",
  "self_check.corrected": "corrected, as its submitter, a value of",
  "correction.accepted": "accepted a Correction to",
  "correction.declined": "declined a Correction to",
  "workspace.quiet_hours_changed": "changed the Workspace's default quiet hours",
  "setup.step_skipped": "skipped a step of the Setup Guide",
  "setup.finished": "finished the Setup Guide",
  "workspace.clock_changed": "changed the workspace's time zone, run hour or first day of the week",
  "workspace.renamed": "renamed the workspace",
  "workspace.personal_webhooks_allowed": "allowed people to add their own Webhooks",
  "workspace.personal_webhooks_refused": "stopped people from having their own Webhooks, pausing the existing ones",
  "workspace.limit_changed": "changed the Workspace Limit",
  "workspace.closed_cancelled": "closed the Workspace because its Size was cancelled",
  "workspace.reopened": "opened the Workspace again after its Size was cancelled",
  "workspace.key_changed": "changed the Workspace Key",
  "workspace.profile_changed": "changed the Workspace Profile",
  "workspace.year_start_changed": "changed the month the workspace's year starts in",
  "workspace.number_style_changed": "changed how the workspace writes numbers",
  "workspace.answer_languages_changed": "changed the languages answers are read in",
  "workspace.retention_default_set": "set the Workspace's default Retention",
  "workspace.attainment_method_changed": "changed how the workspace computes Attainment",
  "workspace.settable_limit_changed": "changed a limit of the workspace",
  "person.settable_limit_changed": "changed a limit of their own",
  "connector.test_sent": "sent themselves a Test Message by",
  "slack.connected": "connected a Slack workspace",
  "slack.disconnected": "disconnected Slack",
  "telegram.turned_on": "turned Telegram on",
  "telegram.turned_off": "turned Telegram off",
  "tag.renamed": "renamed the Tag",
  "tag.merged": "merged the Tag",
  "tag.deleted": "deleted the Tag",
  "snapshot.taken": "took a Snapshot of",
  "snapshot.shown": "showed a Snapshot of",
  "snapshot.deleted": "deleted a Snapshot of",
  "export.audit_log": "exported the Audit Log",
  "export.workspace": "started downloading a Workspace Export of",
  "export.workspace_finished": "finished or stopped downloading a Workspace Export of",
  "export.deck": "exported the deck",
  "export.retention_values": "exported the values a Retention would remove from",
  "email_reply.held": "held an email reply that no provider vouched for, until the person it went to confirms it, of",
  "email_reply.confirmed": "confirmed a held email reply",
  "person.signed_in": "signed in",
} as const;

/** A kind of Audit Log event, such as "share.granted". */
export type AuditKind = keyof typeof AUDIT_KINDS;

/** The groups of kinds the page filters by, each with its label. */
export const AUDIT_CATEGORIES = {
  member: "Members", invitation: "Invitations", join_request: "Join requests", domain_joining: "Domain Joining", contact: "Contacts",
  share: "Shares", group: "Groups", view_link: "View Links", share_proposal: "Share Proposals", access_key: "Access Keys", calendar_link: "Calendar Links", schedule: "Schedules", assistant: "Assistants", feed: "Feeds", webhook: "Webhooks", view_design: "View Designs", theme: "Themes", pack: "Packs", dashboard: "Dashboards", metric: "Metrics", tag: "Tags", period: "Locks", value: "Filled-in Values", away: "Away",
  workflow: "Workflow runs", retention: "Retention runs", approval: "Approvals", self_check: "Self-checks", correction: "Corrections", workspace: "Settings", setup: "Setup Guide", connector: "Connectors", slack: "Slack", telegram: "Telegram", snapshot: "Snapshots", export: "Exports", email_reply: "Email replies", person: "Sign-ins",
} as const;

/** What an Audit Log event can be about. */
export type AuditObjectType = "workspace" | "person" | "invitation" | "group" | "metric" | "dashboard" | "deck" | "access_key" | "feed" | "webhook" | "view_design" | "theme" | "workflow" | "pack" | "tag" | "audit_log";

/** Every object type, for checking a filter. */
export const AUDIT_OBJECT_TYPES: AuditObjectType[] = ["workspace", "person", "invitation", "group", "metric", "dashboard", "deck", "access_key", "feed", "webhook", "view_design", "theme", "workflow", "pack", "tag", "audit_log"];

/** Objects whose names only people who see them may read: Owners and Admins do not see every Metric, dashboard or deck, nor every Tag (a Tag is seen through the Metrics carrying it). */
export const NAMED_IF_SEEN: AuditObjectType[] = ["metric", "dashboard", "deck", "tag"];

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
    // "sealed" holds the sealed details themselves (spec 0028): never a detail of its own.
    if (!/^[a-z_]{1,30}$/.test(k) || k === "sealed") continue;
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
