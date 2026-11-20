// Access Keys (GLOSSARY: Access Key): created by a person for a program, bound to one Workspace, limited to scopes
// and ending on a set day. A key acts as its creator, with the creator's current role, and can do no more than its
// scopes allow; it stops when it ends, when it is revoked, or when its creator is no longer a member. Only a hash of
// the secret is stored; the secret is shown once.
import { timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { hash, insertKey } from "./internal/key-store";
import { can, FEED_SCOPE, Forbidden, KEY_ONLY_SCOPES, SCOPES, type Actor, type FeedActor, type KeyActor, type Scope, type WorkspaceRoleName } from "./actor";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialEnded } from "./trials";
import { assertSeesMetrics } from "./sharing";
import { audit } from "./audit-log";

const DAY = 86_400_000;
/** The stored form of a secret: its SHA-256, never the secret (kept with the key store). */
export { hash };
const today = () => new Date().toISOString().slice(0, 10);

/** A key as its creator and the workspace's Owners and Admins see it: never the secret. */
/** `kind` is `assistant` for a connected assistant (spec 0023), whose `name` is what the assistant calls itself. */
export type AccessKeyInfo = { id: number; name: string; prefix: string; scopes: string[]; expires_on: string; revoked: boolean; last_used_at: string | null; created_by: string; kind: "program" | "assistant"; created_at: string };

/** What any key the actor makes may hold, checked the same for keys made on the Team page and for assistants
 * connected by OAuth (spec 0023): never by a key, never in the demo, known scopes only, never more than the role
 * allows, and an end date within a year. */
export function checkKeyRequest(actor: Actor, wanted: unknown, expiresOn: unknown, opts: { assistant?: boolean } = {}): { scopes: Scope[]; expires: string } {
  if (actor.key) throw new Forbidden("A key cannot make keys.");
  const scopes = [...new Set(Array.isArray(wanted) ? wanted : [])] as Scope[];
  if (!scopes.length || !scopes.every((s) => SCOPES.includes(s))) throw new Error("Pick what the key may do.");
  // Approving is a person's check: an assistant's connection never holds it, whatever the request says (ticket #427).
  if (opts.assistant && scopes.some((s) => KEY_ONLY_SCOPES.includes(s))) throw new Forbidden("An assistant cannot be allowed to approve values or manage View Links.");
  // A key never does what its creator's role does not allow (spec 0003); the role is checked again on every call.
  if (scopes.includes("metrics:write") && !can(actor, "create")) throw new Forbidden("Your role cannot create Metrics, so neither can a key of yours.");
  if (scopes.includes("metrics:edit") && !can(actor, "create")) throw new Forbidden("Your role cannot change Metrics, so neither can a key of yours.");
  if (scopes.includes("dashboards:write") && !can(actor, "create")) throw new Forbidden("Your role cannot build dashboards, so neither can a key of yours.");
  if (scopes.includes("view-links:write") && !can(actor, "share")) throw new Forbidden("Your role cannot share, so neither can a key of yours.");
  const latest = new Date(Date.now() + 365 * DAY).toISOString().slice(0, 10);
  const expires = String(expiresOn ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || expires <= today() || expires > latest) throw new Error("Pick an end date within a year.");
  return { scopes, expires };
}

/** Creates a key for the actor (a signed-in person, never another key), working through the end of a day (UTC)
 * within a year. Returns the secret, which is shown this once. */
export async function createAccessKey(actor: Actor, input: { name: string; scopes: Scope[]; expiresOn: string }): Promise<{ id: number; secret: string }> {
  const { scopes, expires } = checkKeyRequest(actor, input.scopes, input.expiresOn);
  const name = String(input.name ?? "").trim().slice(0, 80) || "Unnamed key";
  const key = await insertKey({ workspace_id: actor.workspaceId, created_by: actor.personId, name, scopes, expires_on: expires });
  // The name, scopes and end only: never the secret, its hash or its prefix.
  await audit(actor, { kind: "access_key.created", object: { type: "access_key", id: key.id, name }, details: { scopes, expires_on: key.expires_on } });
  return { id: key.id, secret: key.secret };
}


/** The keys the actor may see: their own, or every key of the workspace for Owners and Admins (who see a key and its
 * Access Log, but only Owners may revoke another person's key). */
export async function listAccessKeys(actor: Actor): Promise<AccessKeyInfo[]> {
  if (actor.key) throw new Forbidden();
  // A Feed's keys are the Feed's, listed with it (feeds.ts), not as anyone's own.
  let q = db().from("access_keys").select("id, name, prefix, scopes, expires_on, revoked_at, last_used_at, created_by, kind, created_at").eq("workspace_id", actor.workspaceId).is("feed_id", null).order("id", { ascending: false });
  if (actor.role !== "owner" && actor.role !== "admin") q = q.eq("created_by", actor.personId);
  const { data } = await q;
  return (data ?? []).map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, expires_on: k.expires_on, revoked: Boolean(k.revoked_at), last_used_at: k.last_used_at, created_by: k.created_by, kind: k.kind, created_at: k.created_at }));
}

/** Revokes a key: its creator may, and the workspace's Owners may revoke any. A connected assistant's key is
 * disconnected the same way (spec 0023): its tokens are forgotten too, and the Audit Log says it was disconnected. */
export async function revokeAccessKey(actor: Actor, id: number) {
  if (actor.key) throw new Forbidden("A key cannot revoke keys.");
  let q = db().from("access_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", actor.workspaceId).is("revoked_at", null).is("feed_id", null);
  if (actor.role !== "owner") q = q.eq("created_by", actor.personId);
  const { data } = await q.select("id, name, created_by, kind");
  if (!data?.length) throw new Forbidden();
  const assistant = data[0].kind === "assistant";
  if (assistant) await db().from("assistant_tokens").delete().eq("access_key_id", data[0].id);
  await audit(actor, { kind: assistant ? "assistant.disconnected" : "access_key.revoked", object: { type: "access_key", id: data[0].id, name: data[0].name }, details: { created_by: data[0].created_by } });
}

/** The Actor a presented secret acts as, or null when it is unknown, wrong, revoked, ended, or its creator has left.
 * A Feed Key gives null here: it acts for no person (see actorForSecret). */
export async function actorForKey(secret: string): Promise<KeyActor | null> {
  const a = await actorForSecret(secret);
  return a && !("feed" in a) ? a : null;
}

/** The Actor a presented secret acts as: a person's key acts for its creator while they are a member; a Feed Key
 * acts for its Feed while the Feed exists, whoever made the key (a Feed outlives its creator, spec 0012). Null when
 * the secret is unknown, wrong, revoked or ended, or in the demo. */
export async function actorForSecret(secret: string): Promise<KeyActor | FeedActor | null> {
  const m = /^zk_([0-9a-f]{12})_[A-Za-z0-9_-]{43}$/.exec(String(secret ?? ""));
  if (!m) return null;
  const { data: k } = await db().from("access_keys").select(KEY_ROW).eq("prefix", m[1]).maybeSingle();
  if (!k) return null;
  const given = Buffer.from(hash(secret), "hex");
  const stored = Buffer.from(k.secret_hash, "hex");
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return null;
  // An assistant's key has no secret anyone was shown; it works only with its OAuth tokens (assistant-connections.ts).
  if (k.kind !== "program") return null;
  return actorOfKey(k);
}

/** What actorOfKey needs of a key's row. */
export const KEY_ROW = "id, workspace_id, created_by, secret_hash, scopes, expires_on, revoked_at, feed_id, kind";

/** The Actor a found key acts as, or null: the rules every key follows, whatever credential presented it (a secret,
 * or an assistant's token, spec 0023). Records that it was used. */
export async function actorOfKey(k: { id: number; workspace_id: string; created_by: string; scopes: string[]; expires_on: string; revoked_at: string | null; feed_id: string | null }): Promise<KeyActor | FeedActor | null> {
  if (k.revoked_at || k.expires_on < today()) return null;
  // The demo has no Access Keys (its made-up people are anyone's); one that got there anyway does nothing.
  if (k.workspace_id === DEMO_WORKSPACE_ID) return null;
  // A trial that has ended takes nothing more, also before its keys are revoked by the cleanup (spec 0021).
  if (await trialEnded(k.workspace_id)) return null;
  if (k.feed_id) {
    const { data: feed } = await db().from("feeds").select("person_id").eq("person_id", k.feed_id).eq("workspace_id", k.workspace_id).is("deleted_at", null).maybeSingle();
    // Exactly the one scope, whatever the row says: a Feed Key never reads.
    if (!feed || k.scopes.length !== 1 || k.scopes[0] !== FEED_SCOPE) return null;
    await db().from("access_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id);
    return { feedId: feed.person_id, workspaceId: k.workspace_id, feed: true, key: { id: String(k.id), scopes: [FEED_SCOPE] } };
  }
  const { data: membership } = await db().from("memberships").select("role").eq("workspace_id", k.workspace_id).eq("user_id", k.created_by).maybeSingle();
  if (!membership) return null;
  await db().from("access_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id);
  return { personId: k.created_by, workspaceId: k.workspace_id, role: membership.role as WorkspaceRoleName, key: { id: String(k.id), scopes: k.scopes } };
}

/** The names of the Access Keys that submitted values to a Metric, by key id, for someone who sees the Metric: its
 * history names the program a value came from (spec 0002). Only the name: nothing else of a key leaves here. */
export async function submittingKeyNames(actor: Actor, metricId: number): Promise<Record<number, string>> {
  await assertSeesMetrics(actor, [metricId]);
  const { data: obs } = await db().from("observations").select("access_key_id").eq("workspace_id", actor.workspaceId).eq("metric_id", metricId).not("access_key_id", "is", null);
  const ids = [...new Set((obs ?? []).map((o) => Number(o.access_key_id)))];
  if (!ids.length) return {};
  const { data } = await db().from("access_keys").select("id, name").eq("workspace_id", actor.workspaceId).in("id", ids);
  return Object.fromEntries((data ?? []).map((k) => [k.id, k.name]));
}
