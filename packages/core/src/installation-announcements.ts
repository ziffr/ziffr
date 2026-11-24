// Installation Announcements (spec 0054, ticket #1085; GLOSSARY: Announcement, Installation Admin). What an Installation
// Admin tells everyone in one plain line, for a while. Every write and the admin list check the Installation Admin here;
// the one unauthenticated read, for the sign-in page, returns the text, link and level of public lines and nothing else,
// because it reaches people who are not signed in. Changes are written to the Installation's audit, by who and what.
import { Forbidden, Refused } from "./actor";
import { db } from "./db";
import { assertInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import {
  announcementId, announcementState, installationAnnouncementFields, orderAnnouncements,
  INSTALLATION_ANNOUNCEMENTS_ACTIVE_MAX, type AnnouncementAudience, type AnnouncementFields, type AnnouncementLevel,
} from "./announcement-rules";

/** The database's refusal when a write would make more than 20 active Announcements (see the migration). */
const CAP_CODE = "ZF4A1";

/** One Installation Announcement as an Installation Admin lists it. */
export type InstallationAnnouncementRow = AnnouncementFields & {
  id: string;
  state: "off" | "scheduled" | "running" | "ended";
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
};

/** What the sign-in page may show of a public Announcement: the words, the link and the level, nothing else. */
export type PublicAnnouncement = { text: string; link?: { href: string; label: string }; level: AnnouncementLevel };

const COLUMNS = "id, text, link_url, link_label, level, starts_at, ends_at, active, dismissible, audience, public, created_by, updated_by, created_at, updated_at";
const idOf = announcementId;

function stored(f: AnnouncementFields) {
  return {
    text: f.text, link_url: f.link?.href ?? null, link_label: f.link?.label ?? null, level: f.level,
    starts_at: f.startsAt, ends_at: f.endsAt, active: f.active, dismissible: f.dismissible, audience: f.audience, public: f.public,
  };
}

// The audit subject is the text as it was then, at most 120 characters (the audit keeps no more).
const subjectOf = (text: string) => [...text].slice(0, 120).join("");

function fail(error: { code?: string } | null): never {
  if (error?.code === CAP_CODE) throw new Refused(`At most ${INSTALLATION_ANNOUNCEMENTS_ACTIVE_MAX} Announcements can be on at once. Switch one off or delete one first.`);
  throw new Error("The Announcement could not be saved. Try again.");
}

/** All Announcements of the Installation, most urgent first, for an Installation Admin. */
export async function installationAnnouncements(actor: InstallationActor): Promise<InstallationAnnouncementRow[]> {
  await assertInstallationAdmin(actor);
  const { data } = await db().from("installation_announcements").select(COLUMNS).limit(500);
  const rows = data ?? [];
  const people = [...new Set(rows.flatMap((r) => [r.created_by, r.updated_by]).filter((p): p is string => typeof p === "string"))];
  const names = new Map<string, string>();
  if (people.length) for (const p of (await db().from("profiles").select("id, name").in("id", people)).data ?? []) names.set(p.id as string, p.name as string);
  const now = new Date();
  return orderAnnouncements(rows.map((r) => {
    const f: AnnouncementFields = {
      text: r.text as string, link: r.link_url ? { href: r.link_url as string, label: r.link_label as string } : null, level: r.level as AnnouncementLevel,
      startsAt: (r.starts_at as string | null) ?? null, endsAt: (r.ends_at as string | null) ?? null, active: Boolean(r.active), dismissible: Boolean(r.dismissible),
      audience: r.audience as AnnouncementAudience, public: Boolean(r.public),
    };
    return {
      ...f, id: r.id as string, state: announcementState(f, now), createdAt: r.created_at as string, updatedAt: r.updated_at as string,
      createdByName: names.get(r.created_by as string) ?? null, updatedByName: names.get(r.updated_by as string) ?? null,
    };
  }));
}

/** Makes an Announcement; returns its id. Refused over 20 that are on and not over. Only an Installation Admin. */
export async function createInstallationAnnouncement(actor: InstallationActor, input: unknown): Promise<string> {
  await assertInstallationAdmin(actor);
  const f = installationAnnouncementFields(input);
  const { data, error } = await db().from("installation_announcements").insert({ ...stored(f), created_by: actor.personId, updated_by: actor.personId }).select("id").single();
  if (error || !data) fail(error);
  await recordInstallationEvent(actor.personId, "announcement.created", subjectOf(f.text));
  return data.id as string;
}

/** Changes every field of an Announcement. Only an Installation Admin. */
export async function updateInstallationAnnouncement(actor: InstallationActor, id: string, input: unknown): Promise<void> {
  await assertInstallationAdmin(actor);
  const key = idOf(id);
  const f = installationAnnouncementFields(input);
  const { data, error } = await db().from("installation_announcements").update({ ...stored(f), updated_by: actor.personId }).eq("id", key).select("id");
  if (error) fail(error);
  if (!data?.length) throw new Forbidden("That Announcement does not exist.");
  await recordInstallationEvent(actor.personId, "announcement.changed", subjectOf(f.text));
}

/** Switches an Announcement on or off, keeping it for later. Only an Installation Admin. */
export async function setInstallationAnnouncementActive(actor: InstallationActor, id: string, active: boolean): Promise<void> {
  await assertInstallationAdmin(actor);
  const key = idOf(id);
  const { data, error } = await db().from("installation_announcements").update({ active: active === true, updated_by: actor.personId }).eq("id", key).select("text");
  if (error) fail(error);
  if (!data?.length) throw new Forbidden("That Announcement does not exist.");
  await recordInstallationEvent(actor.personId, active === true ? "announcement.switched_on" : "announcement.switched_off", subjectOf(data[0].text as string));
}

/** Deletes an Announcement for good. Only an Installation Admin. The demo's built-in notice is not a row, so it is not here. */
export async function deleteInstallationAnnouncement(actor: InstallationActor, id: string): Promise<void> {
  await assertInstallationAdmin(actor);
  const key = idOf(id);
  const { data, error } = await db().from("installation_announcements").delete().eq("id", key).select("text");
  if (error) fail(error);
  if (!data?.length) throw new Forbidden("That Announcement does not exist.");
  await recordInstallationEvent(actor.personId, "announcement.deleted", subjectOf(data[0].text as string));
}

/** What the shell may show of an Installation Announcement: the words, the link, the level, whether it can be dismissed,
 * and when it was last changed (so an edit brings a dismissed line back). No audience, window, switch or person. */
export type ActiveAnnouncement = { id: string; text: string; link?: { href: string; label: string }; level: AnnouncementLevel; dismissible: boolean; updatedAt: string };

/** The Installation Announcements to show now, most urgent first, for a signed-in visit or the demo (`demo`: this visit is
 * in the demo, which also gets the lines for the demo only). Not gated by a person: it reads the Installation and no
 * Workspace, and only what the line shows leaves here (AGENTS.md rule 3). A read the page can do without: on a failure
 * it returns nothing rather than breaking every page. */
export async function activeInstallationAnnouncements(visit: { demo: boolean }): Promise<ActiveAnnouncement[]> {
  const audiences = visit.demo === true ? ["everyone", "demo"] : ["everyone"];
  const { data, error } = await db().from("installation_announcements")
    .select("id, text, link_url, link_label, level, starts_at, ends_at, active, dismissible, created_at, updated_at")
    .eq("active", true).in("audience", audiences).limit(100);
  if (error || !Array.isArray(data)) return [];
  const now = new Date();
  const running = data.filter((r) => announcementState({ active: Boolean(r.active), startsAt: (r.starts_at as string | null) ?? null, endsAt: (r.ends_at as string | null) ?? null }, now) === "running");
  return orderAnnouncements(running.map((r) => ({ r, level: r.level as string, startsAt: (r.starts_at as string | null) ?? null, createdAt: r.created_at as string })))
    .slice(0, INSTALLATION_ANNOUNCEMENTS_ACTIVE_MAX)
    .map(({ r }) => ({
      id: r.id as string, text: r.text as string, ...(r.link_url && r.link_label ? { link: { href: r.link_url as string, label: r.link_label as string } } : {}),
      level: r.level as AnnouncementLevel, dismissible: r.dismissible !== false, updatedAt: r.updated_at as string,
    }));
}

/** The Announcements the sign-in page shows, for anyone: public, switched on and inside their window, most urgent
 * first. Only the text, link and level leave here (AGENTS.md rule 3); called from the sign-in page and nothing else. */
export async function publicAnnouncements(): Promise<PublicAnnouncement[]> {
  const { data, error } = await db().rpc("public_installation_announcements");
  // A read the page can do without: if it fails, the sign-in page shows no line rather than an error.
  if (error || !Array.isArray(data)) return [];
  return data.map((r: { text: string; link_url: string | null; link_label: string | null; level: AnnouncementLevel }) => ({
    text: r.text, ...(r.link_url && r.link_label ? { link: { href: r.link_url, label: r.link_label } } : {}), level: r.level,
  }));
}
