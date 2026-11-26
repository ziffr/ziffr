// The Audit Log page (spec 0008, GLOSSARY: Audit Log): who did what, when, in this Workspace, for its Owners and
// Admins. Filters are a plain GET form, so a filtered view is a link; the CSV export uses the same filter.
import Link from "next/link";
import { currentActor } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { isDemo } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { auditLog, AUDIT_EXPORT_CAP, type AuditEvent } from "@ziffr/core/audit-log";
import { auditKeptWords } from "@ziffr/core/audit-retention";
import { formatDate } from "@ziffr/core/format";
import { monthName, toYearStart } from "@ziffr/core/periods";
import { AUDIT_CATEGORIES, AUDIT_KINDS, kindsOf, type AuditFilter } from "@ziffr/core/audit-kinds";
import { BUSINESS_FUNCTION_LABELS, isBusinessFunction } from "@ziffr/pack/business-functions";
import { filledInDetail } from "./filled-in-detail";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member", guest: "Guest", viewer: "Viewer", editor: "Editor" };
const NOUN: Record<string, string> = { metric: "Metric", dashboard: "dashboard", deck: "deck", group: "Group", person: "person", invitation: "invitation", access_key: "Access Key", workflow: "Workflow", workspace: "workspace", audit_log: "Audit Log" };
/** A link in a row: 44 px tall to tap on a phone. */
const TAP = "max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";
const field = "h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";

/** The query string of a filter, with one part changed. */
function query(f: AuditFilter, change: Record<string, string | number | null | undefined> = {}) {
  const parts: Record<string, string | number | null | undefined> = { person: f.person, kind: f.kind ?? f.category, type: f.objectType, id: f.objectId, from: f.from, to: f.to, ...change };
  const q = new URLSearchParams(Object.entries(parts).filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== null && e[1] !== "").map(([k, v]) => [k, String(v)]));
  return q.size ? `?${q}` : "";
}

/** What the event was about, in words; a Metric, dashboard or deck the reader does not see has no name here. */
function about(e: AuditEvent) {
  if (!e.objectType || e.objectType === "workspace" || e.objectType === "audit_log" || (e.objectType === "person" && e.objectId === e.actorId)) return null;
  if (e.hidden) return `a ${NOUN[e.objectType]} you do not see (#${e.objectId})`;
  return e.objectName ?? `${NOUN[e.objectType] ?? "item"} #${e.objectId}`;
}

/** A Business Function key in words; "none" when it was cleared or never set. */
const labelOf = (k: unknown) => (isBusinessFunction(k) ? BUSINESS_FUNCTION_LABELS[k] : "none");

/** The details that matter, short: old and new roles, who a Share went to, the period. Never values. */
/** What a setting followed before it was chosen: the Workspace's country, or the default when it had none. Events
 * from before this was recorded say the country. */
const followed = (d: Record<string, unknown>) => (d.followed === "default" ? "from the default" : "from the country");

function detailText(e: AuditEvent, nameOf: (id: string) => string | undefined): string {
  const d = e.details;
  const role = (r: unknown) => ROLE[String(r)] ?? String(r);
  switch (e.kind) {
    case "member.role_changed": return `${role(d.from)} → ${role(d.to)}`;
    case "member.removed": return `was ${role(d.role)}; ${d.handed_over ?? 0} things handed to ${d.successor_name ?? "someone"}`;
    case "invitation.created": case "invitation.revoked": case "invitation.accepted": case "join_request.approved": return d.role ? `as ${role(d.role)}` : "";
    case "domain_joining.on": case "domain_joining.off": return String(d.domain ?? "");
    case "share.granted": case "share.removed": return `${d.to_type === "group" ? "Group " : ""}${d.to_name ?? "someone"} as ${role(d.role)}${d.from_role ? ` (was ${role(d.from_role)})` : ""}`;
    case "group.renamed": return `from “${d.from}”`;
    case "group.member_added": case "group.member_removed": return String(d.person_name ?? "");
    case "view_link.created": return `${d.frozen ? "frozen" : "live"}, until ${formatDate(String(d.expires_on))}`;
    case "access_key.created": return `${(d.scopes as string[] | undefined)?.join(", ") ?? ""}, until ${formatDate(String(d.expires_on))}`;
    case "metric.created": return d.key_name ? `with the key ${d.key_name}` : "";
    case "metric.deleted": return `${d.values ?? 0} values went with it`;
    case "metric.details_changed": return `changed: ${((d.fields as string[] | undefined) ?? []).join(", ")}`;
    case "metric.workflow_set": return d.workflow_name ? `now ${d.workflow_name}` : "no Workflow now";
    case "period.locked": case "period.unlocked": case "approval.given": case "approval.sent_back": case "approval.skipped": case "self_check.confirmed": case "self_check.corrected": case "correction.accepted": case "correction.declined": return String(d.period ?? "");
    case "away.set": return `${d.from} to ${d.to}`;
    // For whom, so the Audit Log answers "who put that number in" (spec 0046).
    case "value.filled_in": return filledInDetail(d, nameOf);
    case "schedule.read": return `${d.from && d.to ? `${d.from} to ${d.to}` : ""}${d.key_name ? `, with the key ${d.key_name}` : ""}`;
    case "period.closed": return `${d.locked ?? 0} locked, as of ${d.as_of}`;
    case "workflow.run_now": return `${d.prompts ?? 0} Prompts, ${d.reminders ?? 0} reminders, ${d.escalations ?? 0} Escalations`;
    case "workspace.quiet_hours_changed": return `${d.from} → ${d.to}`;
    case "workspace.clock_changed": return `${d.from_time_zone} ${d.from_run_hour}:00 → ${d.to_time_zone} ${d.to_run_hour}:00${d.from_week_start !== d.to_week_start ? `, week starts on ${d.to_week_start === 0 ? "Sunday" : "Monday"}` : ""}`;
    // Keys only; the words come from the list.
    // The way and what became of it, from fixed words; never an address (the line holds none).
    case "connector.test_sent": return `${{ email: "email", slack: "Slack", telegram: "Telegram" }[String(d.way)] ?? ""}${typeof d.outcome === "string" && ["sent", "queued", "kept"].includes(d.outcome) ? `: ${d.outcome === "kept" ? "kept in the Outbox" : d.outcome === "queued" ? "waiting to be sent" : "sent"}` : ""}`;
    case "person.business_function_changed": return `${labelOf(d.from)} → ${labelOf(d.to)}`;
    case "workspace.year_start_changed": return `${monthName(toYearStart(d.from))} → ${monthName(toYearStart(d.to))}`;
    case "workspace.number_style_changed": return `${d.from ?? followed(d)} → ${d.to}`;
    case "workspace.answer_languages_changed": return `${Array.isArray(d.from) ? d.from.join(", ") : followed(d)} → ${Array.isArray(d.to) ? d.to.join(", ") : ""}`;
    case "workspace.attainment_method_changed": return `${d.from} → ${d.to}`;
    case "workspace.settable_limit_changed": case "person.settable_limit_changed": return `${d.limit}: ${d.from ?? "follows the level above"} → ${d.to ?? "follows the level above"}`;
    case "export.deck": return String(d.format ?? "").toUpperCase();
    // Counts only: neither a Metric's name nor a value is written down (spec 0056).
    case "export.metric_values": return `${d.metrics ?? 0} ${d.metrics === 1 ? "Metric" : "Metrics"}, ${d.rows ?? 0} ${d.rows === 1 ? "value" : "values"}`;
    default: return "";
  }
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (actor.role !== "owner" && actor.role !== "admin") {
    return (
      <>
        <PageHeader title="Audit Log" />
        <p className="text-sm text-muted-foreground">Only Owners and Admins of this workspace see the Audit Log.</p>
      </>
    );
  }
  const sp = await searchParams;
  // The core cleans the filter and leaves out names of Metrics, dashboards and decks this person does not see.
  const [{ events, next, filter, timeZone }, people, demo] = await Promise.all([auditLog(actor, sp, { before: Number(sp.before) || null }), getProfiles(), isDemo()]);
  const when = new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium", timeStyle: "short" });
  const members = people.filter((p) => !p.contact);
  const named = new Map(members.map((p) => [p.id, p.name]));
  for (const e of events) if (e.actorId && !named.has(e.actorId)) named.set(e.actorId, e.actorName);
  // A value can be filled in for a Contact too: the details name them, not only members.
  const everyone = new Map(people.map((p) => [p.id, p.name]));
  const filtered = Boolean(filter.person || filter.kind || filter.category || filter.objectType || filter.from || filter.to);

  return (
    <>
      <PageHeader title="Audit Log" sub={`Who changed what, and when. It cannot be edited; events are kept for ${await auditKeptWords()}. Times are in ${timeZone}.`}>
        <a href={`/audit/export${query(filter)}`} className={buttonVariants({ variant: "outline" })} download>Download CSV</a>
      </PageHeader>
      {demo && <p className="mb-4 text-sm text-muted-foreground">The demo keeps no Audit Log: its people are made up and anyone may act as them.</p>}
      <form method="get" action="/audit" className="mb-5 flex flex-wrap items-end gap-3 text-sm" aria-label="Filter the Audit Log">
        <label className="grid w-full min-w-0 gap-1 sm:w-auto">
          <span className="text-muted-foreground">Person</span>
          <select name="person" defaultValue={filter.person ?? ""} className={`${field} w-full min-w-0`}>
            <option value="">Everyone</option>
            {[...named].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="grid w-full min-w-0 gap-1 sm:w-auto">
          <span className="text-muted-foreground">What happened</span>
          <select name="kind" defaultValue={filter.kind ?? filter.category ?? ""} className={`${field} w-full min-w-0`}>
            <option value="">Everything</option>
            {(Object.entries(AUDIT_CATEGORIES) as [keyof typeof AUDIT_CATEGORIES, string][]).map(([cat, label]) => (
              <optgroup key={cat} label={label}>
                <option value={cat}>All {label.toLowerCase()}</option>
                {kindsOf(cat).map((k) => <option key={k} value={k}>{AUDIT_KINDS[k].replace(/ (of|for|to)$/, "")}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="grid w-full min-w-0 gap-1 sm:w-auto">
          <span className="text-muted-foreground">From</span>
          <Input type="date" name="from" defaultValue={filter.from ?? ""} className="w-full sm:w-40" />
        </label>
        <label className="grid w-full min-w-0 gap-1 sm:w-auto">
          <span className="text-muted-foreground">To</span>
          <Input type="date" name="to" defaultValue={filter.to ?? ""} className="w-full sm:w-40" />
        </label>
        {filter.objectType && <input type="hidden" name="type" value={filter.objectType} />}
        {filter.objectId && <input type="hidden" name="id" value={filter.objectId} />}
        <button type="submit" className={buttonVariants({ variant: "default" })}>Show</button>
        {filtered && <Link href="/audit" className={buttonVariants({ variant: "ghost" })}>Clear</Link>}
      </form>
      {filter.objectType && (
        <p className="mb-4 text-sm">
          Only events about one {NOUN[filter.objectType]}{filter.objectId ? ` (#${filter.objectId})` : ""}. <Link href={`/audit${query(filter, { type: null, id: null })}`} className={TAP}>Show all</Link>
        </p>
      )}
      {events.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-6 text-sm text-muted-foreground">
          {filtered ? "Nothing matches this filter." : "Nothing recorded yet. Role changes, invitations, Shares, Groups, View Links, Access Keys, Locks, Approvals, Corrections, settings, exports and sign-ins show up here."}
        </p>
      ) : (
        <div className="stock overflow-x-auto rounded-[var(--radius-card)]">
          {/* On a phone each event is a small card, not a row of four columns. */}
          <table className="w-full text-sm max-sm:block">
            <thead className="text-left text-xs text-muted-foreground max-sm:sr-only">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-2 font-medium">When</th>
                <th scope="col" className="px-4 py-2 font-medium">Who</th>
                <th scope="col" className="px-4 py-2 font-medium">What</th>
                <th scope="col" className="px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border max-sm:block">
              {events.map((e) => {
                const object = about(e);
                return (
                  <tr key={e.id} className="align-baseline max-sm:block max-sm:px-4 max-sm:py-3">
                    <td className="fig whitespace-nowrap px-4 py-2 text-xs text-muted-foreground max-sm:block max-sm:p-0"><time dateTime={e.at}>{when.format(new Date(e.at))}</time></td>
                    <td className="whitespace-nowrap px-4 py-2 font-medium max-sm:block max-sm:p-0">
                      {e.actorId ? <Link href={`/audit${query(filter, { person: e.actorId })}`} className={`${TAP} no-underline hover:underline`}>{e.actorName}</Link> : e.actorName}
                    </td>
                    <td className="px-4 py-2 max-sm:block max-sm:p-0">
                      {e.label}
                      {object && <> {e.objectType && e.objectId ? <Link href={`/audit${query(filter, { type: e.objectType, id: e.objectId })}`} className={cn(TAP, e.hidden && "italic text-muted-foreground")}>{object}</Link> : object}</>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground max-sm:block max-sm:p-0 max-sm:empty:hidden">{detailText(e, (id) => named.get(id) ?? everyone.get(id))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>The CSV holds at most {AUDIT_EXPORT_CAP.toLocaleString("en-GB")} events with this filter; pick dates for more. Downloading it is recorded here too.</span>
        {next && <Link href={`/audit${query(filter, { before: next })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Older events</Link>}
      </div>
    </>
  );
}
