// Changing a Workspace Key (spec 0028, ticket #250; GLOSSARY: Workspace Key, Installation Admin): an Installation Admin
// adds a new key version for one Workspace, after an Owner asked or after an incident, never on a schedule. It
// takes over after about eleven minutes, when every process has loaded it; the re-encryption job
// (workspace-key-job.ts) then moves what was sealed before and destroys the old version once nothing refers to it. Security: nothing here returns or logs a key;
// the answer is the new version number.
import { Forbidden, Refused } from "./actor";
import { recordAudit } from "./audit-log";
import { db } from "./db";
import { assertInstallationAdmin, recordInstallationEvent, type InstallationActor } from "./installation-admins";
import { secretsKey } from "./secrets";
import { DEMO_WORKSPACE_ID } from "./team";
import { addWorkspaceKeyVersion } from "./workspace-keys";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adds a new key version for a Workspace, to take over in a few minutes (KEY_PENDING_SECONDS), and has the job look at it. Installation Admins
 * only, never for the demo (it has no key). Both the Workspace's Audit Log and the Installation's audit record it,
 * by the Workspace's id. Refused with a plain sentence when the Installation has no ZIFFR_SECRETS_KEY or the
 * Workspace has no key yet. */
export async function changeWorkspaceKey(actor: InstallationActor, workspaceId: string): Promise<{ version: number }> {
  await assertInstallationAdmin(actor);
  // From a browser: an id of a real Workspace, never the demo.
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId) || workspaceId.toLowerCase() === DEMO_WORKSPACE_ID) throw new Forbidden();
  const id = workspaceId.toLowerCase();
  const { data: ws } = await db().from("workspaces").select("id").eq("id", id).maybeSingle();
  if (!ws) throw new Forbidden();
  if (!secretsKey()) throw new Refused("ZIFFR_SECRETS_KEY is not set on this server, so no Workspace Key can be made.");
  const version = await addWorkspaceKeyVersion(id);
  if (version === null) throw new Refused("This Workspace has no key yet, or its key was just changed. Wait for the encryption job to give it one, or for the change to finish, and try again.");
  // The job picks a Workspace never gone through first: a changed key is looked at again at once.
  await db().from("workspaces").update({ sealed_checked_at: null }).eq("id", id);
  await recordAudit(id, actor.personId, { kind: "workspace.key_changed", object: { type: "workspace", id }, details: { version } });
  await recordInstallationEvent(actor.personId, "workspace.key_changed", id);
  return { version };
}
