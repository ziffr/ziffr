// The Audit Log (spec 0008, GLOSSARY: Audit Log): one add-only record of the governance events of a Workspace, written
// by the core next to each action, read and exported by the workspace's Owners and Admins. It keeps who, what kind,
// which object (with its name at the time) and when, plus small details; never values, message bodies or secrets.
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "./db";
import { touchWorkspace } from "./unused-workspaces";
import { insertSealed, openNames, openRows, sealDetails } from "./sealed-columns";
import { Forbidden, type Actor } from "./actor";
import { visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { canSee } from "./sharing";
import { DEMO_WORKSPACE_ID } from "./team";
import { auditKeepDays } from "./audit-retention";
import { workspaceClock } from "./workspace-clock";
import {
  AUDIT_KINDS, cleanAuditFilter, cleanDetails, csvLine, kindsOf, NAMED_IF_SEEN,
  type AuditDetails, type AuditFilter, type AuditKind, type AuditObjectType,
} from "./audit-kinds";

/** How long the Audit Log keeps an event unless the Installation sets otherwise, in days (two years; audit-retention.ts
 * has the days in effect). The database refuses to remove an event younger than a year, whatever is set. */
export const AUDIT_RETENTION_DAYS = 730;
/** The most events one CSV export holds; narrow the dates for more. */
export const AUDIT_EXPORT_CAP = 50_000;
/** The most events one page of the log shows. */
export const AUDIT_PAGE_SIZE = 100;

/** An event to record. `object.name` is the name it has now, kept as it was. */
export type AuditInput = {
  kind: AuditKind;
  object?: { type: AuditObjectType; id: string | number; name?: string | null };
  details?: AuditDetails;
  /** The Access Key a program acted with, when it was one. */
  accessKeyId?: number | null;
};

/** One event as an Owner or Admin reads it. `objectName` is null for a Metric, dashboard or deck they do not see. */
export type AuditEvent = {
  id: number; at: string; actorId: string | null; actorName: string; kind: AuditKind; label: string;
  objectType: AuditObjectType | null; objectId: string | null; objectName: string | null; hidden: boolean; details: AuditDetails;
};

/** Records an event in a workspace, as the person `by` (null for Ziffr itself, or for the service `system` names, such
 * as Ziffr Cloud). Best effort by design: the action it
 * describes has already happened, so a failure here is logged with its kind and never undoes or fails the action
 * (spec 0008). The demo is not recorded: its made-up people are anyone. Never pass a value or a message body. */
export async function recordAudit(workspaceId: string, by: string | null, event: AuditInput, system = "Ziffr"): Promise<void> {
  if (workspaceId === DEMO_WORKSPACE_ID) return;
  try {
    const [{ data: person }, { data: key }] = await Promise.all([
      // A Contact approving through a Connector has a sealed name: opened, so the log never keeps its ciphertext.
      by ? db().from("profiles").select("id, name").eq("id", by).maybeSingle().then(async (r) => ({ data: r.data ? (await openNames(workspaceId, [r.data]))[0] : null })) : Promise.resolve({ data: null }),
      event.accessKeyId ? db().from("access_keys").select("name").eq("id", event.accessKeyId).eq("workspace_id", workspaceId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const details = cleanDetails({ ...event.details, ...(key ? { key_name: key.name as string } : {}) });
    // The object's name and the details are sealed with the Workspace Key (spec 0028); the kind, the object's type
    // and id and who did it stay readable, so the log can be filtered. The details are kept as {"sealed": "w1..."}.
    await insertSealed("audit_events", workspaceId, [{
      actor_id: by ? String(by).slice(0, 64) : null,
      actor_name: String(person?.name ?? (by ? "A former member" : system)).trim().slice(0, 120) || "Someone",
      access_key_id: event.accessKeyId ?? null,
      kind: event.kind,
      object_type: event.object?.type ?? null,
      object_id: event.object ? String(event.object.id).slice(0, 64) : null,
      object_name: event.object?.name ? String(event.object.name).slice(0, 120) : null,
      details,
    }], "id", sealDetails);
  } catch (e) {
    // Only the kind and the error's code: the details may name people.
    console.error(`Audit Log: could not record ${event.kind} (${(e as { code?: string }).code ?? "error"})`);
    return;
  }
  // Older events go once they pass the days the Installation keeps them (never fewer than a Retention or an Approval
  // still refers to); the database allows nothing younger than a year to be removed. A day's margin keeps a server
  // clock ahead of the database's from asking for a removal the database refuses. Fails closed: when the setting
  // cannot be read, nothing is removed this time.
  try {
    const keep = await auditKeepDays();
    await db().from("audit_events").delete().eq("workspace_id", workspaceId).lt("at", new Date(Date.now() - (keep + 1) * 86_400_000).toISOString());
  } catch {
    console.error("Audit Log: old events were not removed this time (the setting could not be read).");
  }
}

const viaKey = new AsyncLocalStorage<number>();

/** Runs work that a program does as its key's creator through the app's own functions: every event they record names
 * the key (`accessKeyId`), so the Audit Log tells a person's change from their key's. */
export const auditedAsKey = <T>(keyId: number, work: () => Promise<T>): Promise<T> => viaKey.run(keyId, work);

/** recordAudit for an Actor in their workspace. */
export async function audit(actor: Actor, event: AuditInput): Promise<void> {
  await recordAudit(actor.workspaceId, actor.personId, { ...event, accessKeyId: event.accessKeyId ?? viaKey.getStore() ?? null });
}

/** Records a sign-in in every workspace the person belongs to (not the demo), for their Owners and Admins. */
export async function recordSignIn(personId: string): Promise<void> {
  try {
    const { data } = await db().from("memberships").select("workspace_id").eq("user_id", String(personId));
    for (const m of data ?? []) {
      await recordAudit(m.workspace_id as string, personId, { kind: "person.signed_in", object: { type: "person", id: personId } });
      // A sign-in is use: a Workspace someone signs in to is never deleted as unused (spec 0029).
      await touchWorkspace(m.workspace_id as string);
    }
  } catch {
    console.error("Audit Log: could not record a sign-in");
  }
}

/** Records that the actor exported a deck they see, as PowerPoint or PDF. The file is made in the browser, so this
 * is what the browser reports, after it made the file. */
export async function recordDeckExport(actor: Actor, deckId: number, format: "pptx" | "pdf"): Promise<void> {
  if (actor.key || !Number.isInteger(deckId) || (format !== "pptx" && format !== "pdf")) throw new Forbidden();
  if (!(await canSee(actor, "deck", deckId))) throw new Forbidden();
  const { data } = await db().from("decks").select("name").eq("id", deckId).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "export.deck", object: { type: "deck", id: deckId, name: data?.name ?? null }, details: { format } });
}

/** Refuses anyone but the workspace's Owners and Admins, and every Access Key. Admins see all of it: they manage the
 * same members, invitations, Groups and keys the log is about, and it is add-only, so seeing it lets no one hide
 * anything (spec 0008). */
function assertReader(actor: Actor) {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only Owners and Admins see the Audit Log.");
}

/** Which Metrics, dashboards and decks the reader sees, so names of the others stay out. */
async function seenBy(actor: Actor) {
  const ws = actor.workspaceId;
  const [metrics, dashboards, decks] = await Promise.all([
    getMetrics(ws).then((m) => visibleMetricIds(ws, actor.personId, m)),
    visibleDashboards(ws, actor.personId),
    visibleDecks(ws, actor.personId),
  ]);
  return { reader: actor.personId, metric: metrics, dashboard: new Set(dashboards.map((d) => d.id)), deck: new Set(decks.map((d) => d.id)) };
}

/** The first instant of a calendar day in a time zone. */
function dayStart(day: string, timeZone: string): Date {
  const guess = Date.parse(`${day}T00:00:00Z`);
  const offset = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - t;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

type Row = { id: number; at: string; actor_id: string | null; actor_name: string; kind: string; object_type: string | null; object_id: string | null; object_name: string | null; details: AuditDetails };

/** One batch of rows matching a cleaned filter, newest first, below an id. Every part is a typed filter. */
async function rows(actor: Actor, f: AuditFilter, timeZone: string, before: number | null, limit: number): Promise<Row[]> {
  let q = db().from("audit_events").select("id, at, actor_id, actor_name, kind, object_type, object_id, object_name, details").eq("workspace_id", actor.workspaceId);
  if (f.person) q = q.eq("actor_id", f.person);
  if (f.kind) q = q.eq("kind", f.kind);
  else if (f.category) q = q.in("kind", kindsOf(f.category));
  if (f.objectType) q = q.eq("object_type", f.objectType);
  if (f.objectType && f.objectId) q = q.eq("object_id", f.objectId);
  if (f.from) q = q.gte("at", dayStart(f.from, timeZone).toISOString());
  if (f.to) q = q.lt("at", dayStart(nextDay(f.to), timeZone).toISOString());
  if (before !== null) q = q.lt("id", before);
  const { data, error } = await q.order("id", { ascending: false }).limit(limit);
  if (error) throw new Error("The Audit Log could not be read.");
  return openRows("audit_events", actor.workspaceId, (data ?? []) as Row[]);
}

/** A stored row as the reader may see it: names of Metrics, dashboards and decks they do not see are left out. */
function shown(r: Row, seen: Awaited<ReturnType<typeof seenBy>>): AuditEvent {
  const type = r.object_type as AuditObjectType | null;
  // Only what the reader may see goes out: Owners and Admins do not see every Metric, dashboard or deck. What they did
  // themselves they saw when they did it, so a Metric they deleted keeps its name for them.
  const hidden = Boolean(type && NAMED_IF_SEEN.includes(type) && r.actor_id !== seen.reader && !seen[type as "metric" | "dashboard" | "deck"].has(Number(r.object_id)));
  return {
    id: r.id, at: r.at, actorId: r.actor_id, actorName: r.actor_name, kind: r.kind as AuditKind, label: AUDIT_KINDS[r.kind as AuditKind] ?? r.kind,
    // Its details too (who it was shared with, periods, key names): the reader learns only that something happened.
    objectType: type, objectId: r.object_id, objectName: hidden ? null : r.object_name, hidden, details: hidden ? {} : r.details ?? {},
  };
}

/** One page of the workspace's Audit Log, newest first, for Owners and Admins, with the cursor for the next page.
 * The filter comes from untrusted input and is cleaned here. */
export async function auditLog(actor: Actor, filter: Record<string, unknown> = {}, page: { before?: number | null } = {}): Promise<{ events: AuditEvent[]; next: number | null; filter: AuditFilter; timeZone: string }> {
  assertReader(actor);
  const f = cleanAuditFilter(filter);
  const before = Number.isSafeInteger(Number(page.before)) && Number(page.before) > 0 ? Number(page.before) : null;
  const { timeZone } = await workspaceClock(actor);
  const [found, seen] = await Promise.all([rows(actor, f, timeZone, before, AUDIT_PAGE_SIZE + 1), seenBy(actor)]);
  const events = found.slice(0, AUDIT_PAGE_SIZE).map((r) => shown(r, seen));
  return { events, next: found.length > AUDIT_PAGE_SIZE ? events[events.length - 1].id : null, filter: f, timeZone };
}

/** How many times a workspace may export its Audit Log in an hour. */
export const AUDIT_EXPORTS_PER_HOUR = 10;

/** Too many exports of the Audit Log in the last hour. */
export class AuditExportLimit extends Error {
  constructor() {
    super(`The Audit Log was exported ${AUDIT_EXPORTS_PER_HOUR} times in the last hour. Try again later.`);
  }
}

/** The columns of the CSV export. */
export const AUDIT_CSV_COLUMNS = ["time_utc", "person", "person_id", "kind", "what", "object_type", "object_id", "object_name", "details"];

/** Exports the Audit Log as CSV, for Owners and Admins: checks and records the export at once, then hands back the
 * file's name and its lines, read from the database in batches as they are sent (at most AUDIT_EXPORT_CAP events). */
export async function exportAuditLog(actor: Actor, filter: Record<string, unknown> = {}): Promise<{ filename: string; lines: AsyncIterable<string> }> {
  assertReader(actor);
  const f = cleanAuditFilter(filter);
  const { timeZone } = await workspaceClock(actor);
  const seen = await seenBy(actor);
  // At most AUDIT_EXPORTS_PER_HOUR a workspace, counted from the export events below (spec 0009): a stolen session
  // cannot pull the log again and again, and the count needs no table of its own.
  const { count } = await db().from("audit_events").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("kind", "export.audit_log").gte("at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= AUDIT_EXPORTS_PER_HOUR) throw new AuditExportLimit();
  // Exporting the log is itself an event, recorded before the first line goes out.
  await audit(actor, { kind: "export.audit_log", object: { type: "audit_log", id: actor.workspaceId }, details: {
    person: f.person ?? null, kind: f.kind ?? f.category ?? null, object_type: f.objectType ?? null, object_id: f.objectId ?? null, from: f.from ?? null, to: f.to ?? null, format: "csv",
  } });
  const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  async function* lines() {
    yield csvLine(AUDIT_CSV_COLUMNS);
    let before: number | null = null;
    let sent = 0;
    while (sent < AUDIT_EXPORT_CAP) {
      const batch = await rows(actor, f, timeZone, before, Math.min(1000, AUDIT_EXPORT_CAP - sent));
      if (!batch.length) return;
      for (const r of batch) {
        const e = shown(r, seen);
        yield csvLine([new Date(e.at).toISOString(), e.actorName, e.actorId, e.kind, e.label, e.objectType, e.objectId, e.objectName, e.details]);
      }
      sent += batch.length;
      before = batch[batch.length - 1].id;
    }
  }
  return { filename, lines: lines() };
}
