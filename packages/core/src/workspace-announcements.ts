// Workspace Announcements (spec 0054, ticket #1089; GLOSSARY: Announcement, Workspace Role). What an Owner or Admin of a
// Workspace tells its people in one plain line, for a while. Every function takes the Actor first and works in the
// Actor's Workspace only: the Workspace is never taken from the browser, every query is filtered by it, and a row of
// another Workspace is as good as missing. Writes and the admin list need an Owner or Admin (not a key, not the demo);
// the shell's read is for Members and Owners and Admins, and returns only what the line shows (AGENTS.md rule 3).
// Changes are written to the Workspace's Audit Log: who, what kind, and the words as they were then.
import { Forbidden, Refused, type Actor } from "./actor";
import {
  announcementId, announcementState, keepingSwitch, orderAnnouncements, workspaceAnnouncementFields, WORKSPACE_ANNOUNCEMENTS_ACTIVE_MAX, WORKSPACE_ANNOUNCEMENTS_TOTAL_MAX,
  wellFormed, type AnnouncementLevel, type WorkspaceAnnouncementFields,
} from "./announcement-rules";
import { audit } from "./audit-log";
import type { AuditKind } from "./audit-kinds";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { DEMO_WORKSPACE_ID } from "./team";

/** The database's refusal when a write would make more than 10 active Announcements in a Workspace (see the migration). */
const CAP_CODE = "ZF4A2";
/** The database's refusal when a Workspace would keep more than 50 Announcements of any kind. */
const TOTAL_CAP_CODE = "ZF4A4";

/** One Workspace Announcement as an Owner or Admin lists it. */
export type WorkspaceAnnouncementRow = WorkspaceAnnouncementFields & {
  id: string;
  state: "off" | "scheduled" | "running" | "ended";
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
};

/** What the shell may show of a Workspace Announcement: the words, the link, the level, whether it can be dismissed and
 * when it was last changed (so an edit brings a dismissed line back). Same shape as an Installation one. */
export type ActiveWorkspaceAnnouncement = { id: string; text: string; link?: { href: string; label: string }; level: AnnouncementLevel; dismissible: boolean; updatedAt: string };

const COLUMNS = "id, text, link_url, link_label, level, starts_at, ends_at, active, dismissible, created_by, updated_by, created_at, updated_at";
const NOT_ADMIN = "Only Owners and Admins write the Workspace's Announcements.";

// A Workspace's Announcements are for its Owners and Admins to write: never a key, a Guest, a Member or the demo.
function assertAdmin(actor: Actor): void {
  // The demo says its one sentence (a DemoReadOnly is a Forbidden), as every other refused change in the demo does.
  if (actor && !actor.key && actor.workspaceId === DEMO_WORKSPACE_ID) throw new DemoReadOnly();
  if (!actor || actor.key || typeof actor.workspaceId !== "string" || !actor.workspaceId
    || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden(NOT_ADMIN);
}

// The audit subject is the words as they were then, cut between characters to the audit's 120 UTF-16 units, so no emoji
// is split into a half the database refuses (which would drop the event).
function subjectOf(text: string): string {
  let out = "";
  for (const ch of wellFormed(text)) { if (out.length + ch.length > 120) break; out += ch; }
  return out;
}

function stored(f: WorkspaceAnnouncementFields) {
  return { text: f.text, link_url: f.link?.href ?? null, link_label: f.link?.label ?? null, level: f.level, starts_at: f.startsAt, ends_at: f.endsAt, active: f.active, dismissible: f.dismissible };
}

function fail(error: { code?: string } | null): never {
  if (error?.code === CAP_CODE) throw new Refused(`At most ${WORKSPACE_ANNOUNCEMENTS_ACTIVE_MAX} Announcements can be on at once. Switch one off or delete one first.`);
  if (error?.code === TOTAL_CAP_CODE) throw new Refused(`A Workspace can keep at most ${WORKSPACE_ANNOUNCEMENTS_TOTAL_MAX} Announcements. Delete some that are over first.`);
  throw new Error("The Announcement could not be saved. Try again.");
}

async function record(actor: Actor, kind: AuditKind, text: string): Promise<void> {
  await audit(actor, { kind, object: { type: "workspace", id: actor.workspaceId, name: subjectOf(text) } });
}

/** All Announcements of the actor's Workspace, most urgent first, for an Owner or Admin. A Workspace keeps at most 50, so
 * the 500 read here never cuts the list. */
export async function workspaceAnnouncements(actor: Actor): Promise<WorkspaceAnnouncementRow[]> {
  assertAdmin(actor);
  const { data } = await db().from("workspace_announcements").select(COLUMNS).eq("workspace_id", actor.workspaceId).limit(500);
  const rows = data ?? [];
  // Names only of people who are in this Workspace now: a person who left is not named here.
  const people = [...new Set(rows.flatMap((r) => [r.created_by, r.updated_by]).filter((p): p is string => typeof p === "string"))];
  const names = new Map<string, string>();
  if (people.length) {
    const { data: members } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).in("user_id", people);
    const here = (members ?? []).map((m) => m.user_id as string);
    if (here.length) for (const p of (await db().from("profiles").select("id, name").in("id", here)).data ?? []) names.set(p.id as string, p.name as string);
  }
  const now = new Date();
  return orderAnnouncements(rows.map((r) => {
    const f: WorkspaceAnnouncementFields = {
      text: r.text as string, link: r.link_url ? { href: r.link_url as string, label: r.link_label as string } : null, level: r.level as AnnouncementLevel,
      startsAt: (r.starts_at as string | null) ?? null, endsAt: (r.ends_at as string | null) ?? null, active: Boolean(r.active), dismissible: Boolean(r.dismissible),
    };
    return { ...f, id: r.id as string, state: announcementState(f, now), createdAt: r.created_at as string, updatedAt: r.updated_at as string,
      createdByName: names.get(r.created_by as string) ?? null, updatedByName: names.get(r.updated_by as string) ?? null };
  }));
}

/** Makes an Announcement in the actor's Workspace; returns its id. Refused over 10 that are on and not over. Only an Owner or Admin. */
export async function createWorkspaceAnnouncement(actor: Actor, input: unknown): Promise<string> {
  assertAdmin(actor);
  const f = workspaceAnnouncementFields(input);
  const { data, error } = await db().from("workspace_announcements").insert({ ...stored(f), workspace_id: actor.workspaceId, created_by: actor.personId, updated_by: actor.personId }).select("id").single();
  if (error || !data) fail(error);
  await record(actor, "announcement.created", f.text);
  return data.id as string;
}

/** Changes every field of an Announcement of the actor's Workspace. Only an Owner or Admin. */
export async function updateWorkspaceAnnouncement(actor: Actor, id: string, input: unknown): Promise<void> {
  assertAdmin(actor);
  const key = announcementId(id);
  const { data: before } = await db().from("workspace_announcements").select("active").eq("id", key).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!before) throw new Forbidden("That Announcement does not exist.");
  const f = workspaceAnnouncementFields(keepingSwitch(input, before.active === true));
  const { data, error } = await db().from("workspace_announcements").update({ ...stored(f), updated_by: actor.personId }).eq("id", key).eq("workspace_id", actor.workspaceId).select("id");
  if (error) fail(error);
  if (!data?.length) throw new Forbidden("That Announcement does not exist.");
  await record(actor, "announcement.changed", f.text);
  if (f.active !== (before.active === true)) await record(actor, f.active ? "announcement.switched_on" : "announcement.switched_off", f.text);
}

/** Switches an Announcement of the actor's Workspace on or off, keeping it for later. Only an Owner or Admin. */
export async function setWorkspaceAnnouncementActive(actor: Actor, id: string, active: boolean): Promise<void> {
  assertAdmin(actor);
  const key = announcementId(id);
  const { data, error } = await db().from("workspace_announcements").update({ active: active === true, updated_by: actor.personId }).eq("id", key).eq("workspace_id", actor.workspaceId).select("text");
  if (error) fail(error);
  if (!data?.length) throw new Forbidden("That Announcement does not exist.");
  await record(actor, active === true ? "announcement.switched_on" : "announcement.switched_off", data[0].text as string);
}

/** Deletes an Announcement of the actor's Workspace for good. Only an Owner or Admin. */
export async function deleteWorkspaceAnnouncement(actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  const key = announcementId(id);
  const { data, error } = await db().from("workspace_announcements").delete().eq("id", key).eq("workspace_id", actor.workspaceId).select("text");
  if (error) fail(error);
  if (!data?.length) throw new Forbidden("That Announcement does not exist.");
  await record(actor, "announcement.deleted", data[0].text as string);
}

/** The Workspace Announcements to show the actor now, most urgent first: those of their own Workspace that are on and
 * inside their window. For Owners, Admins and Members; a Guest, a key and the demo get none. Only what the line shows
 * leaves here (AGENTS.md rule 3). A read the page can do without: on a failure it returns nothing. */
export async function activeWorkspaceAnnouncements(actor: Actor): Promise<ActiveWorkspaceAnnouncement[]> {
  if (!actor || actor.key || typeof actor.workspaceId !== "string" || actor.workspaceId === DEMO_WORKSPACE_ID || !["owner", "admin", "member"].includes(actor.role)) return [];
  // The window is decided in the query, so an Announcement that is on but over, or not yet started, can never push a
  // running one out of the rows read.
  const now = new Date().toISOString();
  const { data, error } = await db().from("workspace_announcements")
    .select("id, text, link_url, link_label, level, starts_at, ends_at, active, dismissible, created_at, updated_at")
    .eq("workspace_id", actor.workspaceId).eq("active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("level", { ascending: false }).order("created_at", { ascending: false }).limit(20);
  if (error || !Array.isArray(data)) return [];
  const running = data.filter((r) => announcementState({ active: Boolean(r.active), startsAt: (r.starts_at as string | null) ?? null, endsAt: (r.ends_at as string | null) ?? null }, new Date(now)) === "running");
  return orderAnnouncements(running.map((r) => ({ r, level: r.level as string, startsAt: (r.starts_at as string | null) ?? null, createdAt: r.created_at as string })))
    .slice(0, WORKSPACE_ANNOUNCEMENTS_ACTIVE_MAX)
    .map(({ r }) => ({
      id: r.id as string, text: r.text as string, ...(r.link_url && r.link_label ? { link: { href: r.link_url as string, label: r.link_label as string } } : {}),
      level: r.level as AnnouncementLevel, dismissible: r.dismissible !== false, updatedAt: r.updated_at as string,
    }));
}
