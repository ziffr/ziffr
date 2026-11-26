// Making a Practice Workspace and starting it over (spec 0063; GLOSSARY: Practice Workspace, Installation Admin): for an
// Installation Admin and only their own, one each. Not on a demo-only Installation, nor from inside a Trial Workspace.
// SECURITY: who may is checked here for every call. Starting over deletes in one database step that can delete only the
// Practice Workspace made for the person asking (delete_practice_workspace); no other Workspace can be reached by it.
import { Forbidden } from "./actor";
import { db } from "./db";
import { DEMO_TAKES_NO_WORKSPACES, refuseNewWorkspaceInDemoOnly } from "./demo-only";
import { assertInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import { makeFromDemo } from "./practice-copy";
import { switchOffPracticeWays } from "./practice-ways";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialEndsAt } from "./trials";
import { forgetWorkspaceKey } from "./workspace-keys";

/** How long a Practice Workspace may take to be made before it is taken for abandoned (its server stopped). */
export const PRACTICE_STALE_MS = 15 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_IN_A_TRIAL = "A Practice Workspace is not made from a Trial Workspace.";
const NOT_YOURS = "Only your own Practice Workspace can be started over.";

/** A refusal of making or starting over, in words for the person. */
export class PracticeWorkspaceRefused extends Forbidden {
  constructor(message: string) {
    super(message);
    this.name = "PracticeWorkspaceRefused";
  }
}

/** What the Installation Settings page shows of the person's Practice Workspace. */
export type PracticeWorkspaceState = {
  /** Why none is offered here, in words, or null where it is. */
  refused: string | null;
  /** The person's own, or null. `ready` is false while it is being made. */
  workspace: { id: string; madeAt: string; ready: boolean } | null;
  /** The last day the demo holds a value for, when that is more than a week ago: the copy will end there. Null else. */
  demoEndsOn: string | null;
};

/** Why this person, looking at this Workspace, is offered none, or null. Throws for anyone but an Installation Admin. */
async function refusal(actor: InstallationActor, fromWorkspaceId: string | null): Promise<string | null> {
  await assertInstallationAdmin(actor);
  if (process.env.ZIFFR_DEMO_ONLY === "1") return DEMO_TAKES_NO_WORKSPACES;
  if (fromWorkspaceId && UUID.test(fromWorkspaceId) && (await trialEndsAt(fromWorkspaceId))) return NOT_IN_A_TRIAL;
  return null;
}

/** The person's own Practice Workspace as stored, or null. */
async function own(personId: string): Promise<{ id: string; createdAt: string; importingAt: string | null } | null> {
  const { data, error } = await db().from("workspaces").select("id, created_at, importing_at").eq("practice_for", personId).maybeSingle();
  if (error) throw new Error("Your Practice Workspace could not be read.");
  return data ? { id: data.id as string, createdAt: data.created_at as string, importingAt: (data.importing_at as string | null) ?? null } : null;
}

/** The demo's last day with a value, when it is old. Only the demo's dates are read. */
async function demoEnd(now: Date): Promise<string | null> {
  const { data } = await db().from("observations").select("period_start").eq("workspace_id", DEMO_WORKSPACE_ID).order("period_start", { ascending: false }).limit(1).maybeSingle();
  const last = (data?.period_start as string | undefined) ?? null;
  return last && now.getTime() - Date.parse(`${last}T00:00:00Z`) > 8 * 86_400_000 ? last : null;
}

/** The person's Practice Workspace and whether one is offered here. Installation Admins only. */
export async function practiceWorkspaceState(actor: InstallationActor, fromWorkspaceId: string | null, now = new Date()): Promise<PracticeWorkspaceState> {
  const refused = await refusal(actor, fromWorkspaceId);
  const w = await own(actor.personId);
  return { refused, workspace: w ? { id: w.id, madeAt: w.createdAt, ready: w.importingAt === null } : null, demoEndsOn: refused ? null : await demoEnd(now) };
}

/** Deletes the person's own Practice Workspace with its key and the rows made for it. Refuses any other. */
async function remove(personId: string, workspaceId: string): Promise<void> {
  forgetWorkspaceKey(workspaceId);
  const { data, error } = await db().rpc("delete_practice_workspace", { p_workspace: workspaceId, p_person: personId });
  forgetWorkspaceKey(workspaceId);
  if (error) throw new Error("The Practice Workspace could not be deleted.");
  if (data !== true) throw new Forbidden(NOT_YOURS);
}

/** Makes and fills a new one, then opens it for use; a half-made one is deleted whatever goes wrong. */
async function build(personId: string): Promise<string> {
  let made: string | null = null;
  try {
    const id = await makeFromDemo(personId, (workspaceId) => (made = workspaceId));
    const { error } = await db().from("workspaces").update({ importing_at: null }).eq("id", id).eq("practice_for", personId);
    if (error) throw new Error("The Practice Workspace could not be opened for use.");
    return id;
  } catch (e) {
    // Another request made one first: the database keeps one per person.
    if (!made && (await own(personId))) throw new PracticeWorkspaceRefused("Your Practice Workspace is being made already.");
    if (made) await remove(personId, made).catch((u) => console.error("A half-made Practice Workspace could not be deleted:", (u as Error).message));
    console.error("A Practice Workspace could not be made:", (e as Error).message);
    throw new PracticeWorkspaceRefused("The Practice Workspace could not be made. Nothing of it was kept.");
  }
}

/** Makes the person's Practice Workspace as a copy of the demo and returns its id. Installation Admins only, one each. */
export async function makePracticeWorkspace(actor: InstallationActor, fromWorkspaceId: string | null, now = new Date()): Promise<string> {
  const refused = await refusal(actor, fromWorkspaceId);
  if (refused) throw new PracticeWorkspaceRefused(refused);
  refuseNewWorkspaceInDemoOnly();
  const w = await own(actor.personId);
  if (w) {
    if (w.importingAt === null) throw new PracticeWorkspaceRefused("You have a Practice Workspace already. Open it, or start it over.");
    if (now.getTime() - Date.parse(w.importingAt) < PRACTICE_STALE_MS) throw new PracticeWorkspaceRefused("Your Practice Workspace is being made already.");
    await remove(actor.personId, w.id);
  }
  const id = await build(actor.personId);
  await recordInstallationEvent(actor.personId, "practice_workspace.made", id);
  return id;
}

/** Deletes the named Practice Workspace, which must be the person's own, and makes a fresh one; returns the new id. */
export async function startOverPracticeWorkspace(actor: InstallationActor, workspaceId: string, fromWorkspaceId: string | null, now = new Date()): Promise<string> {
  const refused = await refusal(actor, fromWorkspaceId);
  if (refused) throw new PracticeWorkspaceRefused(refused);
  refuseNewWorkspaceInDemoOnly();
  const w = await own(actor.personId);
  // The id the person confirmed: a page left open from before never deletes the one made since.
  if (!w || w.id !== workspaceId) throw new Forbidden(NOT_YOURS);
  if (w.importingAt !== null && now.getTime() - Date.parse(w.importingAt) < PRACTICE_STALE_MS) throw new PracticeWorkspaceRefused("Your Practice Workspace is being made already.");
  // Each way to oneself is switched off first, which ends its connection (a Slack token is revoked at Slack).
  await switchOffPracticeWays({ personId: actor.personId, workspaceId: w.id, role: "owner" });
  await remove(actor.personId, w.id);
  await recordInstallationEvent(actor.personId, "practice_workspace.removed", w.id);
  const id = await build(actor.personId);
  await recordInstallationEvent(actor.personId, "practice_workspace.made", id);
  return id;
}
