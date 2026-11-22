// The Ziffr Cloud API and the handover for Owners (spec 0029, ticket #267; ADR 0013; GLOSSARY: Ziffr Cloud, Workspace
// Limit, Size). Hosted Ziffr's billing service sets each Workspace's limit through /api/cloud/v1 and nothing else: it
// reads a Workspace's count of Metrics, limit and trial dates, never a name, Metric, value or person, and it cannot
// make, delete or stop anything but new Metrics. Every call is signed with a key derived from ZIFFR_CLOUD_KEY, which
// lives only in the server's environment. Without it the API answers 404 and the handover buttons do not show.
// Owners reach Ziffr Cloud with a short-lived token signed by a second key derived from the same secret, so a handover
// token can never sign an API call.
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { recordAudit } from "./audit-log";
import { db } from "./db";
import { recordServiceEvent } from "./installation-admins";
import { DEMO_WORKSPACE_ID } from "./team";
import { keepTrial } from "./trials";
import { forgetStoredSettings, settingSources, settingsInEffectStrict } from "./settings-in-effect";
import { TRIAL_LIMITS, trialLimitNumberProblem, trialLimitOf, trialLimitProblem, trialLimitsFrom, type TrialLimitKey } from "./trial-limits";
import { syncTrialLimits } from "./trial-limits-in-effect";
import { LABEL_MAX, LIMIT_MAX, limitLabel, limitOf, metricCount, roomOf, syncDefaultLimit } from "./workspace-limits";

/** The header a call carries: `t=<unix time>, v1=<hex HMAC-SHA256>`. */
export const CLOUD_SIGNATURE_HEADER = "ziffr-cloud-signature";
/** How old a signed call may be, in seconds, either way. */
export const CLOUD_MAX_AGE_SECONDS = 300;
/** Calls the API takes in any minute; Ziffr Cloud needs far fewer. */
export const CLOUD_CALLS_PER_MINUTE = 60;
/** Largest body a call may send. */
export const CLOUD_BODY_MAX = 4096;
/** How long a handover token works, in seconds. */
export const HANDOVER_SECONDS = 300;

type Env = Record<string, string | undefined>;

/** The secret, when it is set and long enough (32 bytes); else null and the API is off. */
function cloudSecret(env: Env): Buffer | null {
  const raw = env.ZIFFR_CLOUD_KEY;
  if (!raw) return null;
  const secret = Buffer.from(raw, "utf8");
  return secret.length >= 32 ? secret : null;
}

/** One of the two keys derived from the secret, each with a label of its own. */
function derived(env: Env, label: "ziffr/cloud-api/v1" | "ziffr/cloud-handover/v1"): Buffer | null {
  const secret = cloudSecret(env);
  return secret ? Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), label, 32)) : null;
}

/** Whether this Installation talks to Ziffr Cloud: the key is set (the API answers) and, for the handover, where to. */
export function cloudEnabled(env: Env = process.env): boolean {
  return cloudSecret(env) !== null;
}

/** Where Owners are handed over to, when the key and an https address (http only for this computer) are set. */
export function cloudUrl(env: Env = process.env): string | null {
  if (!cloudEnabled(env) || !env.ZIFFR_CLOUD_URL) return null;
  try {
    const url = new URL(env.ZIFFR_CLOUD_URL);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || (url.protocol === "http:" && local) ? url.toString().replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

/** The text a call's signature covers: time, method, path with its query, and the SHA-256 of the body. */
const signed = (t: string, method: string, path: string, body: string) =>
  `${t}\n${method.toUpperCase()}\n${path}\n${createHash("sha256").update(body, "utf8").digest("hex")}`;

/** The header value for a call, as Ziffr Cloud computes it (and the tests do). */
export function signCloudCall(input: { method: string; path: string; body?: string; at?: number }, env: Env = process.env): string {
  const key = derived(env, "ziffr/cloud-api/v1");
  if (!key) throw new Error("ZIFFR_CLOUD_KEY is not set.");
  const t = String(Math.floor((input.at ?? Date.now()) / 1000));
  return `t=${t}, v1=${createHmac("sha256", key).update(signed(t, input.method, input.path, input.body ?? "")).digest("hex")}`;
}

/** Ziffr Cloud, proven by a signed call. Only the functions below take it; it is nobody and has no Workspace. */
export type CloudCaller = { cloud: true };

/** What checking a call gives: the caller, or the status to answer with. */
export type CloudCheck = { ok: true; caller: CloudCaller } | { ok: false; status: 401 | 404 | 429 };

/** Checks a call: the key is set (else 404, as if nothing were here), the signature is well formed, at most five
 * minutes old or ahead, matches in constant time, and was not seen before (a replay); at most 60 calls a minute. */
export async function checkCloudCall(input: { header: string | null; method: string; path: string; body: string; now?: number }, env: Env = process.env): Promise<CloudCheck> {
  const key = derived(env, "ziffr/cloud-api/v1");
  if (!key) return { ok: false, status: 404 };
  const m = /^t=(\d{9,11}),\s*v1=([0-9a-f]{64})$/.exec((input.header ?? "").trim());
  if (!m) return { ok: false, status: 401 };
  const [, t, given] = m;
  if (Math.abs((input.now ?? Date.now()) / 1000 - Number(t)) > CLOUD_MAX_AGE_SECONDS) return { ok: false, status: 401 };
  const wanted = createHmac("sha256", key).update(signed(t, input.method, input.path, input.body)).digest();
  const sent = Buffer.from(given, "hex");
  if (sent.length !== wanted.length || !timingSafeEqual(sent, wanted)) return { ok: false, status: 401 };
  const { data, error } = await db().rpc("claim_cloud_call", { p_signature: given, p_limit: CLOUD_CALLS_PER_MINUTE });
  if (error) throw new Error("The call could not be claimed.");
  if (data === "replay") return { ok: false, status: 401 };
  if (data === "limit") return { ok: false, status: 429 };
  return { ok: true, caller: { cloud: true } };
}

/** A Workspace as Ziffr Cloud sees it: whether it exists, how many Metrics it holds (Archived Metrics not counted),
 * its limit, the name to show and the room over it, since when it is over, its trial's end and who set its limit.
 * Nothing else: no name, Metric, value or person (a test lists these keys). */
export type CloudWorkspace = {
  id: string; exists: boolean; metrics: number | null; limit: number | null; label: string | null; room: number | null;
  over_limit_since: string | null; trial_ends_at: string | null; set_by: "installation_admin" | "cloud" | null; next: { label: string; on: string } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Thrown for a Workspace that does not exist (or is the demo): the API answers 404. */
export class CloudNotFound extends Error {}

/** A Workspace's numbers for Ziffr Cloud. A missing one, the demo or an id that is not one says only `exists: false`. */
export async function cloudWorkspace(_caller: CloudCaller, workspaceId: string): Promise<CloudWorkspace> {
  const id = String(workspaceId ?? "").toLowerCase();
  const none: CloudWorkspace = { id, exists: false, metrics: null, limit: null, label: null, room: null, over_limit_since: null, trial_ends_at: null, set_by: null, next: null };
  if (!UUID.test(id) || id === DEMO_WORKSPACE_ID) return none;
  const [{ data: w }, { data: own }] = await Promise.all([
    db().from("workspaces").select("id, over_limit_since, trial_ends_at").eq("id", id).maybeSingle(),
    db().from("workspace_limits").select("set_by, next_label, next_on").eq("workspace_id", id).maybeSingle(),
  ]);
  if (!w) return none;
  const [metrics, limit] = await Promise.all([metricCount(id), limitOf(id)]);
  return {
    id, exists: true, metrics, limit: limit?.metrics ?? null, label: limit?.label ?? null, room: limit ? roomOf(limit.metrics) : null,
    over_limit_since: (w.over_limit_since as string | null) ?? null, trial_ends_at: (w.trial_ends_at as string | null) ?? null,
    set_by: own?.set_by === "cloud" || own?.set_by === "installation_admin" ? own.set_by : null,
    next: own?.next_label && own.next_on ? { label: own.next_label as string, on: own.next_on as string } : null,
  };
}

/** The Workspaces whose limit Ziffr Cloud set, by id, one page after `after`, for reconciling with its payments. */
export async function cloudLimits(caller: CloudCaller, page: { after?: string | null; limit: number }): Promise<{ items: CloudWorkspace[]; next: string | null }> {
  const size = Math.min(Math.max(Math.trunc(page.limit) || 1, 1), 100);
  let q = db().from("workspace_limits").select("workspace_id").eq("set_by", "cloud").order("workspace_id").limit(size + 1);
  if (page.after && UUID.test(page.after)) q = q.gt("workspace_id", page.after);
  const { data, error } = await q;
  if (error) throw new Error("The limits could not be read.");
  const ids = (data ?? []).map((r) => r.workspace_id as string);
  const items = await Promise.all(ids.slice(0, size).map((id) => cloudWorkspace(caller, id)));
  return { items, next: ids.length > size ? ids[size - 1] : null };
}

/** What Ziffr Cloud sets: `metrics` (1 to 1,000,000, or null to fall back to the Installation's default, which also
 * drops its label and coming change), the name to show, an optional coming change, and `endTrial` to turn a Trial
 * Workspace into an ordinary one at once (an Owner booked a Size during the trial). Checked by the route's
 * schema; checked again here. */
export type CloudLimitInput = { metrics: number | null; label?: string | null; next?: { label: string; on: string } | null; endTrial?: boolean };

/** Sets a Workspace's limit as Ziffr Cloud, or gives it back to the default. The last write wins, whether it was Ziffr
 * Cloud's or an Installation Admin's. The Workspace's Audit Log and the Installation's audit record it. Answers the
 * Workspace as it is now. */
export async function setCloudLimit(caller: CloudCaller, workspaceId: string, input: CloudLimitInput): Promise<CloudWorkspace> {
  const before = await cloudWorkspace(caller, workspaceId);
  if (!before.exists) throw new CloudNotFound();
  const metrics = input.metrics;
  if (metrics !== null && (!Number.isInteger(metrics) || metrics < 1 || metrics > LIMIT_MAX)) throw new Error("metrics is a whole number from 1 to 1,000,000, or null.");
  const label = limitLabel(input.label ?? null);
  const next = input.next ? { label: limitLabel(input.next.label), on: input.next.on } : null;
  if (next && (!next.label || !isDay(next.on))) throw new Error(`next is a label of 1 to ${LABEL_MAX} characters and a day.`);
  await syncDefaultLimit();
  const { error } = metrics === null
    ? await db().from("workspace_limits").delete().eq("workspace_id", before.id)
    : await db().from("workspace_limits").upsert({
      workspace_id: before.id, metrics, label, next_label: next?.label ?? null, next_on: next?.on ?? null,
      set_by: "cloud", set_by_person: null, set_at: new Date().toISOString(),
    });
  if (error) throw new Error("The limit could not be saved.");
  await recordAudit(before.id, null, {
    kind: "workspace.limit_changed", object: { type: "workspace", id: before.id },
    details: { from_limit: before.limit, from_label: before.label, to_limit: metrics, to_label: metrics === null ? null : label, by: "cloud", default: metrics === null },
  }, "Ziffr Cloud");
  await recordServiceEvent("Ziffr Cloud", metrics === null ? "workspace_limit.removed" : "workspace_limit.set", before.id);
  // Booking a Size during the trial ends it at once (spec 0029): the Workspace becomes ordinary with this limit.
  if (input.endTrial === true && before.trial_ends_at) await keepTrial(before.id);
  return cloudWorkspace(caller, before.id);
}

/** Where an Owner is handed over to: changing the Size, or billing and invoices. */
export type HandoverPurpose = "size" | "billing";

/** A handover for an Owner: the address to post to and the signed token. Only an Owner of the Workspace, signed in as
 * themselves (never with a key, never in the demo), with a proven email address. The token holds the Workspace's id
 * and name (so the Owner sees which Workspace they book for), the person's id and address, the role, the purpose, a
 * random nonce (Ziffr Cloud takes each once) and an expiry five minutes ahead. */
export async function handover(actor: Actor, purpose: HandoverPurpose, env: Env = process.env): Promise<{ url: string; token: string }> {
  const url = cloudUrl(env);
  const key = derived(env, "ziffr/cloud-handover/v1");
  if (!url || !key) throw new Forbidden();
  if (actor.key || actor.workspaceId === DEMO_WORKSPACE_ID || actor.role !== "owner") throw new Forbidden("Only Owners change the Size.");
  if (purpose !== "size" && purpose !== "billing") throw new Forbidden();
  const [{ data: m }, { data: w }, { data: p }] = await Promise.all([
    db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle(),
    db().from("workspaces").select("id, name").eq("id", actor.workspaceId).maybeSingle(),
    db().from("profiles").select("id, email, auth_user_id").eq("id", actor.personId).maybeSingle(),
  ]);
  // Checked against the database too: the role an Actor carries is the one the session found a moment ago.
  if (m?.role !== "owner" || !w) throw new Forbidden("Only Owners change the Size.");
  // Only an address a way of signing in proved: Ziffr Cloud sends invoices there.
  if (!p?.auth_user_id || !p.email) throw new Forbidden("Sign in with your email address to change the Size.");
  const aud = siteOrigin(env);
  if (!aud) throw new Forbidden("This Installation has no address set (ZIFFR_SITE_URL).");
  const payload = {
    v: 1, purpose, workspace: { id: w.id as string, name: String(w.name).slice(0, 80) }, person: { id: p.id as string, email: String(p.email).toLowerCase() },
    role: "owner", nonce: randomBytes(16).toString("base64url"),
    // Which Installation made it (its address), so a key shared by mistake between two cannot carry a token across.
    aud, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + HANDOVER_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return { url: `${url}/handover`, token: `${body}.${mac}` };
}

/** This Installation's own address, as the handover token names it; null without ZIFFR_SITE_URL. */
function siteOrigin(env: Env): string | null {
  try { return env.ZIFFR_SITE_URL ? new URL(env.ZIFFR_SITE_URL).origin : null; } catch { return null; }
}

/** A day written YYYY-MM-DD that is a real day of a year from 2000 to 2999. */
const isDay = (s: string) => /^[2]\d{3}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Whether an Owner sees Change Size and Billing and invoices: only where Ziffr Cloud is set up. */
export function handoverOffered(actor: Pick<Actor, "role" | "workspaceId">, env: Env = process.env): boolean {
  return cloudUrl(env) !== null && actor.role === "owner" && actor.workspaceId !== DEMO_WORKSPACE_ID;
}

/** The Trial Limits as Ziffr Cloud sees them: each number in effect, where it comes from (Ziffr Cloud, the Installation's
 * page, the server's environment or the default), and `days` as null while trials are off. Numbers only: nothing of a trial. */
export type CloudTrialLimits = { limits: Record<TrialLimitKey, number | null>; sources: Record<TrialLimitKey, "cloud" | "page" | "server" | "default"> };

/** The Trial Limits now, for Ziffr Cloud. */
export async function cloudTrialLimits(caller: CloudCaller): Promise<CloudTrialLimits> {
  if (caller?.cloud !== true) throw new Forbidden();
  const [settings, sources] = await Promise.all([settingsInEffectStrict(), settingSources()]);
  const numbers = trialLimitsFrom(settings);
  const limits = { ...numbers } as Record<TrialLimitKey, number | null>;
  // Without days there are no trials: say so, not the default hosted Ziffr starts with.
  if (!settings.ZIFFR_TRIAL_DAYS?.trim() || trialLimitProblem(trialLimitOf("days"), settings.ZIFFR_TRIAL_DAYS)) limits.days = null;
  return {
    limits,
    sources: Object.fromEntries(TRIAL_LIMITS.map((l) => [l.key, sources[l.name] === "cloud" ? "cloud" : sources[l.name] === "page" ? "page" : sources[l.name] === "server" ? "server" : "default"])) as CloudTrialLimits["sources"],
  };
}

/** Sets the Trial Limits as Ziffr Cloud: exactly the numbers given, each a whole number within its range; any limit left
 * out loses what was set and falls back to its default (the days: no trials). Replaced in one step in the database, so
 * calls at once never mix. The numbers apply to running trials at once (the days to trials made afterwards), and what
 * a trial already holds is never deleted. The server's environment still wins over what is set here. Answers the Trial
 * Limits as GET does. */
export async function setCloudTrialLimits(caller: CloudCaller, input: Partial<Record<TrialLimitKey, number>>): Promise<CloudTrialLimits> {
  if (caller?.cloud !== true) throw new Forbidden();
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("The Trial Limits are an object of numbers.");
  const values: Record<string, string> = {};
  for (const [key, n] of Object.entries(input)) {
    const limit = TRIAL_LIMITS.find((l) => l.key === key);
    if (!limit) throw new Error(`${key} is not a Trial Limit.`);
    const problem = trialLimitNumberProblem(limit, n);
    if (problem) throw new Error(problem);
    values[limit.name] = String(n);
  }
  const { error } = await db().rpc("set_cloud_trial_limits", { p_values: values });
  if (error) throw new Error("The Trial Limits could not be saved.");
  forgetStoredSettings();
  await syncTrialLimits(true);
  await recordServiceEvent("Ziffr Cloud", "trial_limits.set", Object.keys(values).length ? `${Object.keys(values).length} set` : "all removed");
  return cloudTrialLimits(caller);
}
