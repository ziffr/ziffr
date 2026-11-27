// The Workspaces of an Installation (spec 0066; GLOSSARY: Installation Admin, Workspace, Trial Workspace, Workspace
// Limit): for an Installation Admin, each Workspace's name, Owners, kind, dates, limit and counts, and giving a running
// trial more days. Nothing a Workspace holds leaves here: no Metric name, value, note, comment, dashboard or Contact.
// The demo and Practice Workspaces are not listed. A limit is changed by workspace-limits-admin.ts.
import { Forbidden } from "./actor";
import { recordAudit } from "./audit-log";
import { db } from "./db";
import { actingAdmin, assertInstallationAdmin, type InstallationActor } from "./installation-admins";
import { DAY_MS, daysSetting, hostedByCloud } from "./installation-days";
import { ADMIN_ACTIONS_PER_HOUR, panelPage, type PanelPage } from "./installation-users";
import { settingsInEffect } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialThen } from "./trials";
import { syncDefaultLimit } from "./workspace-limits";
import { limitRows, type FoundLimit, type WorkspaceLimitRow } from "./workspace-limits-admin";

/** Workspaces one page of the list holds. */
export const WORKSPACES_PER_PAGE = 50;
/** The most days an extension adds, and how far from today a trial may then end: the longest a trial may last. */
export const TRIAL_EXTEND_MAX_DAYS = 30;

/** What a Workspace is: an ordinary one, one with a Size Ziffr Cloud sold, a running trial, a trial that ended, or
 * one closed because its Size was cancelled. */
export type WorkspaceKind = "workspace" | "size" | "trial" | "trial_ended" | "closed";

/** One Workspace as the panel lists it: the limit's row, with its kind, Owners, counts and dates. `deletedAt` is the
 * day an ended or closed one is deleted; `extendable` says whether its trial may be given more days now. */
export type InstallationWorkspace = WorkspaceLimitRow & {
  kind: WorkspaceKind; owners: { name: string; email: string | null }[]; people: number; dashboards: number;
  createdAt: string; lastUsedAt: string | null; trialEndsAt: string | null; daysLeft: number | null; deletedAt: string | null; extendable: boolean;
};

type WorkspaceRow = FoundLimit & {
  created_at: string; last_used_at: string | null; trial_ends_at: string | null; trial_closed_at: string | null; trial_grace_days: number | null;
  closed_because: string | null; deleting_at: string | null; people: number; dashboards: number; total: number;
};

/** The Owners of each of these Workspaces: their name and address, which are account facts. */
async function ownersOf(ids: string[]): Promise<Map<string, { name: string; email: string | null }[]>> {
  const owners = new Map<string, { name: string; email: string | null }[]>();
  if (!ids.length) return owners;
  const { data, error } = await db().from("memberships").select("workspace_id, profiles(name, email, contact_workspace)").in("workspace_id", ids).eq("role", "owner").order("created_at").order("user_id");
  if (error) throw new Error("The Owners could not be read.");
  for (const m of data ?? []) {
    const p = m.profiles as unknown as { name: string; email: string | null; contact_workspace: string | null } | null;
    // A sealed Contact never owns a Workspace; were one to, nothing of it is read here.
    if (!p || p.contact_workspace) continue;
    const id = m.workspace_id as string;
    owners.set(id, [...(owners.get(id) ?? []), { name: p.name, email: p.email }]);
  }
  return owners;
}

/** One page of Workspaces by name, found by a part of their name or of an Owner's name or address, and whether their
 * limits are Ziffr Cloud's to set. Installation Admins only. */
export async function installationWorkspaces(actor: InstallationActor, query: { search?: unknown; page?: unknown } = {}, now = new Date()): Promise<PanelPage<InstallationWorkspace> & { limitsPinned: boolean }> {
  await assertInstallationAdmin(actor);
  await syncDefaultLimit();
  const settings = await settingsInEffect();
  const keeps = trialThen(settings) === "keep";
  const graceNow = daysSetting("ZIFFR_TRIAL_GRACE_DAYS", settings);
  const page = await panelPage<WorkspaceRow, InstallationWorkspace>(
    query, WORKSPACES_PER_PAGE,
    (search, offset) => db().rpc("installation_workspaces", { p_search: search, p_limit: WORKSPACES_PER_PAGE, p_offset: offset }),
    async (found) => {
      const [limits, owners] = await Promise.all([limitRows(found), ownersOf(found.map((w) => w.workspace_id))]);
      return found.map((w, i) => {
        const ends = w.trial_ends_at ? new Date(w.trial_ends_at) : null;
        const over = ends !== null && ends.getTime() <= now.getTime();
        const kind: WorkspaceKind = w.closed_because === "cancelled" ? "closed" : ends ? (over ? "trial_ended" : "trial") : limits[i].setBy === "cloud" ? "size" : "workspace";
        // As the cleanup counts it: never fewer days than were promised when it closed.
        const grace = w.trial_grace_days === null ? graceNow : Math.max(w.trial_grace_days, graceNow);
        return {
          ...limits[i], kind, owners: owners.get(w.workspace_id) ?? [], people: Number(w.people), dashboards: Number(w.dashboards),
          createdAt: w.created_at, lastUsedAt: w.last_used_at, trialEndsAt: w.trial_ends_at,
          daysLeft: kind === "trial" && ends ? Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / DAY_MS)) : null,
          deletedAt: ends && (kind === "closed" || (kind === "trial_ended" && !keeps)) ? new Date(ends.getTime() + grace * DAY_MS).toISOString() : null,
          extendable: kind === "trial" && !w.trial_closed_at && !w.deleting_at && !!ends && ends.getTime() + DAY_MS <= now.getTime() + TRIAL_EXTEND_MAX_DAYS * DAY_MS,
        };
      });
    },
    "The Workspaces could not be read.",
  );
  return { ...page, limitsPinned: hostedByCloud(process.env) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The words for each way the database refuses an extension. */
const REFUSED: Record<string, string> = {
  days: `Write a whole number of days from 1 to ${TRIAL_EXTEND_MAX_DAYS}.`,
  limit: `At most ${ADMIN_ACTIONS_PER_HOUR} such actions an hour. Try again later.`,
  not_running: "Only a trial that is still running can be given more days.",
  too_far: `A trial can end at most ${TRIAL_EXTEND_MAX_DAYS} days from today. Add fewer days.`,
};

/** Gives a running trial more days (never past TRIAL_EXTEND_MAX_DAYS from today), the one thing about a trial an
 * Installation Admin changes. Its reminders come again before the new end, and keys and View Links the trial had
 * shortened get their own end date back as far as it allows. An ended trial is not reopened. The Workspace's Audit Log
 * and the Installation's audit record it. Answers the new end. */
export async function extendTrial(actor: InstallationActor, workspaceId: string, days: unknown): Promise<{ endsAt: string }> {
  const me = await actingAdmin(actor);
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId) || workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden();
  const n = typeof days === "number" ? days : typeof days === "string" && /^\d{1,3}$/.test(days.trim()) ? Number(days) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > TRIAL_EXTEND_MAX_DAYS) throw new Error(REFUSED.days);
  const { data, error } = await db().rpc("installation_extend_trial", {
    p_actor: actor.personId, p_actor_on_server: me.onServer, p_actor_name: me.name,
    p_workspace: workspaceId, p_days: n, p_max_days: TRIAL_EXTEND_MAX_DAYS, p_limit: ADMIN_ACTIONS_PER_HOUR,
  });
  if (error) throw new Error("The trial could not be extended. Try again.");
  const row = (data as { result: string; ends_at: string | null }[] | null)?.[0];
  if (row?.result === "forbidden" || row?.result === "gone") throw new Forbidden();
  if (row?.result !== "ok" || !row.ends_at) throw new Error(REFUSED[row?.result ?? ""] ?? "The trial could not be extended. Try again.");
  const endsAt = new Date(row.ends_at).toISOString();
  await recordAudit(workspaceId, actor.personId, { kind: "workspace.trial_extended", object: { type: "workspace", id: workspaceId }, details: { days: n, ends_on: endsAt.slice(0, 10), by: "installation_admin" } });
  return { endsAt };
}
