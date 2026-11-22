// Assistants connected by OAuth 2.1 (spec 0023, ADR 0011, GLOSSARY: Access Key, MCP Server): Ziffr as its own
// authorization server for the remote MCP Server. An assistant registers (RFC 7591), a signed-in person approves it
// on the consent screen, which makes an Access Key of the kind `assistant` and a one-time code, and the assistant
// trades the code for an access token (an hour) and a refresh token (until the key ends) with PKCE S256. Every rule
// that limits an Access Key holds for the connection because it is one: actorOfKey decides for both.
//
// Everything here comes from programs on the internet: each field is checked for type, size and shape, codes and
// tokens are 256 random bits stored only as SHA-256 hashes, redirect addresses match exactly (loopback ports aside,
// RFC 8252), a code works once for ten minutes, and a refresh token or code presented twice ends the connection.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { ASSISTANT_SCOPES, Forbidden, KEY_ONLY_SCOPES, type Actor, type KeyActor, type Scope } from "./actor";
import { actorOfKey, checkKeyRequest, hash, KEY_ROW, revokeAccessKey } from "./access-keys";
import { DEMO_WORKSPACE_ID } from "./team";
import { audit } from "./audit-log";
import { trialLimitMessage } from "./trials";
import { syncTrialLimits } from "./trial-limits-in-effect";

/** How long an access token works, in seconds. */
export const ACCESS_TOKEN_SECONDS = 3600;
/** How long a used refresh token is remembered, in days, so that presenting it again ends the connection. */
export const REUSE_WINDOW_DAYS = 7;
/** The end date a connection gets unless the person picks another, in days. */
export const DEFAULT_CONNECTION_DAYS = 90;
/** Registrations per network address in an hour, and for the Installation as a whole. */
export const REGISTRATIONS_PER_NETWORK = 10;
export /**
 *
 */
const REGISTRATIONS_PER_HOUR = 300;
/** Consent screens per network address in an hour, and for the Installation as a whole. */
export const AUTHORIZATIONS_PER_NETWORK = 60;
export /**
 *
 */
const AUTHORIZATIONS_PER_HOUR = 2000;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A refusal in OAuth's words (RFC 6749, 5.2; RFC 7591, 3.2.2): `error` is the code a client acts on. */
export class OAuthError extends Error {
  constructor(readonly error: string, message: string, readonly status = 400) { super(message); }
}

/** The address of this Installation (ZIFFR_SITE_URL), which is the issuer. */
export const issuer = () => String(process.env.ZIFFR_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
/** The remote MCP Server's address, the only resource its tokens are for (RFC 8707). */
export const mcpResource = () => `${issuer()}/mcp`;

const secret = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;
const text = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
const networkKey = (network: string | null) => (network ? createHash("sha256").update(`ziffr-oauth:${network.trim().toLowerCase().slice(0, 64)}`).digest("hex") : null);

/** Why a redirect address cannot be registered, or null: https, or http on the person's own computer; no fragment,
 * no user or password, at most 500 characters. */
export function redirectUriProblem(uri: unknown): string | null {
  if (typeof uri !== "string" || !uri || uri.length > 500) return "A redirect address has at most 500 characters.";
  let url: URL;
  try { url = new URL(uri); } catch { return "A redirect address must be a full address."; }
  if (uri.includes("#") || url.username || url.password) return "A redirect address has no fragment and no user or password.";
  if (url.protocol === "https:" && url.hostname) return null;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return null;
  return "A redirect address must use https, or http on localhost.";
}

/** Whether an address given in a request is one the client registered: exactly, or for http on the person's own
 * computer, the same but for the port, which such programs pick when they start (RFC 8252, 7.3). */
export function redirectMatches(registered: string, given: string): boolean {
  if (registered === given) return true;
  try {
    const a = new URL(registered), b = new URL(given);
    return a.protocol === "http:" && b.protocol === "http:" && LOOPBACK.has(a.hostname) && a.hostname === b.hostname
      && a.pathname === b.pathname && a.search === b.search && !given.includes("#") && !b.username && !b.password;
  } catch {
    return false;
  }
}

/** The scopes a space-separated `scope` asks for that Ziffr knows; others (such as offline_access) are ignored. */
export function requestedScopes(scope: unknown): Scope[] {
  const words = typeof scope === "string" && scope.length <= 1000 ? scope.split(/\s+/) : [];
  // Never "values:approve": approving is a person's check, not an assistant's (ticket #427).
  return ASSISTANT_SCOPES.filter((s) => words.includes(s));
}

/** Whether a `resource` names this Installation's /mcp (RFC 8707): absent, or the same address, letter case of
 * scheme and host and a trailing slash aside. */
export function resourceMatches(resource: unknown): boolean {
  if (resource === undefined || resource === null || resource === "") return true;
  if (typeof resource !== "string" || resource.length > 500) return false;
  try {
    const a = new URL(resource), b = new URL(mcpResource());
    return !resource.includes("#") && a.origin === b.origin && a.pathname.replace(/\/+$/, "") === b.pathname && !a.search;
  } catch {
    return false;
  }
}

/** Counts a registration or a consent screen against the limits for its network address and the Installation;
 * false when over. Then tidies registrations nobody used, which may fail without stopping anything. */
export async function claimOAuthRequest(kind: "register" | "authorize", network: string | null): Promise<boolean> {
  const [perNetwork, total] = kind === "register" ? [REGISTRATIONS_PER_NETWORK, REGISTRATIONS_PER_HOUR] : [AUTHORIZATIONS_PER_NETWORK, AUTHORIZATIONS_PER_HOUR];
  const { data, error } = await db().rpc("claim_oauth_request", { p_kind: kind, p_network_key: networkKey(network), p_per_network: perNetwork, p_total: total });
  // A database that does not answer admits nothing: failing open would turn the limit off when it is needed.
  if (error) throw new OAuthError("temporarily_unavailable", "Try again in a minute.", 503);
  if (kind === "register") await db().rpc("forget_unused_oauth_clients").then(() => {}, () => {});
  return data === true;
}

/** A registered client as the consent screen and the registration answer show it. */
export type OAuthClient = { id: string; name: string; redirectUris: string[] };

/** Registers a client (RFC 7591) from its untrusted metadata. Public clients only: whatever authentication method
 * it asks for, it gets `none` and no secret, and must prove itself with PKCE. Limited per network address. */
export async function registerClient(meta: unknown, network: string | null): Promise<OAuthClient & { issuedAt: number }> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new OAuthError("invalid_client_metadata", "Send the client's metadata as a JSON object.");
  const m = meta as Record<string, unknown>;
  const uris = m.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 5) throw new OAuthError("invalid_redirect_uri", "Send one to five redirect_uris.");
  for (const u of uris) {
    const problem = redirectUriProblem(u);
    if (problem) throw new OAuthError("invalid_redirect_uri", problem);
  }
  if (m.grant_types !== undefined && (!Array.isArray(m.grant_types) || !m.grant_types.includes("authorization_code") || !m.grant_types.every((g) => g === "authorization_code" || g === "refresh_token"))) throw new OAuthError("invalid_client_metadata", "Only the grant types authorization_code and refresh_token are offered.");
  if (m.response_types !== undefined && (!Array.isArray(m.response_types) || !m.response_types.every((t) => t === "code"))) throw new OAuthError("invalid_client_metadata", "Only the response type code is offered.");
  // Shown on the consent screen as what the program says it is: printable characters only, one line.
  const raw = text(m.client_name, 1000) ?? "";
   
  const name = raw.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim().slice(0, 100) || "An unnamed assistant";
  if (!(await claimOAuthRequest("register", network))) throw new OAuthError("slow_down", "Too many registrations from here; try again in an hour.", 429);
  const id = `zc_${randomBytes(16).toString("base64url")}`;
  const redirectUris = [...new Set(uris as string[])];
  const { data, error } = await db().from("oauth_clients").insert({ id, name, redirect_uris: redirectUris }).select("created_at").single();
  if (error || !data) throw new OAuthError("server_error", "The client could not be registered.", 500);
  return { id, name, redirectUris, issuedAt: Math.floor(new Date(data.created_at).getTime() / 1000) };
}

/** An authorization request (RFC 6749, 4.1.1) after checking: what the consent screen shows and approves. */
export type AuthorizationRequest = {
  client: OAuthClient; redirectUri: string; state: string | null; codeChallenge: string; scopes: Scope[]; resource: string | null;
};

/** Checks an authorization request's parameters. A wrong client or redirect address is never redirected to
 * (`redirect: false`): only a request from a known client to its own address may be sent back with an error. */
export async function checkAuthorizationRequest(params: Record<string, unknown>): Promise<AuthorizationRequest> {
  const clientId = text(params.client_id, 40);
  const fail = (error: string, message: string, redirect: boolean) => Object.assign(new OAuthError(error, message), { redirect });
  if (!clientId || !/^zc_[A-Za-z0-9_-]{22}$/.test(clientId)) throw fail("invalid_client", "This assistant is not registered with Ziffr. Connect it again from the start.", false);
  const { data: c } = await db().from("oauth_clients").select("id, name, redirect_uris").eq("id", clientId).maybeSingle();
  if (!c) throw fail("invalid_client", "This assistant is not registered with Ziffr. Connect it again from the start.", false);
  const redirectUri = text(params.redirect_uri, 500);
  if (!redirectUri || !(c.redirect_uris as string[]).some((r) => redirectMatches(r, redirectUri))) throw fail("invalid_request", "The address to return to is not one this assistant registered.", false);
  const state = params.state === undefined ? null : text(params.state, 500);
  if (params.state !== undefined && state === null) throw fail("invalid_request", "The state is too long.", false);
  if (params.response_type !== "code") throw fail("unsupported_response_type", "Only response_type=code is offered.", true);
  if (params.code_challenge_method !== "S256") throw fail("invalid_request", "PKCE with code_challenge_method=S256 is required.", true);
  const codeChallenge = text(params.code_challenge, 43);
  if (!codeChallenge || !TOKEN.test(codeChallenge)) throw fail("invalid_request", "The code_challenge must be a base64url SHA-256 (43 characters).", true);
  if (!resourceMatches(params.resource)) throw fail("invalid_target", "Tokens from Ziffr are only for its own /mcp.", true);
  return {
    client: { id: c.id, name: c.name, redirectUris: c.redirect_uris }, redirectUri, state, codeChallenge,
    scopes: requestedScopes(params.scope), resource: params.resource ? mcpResource() : null,
  };
}

/** Where to send the browser back: the request's redirect address with these parameters and the issuer (RFC 9207). */
export function redirectBack(req: Pick<AuthorizationRequest, "redirectUri" | "state">, values: Record<string, string>): string {
  const url = new URL(req.redirectUri);
  for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v);
  if (req.state !== null) url.searchParams.set("state", req.state);
  url.searchParams.set("iss", issuer());
  return url.toString();
}

/** The person approves the connection on the consent screen: an Access Key of the kind `assistant` in their
 * workspace, with scopes and an end date no wider than a key they could make, and a code for the assistant. The
 * request is checked again from its parameters, never taken from the page. Answers where to send the browser. */
export async function approveConnection(actor: Actor, params: Record<string, unknown>, choice: { scopes: unknown; endsOn: unknown }): Promise<{ redirect: string; keyId: number }> {
  if (actor.key) throw new Forbidden("A key cannot connect assistants.");
  const req = await checkAuthorizationRequest(params);
  const { scopes, expires } = checkKeyRequest(actor, choice.scopes, choice.endsOn, { assistant: true });
  const code = secret("");
  await syncTrialLimits();
  const { data: keyId, error } = await db().rpc("make_assistant_connection", {
    p_workspace: actor.workspaceId, p_person: actor.personId, p_client: req.client.id, p_name: req.client.name.slice(0, 80),
    // The key's own secret is never shown to anyone: an assistant's key works only with its tokens.
    p_prefix: randomBytes(6).toString("hex"), p_secret_hash: hash(secret("unused_")), p_scopes: scopes, p_expires_on: expires,
    p_code_hash: hash(code), p_redirect_uri: req.redirectUri, p_code_challenge: req.codeChallenge, p_resource: req.resource,
  });
  if (error || typeof keyId !== "number") {
    const limit = trialLimitMessage(error?.code);
    throw new Error(limit ?? "The assistant could not be connected. Try again.");
  }
  // Which assistant (as it named itself) and where it was sent back, never the code.
  await audit(actor, { kind: "assistant.connected", object: { type: "access_key", id: keyId, name: req.client.name.slice(0, 80) }, details: { scopes, expires_on: expires, redirect_host: new URL(req.redirectUri).host } });
  return { redirect: redirectBack(req, { code }), keyId };
}

/** The person declines: the assistant is told so, nothing is stored. */
export async function denyConnection(params: Record<string, unknown>): Promise<string> {
  return redirectBack(await checkAuthorizationRequest(params), { error: "access_denied" });
}

/** What the token endpoint answers (RFC 6749, 5.1). */
export type TokenAnswer = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string };

type KeyRow = { id: number; workspace_id: string; created_by: string; scopes: string[]; expires_on: string; revoked_at: string | null; feed_id: string | null; kind: string; oauth_client_id?: string | null };
const grant = (message: string) => new OAuthError("invalid_grant", message);

/** Ends a connection at once: its key is revoked and its tokens forgotten. For a code or refresh token presented
 * twice, which means someone else may hold it. */
async function endConnection(keyId: number): Promise<void> {
  await db().from("access_keys").update({ revoked_at: new Date().toISOString() }).eq("id", keyId).eq("kind", "assistant").is("revoked_at", null);
  await db().from("assistant_tokens").delete().eq("access_key_id", keyId);
}

async function connectionKey(id: number): Promise<KeyRow | null> {
  const { data } = await db().from("access_keys").select(`${KEY_ROW}, oauth_client_id`).eq("id", id).eq("kind", "assistant").maybeSingle();
  return data as KeyRow | null;
}

/** A new access and refresh token for a connection that still works. */
async function issueTokens(key: KeyRow): Promise<TokenAnswer> {
  const access = secret("zat_"), refresh = secret("zrt_");
  const now = Date.now();
  // Tidy the connection's own past: access tokens that expired, and used refresh tokens older than a week. A used one
  // is kept that long so a replay still ends the connection; an assistant refreshes hourly, so a week covers it.
  await db().from("assistant_tokens").delete().eq("access_key_id", key.id).eq("kind", "access").lt("expires_at", new Date(now).toISOString());
  await db().from("assistant_tokens").delete().eq("access_key_id", key.id).eq("kind", "refresh").lt("used_at", new Date(now - REUSE_WINDOW_DAYS * 86_400_000).toISOString());
  const { error } = await db().from("assistant_tokens").insert([
    { token_hash: hash(access), access_key_id: key.id, kind: "access", expires_at: new Date(now + ACCESS_TOKEN_SECONDS * 1000).toISOString() },
    { token_hash: hash(refresh), access_key_id: key.id, kind: "refresh", expires_at: `${key.expires_on}T23:59:59.999Z` },
  ]);
  if (error) throw new OAuthError("server_error", "No token could be made.", 500);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refresh, scope: key.scopes.join(" ") };
}

/** The token endpoint (RFC 6749, 3.2) for public clients: the authorization code with its PKCE verifier, or a
 * refresh token, which rotates. Refusals are `invalid_grant` whatever the reason, so nothing is told about a code
 * or token that is not the caller's. */
export async function tokenRequest(form: Record<string, unknown>): Promise<TokenAnswer> {
  const clientId = text(form.client_id, 40);
  if (!clientId) throw new OAuthError("invalid_client", "Send the client_id.", 401);
  if (!resourceMatches(form.resource)) throw new OAuthError("invalid_target", "Tokens from Ziffr are only for its own /mcp.");
  if (form.grant_type === "authorization_code") return exchangeCode(clientId, form);
  if (form.grant_type === "refresh_token") return refreshTokens(clientId, form);
  throw new OAuthError("unsupported_grant_type", "Only authorization_code and refresh_token are offered.");
}

async function exchangeCode(clientId: string, form: Record<string, unknown>): Promise<TokenAnswer> {
  const code = text(form.code, 43), verifier = text(form.code_verifier, 128), redirectUri = text(form.redirect_uri, 500);
  if (!code || !TOKEN.test(code)) throw grant("The code is not valid.");
  if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new OAuthError("invalid_request", "Send the PKCE code_verifier (43 to 128 characters).");
  const codeHash = hash(code);
  const { data: row } = await db().from("oauth_codes").select("client_id, access_key_id, redirect_uri, code_challenge, resource, expires_at, used_at").eq("code_hash", codeHash).maybeSingle();
  if (!row) throw grant("The code is not valid.");
  // A code is good once (OAuth 2.1, 4.1.3): presented again, the connection it made ends, whoever presents it.
  if (row.used_at) { await endConnection(row.access_key_id); throw grant("The code was used already."); }
  if (row.client_id !== clientId || redirectUri !== row.redirect_uri) throw grant("The code is not valid.");
  if (new Date(row.expires_at).getTime() < Date.now()) throw grant("The code has expired.");
  const challenge = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const stored = Buffer.from(row.code_challenge);
  if (challenge.length !== stored.length || !timingSafeEqual(challenge, stored)) throw grant("The code_verifier does not match.");
  // Claimed in one statement: of two exchanges at the same moment, one gets it and the other ends the connection.
  const { data: claimed } = await db().from("oauth_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", codeHash).is("used_at", null).select("code_hash");
  if (!claimed?.length) { await endConnection(row.access_key_id); throw grant("The code was used already."); }
  const key = await connectionKey(row.access_key_id);
  if (!key || !(await actorOfKey(key))) throw grant("This connection has ended.");
  return issueTokens(key);
}

async function refreshTokens(clientId: string, form: Record<string, unknown>): Promise<TokenAnswer> {
  const token = text(form.refresh_token, 47);
  if (!token || !/^zrt_[A-Za-z0-9_-]{43}$/.test(token)) throw grant("The refresh token is not valid.");
  const tokenHash = hash(token);
  const { data: row } = await db().from("assistant_tokens").select("access_key_id, expires_at, used_at").eq("token_hash", tokenHash).eq("kind", "refresh").maybeSingle();
  if (!row) throw grant("The refresh token is not valid.");
  const key = await connectionKey(row.access_key_id);
  if (!key || key.oauth_client_id !== clientId) throw grant("The refresh token is not valid.");
  // Refresh tokens rotate (OAuth 2.1, 4.3.1): one used before is stolen or replayed, so the connection ends.
  if (row.used_at) { await endConnection(key.id); throw grant("The refresh token was used already; the connection has ended."); }
  const { data: claimed } = await db().from("assistant_tokens").update({ used_at: new Date().toISOString() }).eq("token_hash", tokenHash).is("used_at", null).select("token_hash");
  if (!claimed?.length) { await endConnection(key.id); throw grant("The refresh token was used already; the connection has ended."); }
  if (new Date(row.expires_at).getTime() < Date.now() || !(await actorOfKey(key))) throw grant("This connection has ended.");
  return issueTokens(key);
}

/** Revocation (RFC 7009): either token ends the whole connection. Always succeeds, so it tells nothing about a
 * token; one presented with another client's id is left alone. */
export async function revokeToken(form: Record<string, unknown>): Promise<void> {
  const token = text(form.token, 47);
  if (!token || !/^z(at|rt)_[A-Za-z0-9_-]{43}$/.test(token)) return;
  const { data: row } = await db().from("assistant_tokens").select("access_key_id").eq("token_hash", hash(token)).maybeSingle();
  if (!row) return;
  const key = await connectionKey(row.access_key_id);
  if (!key || (form.client_id !== undefined && form.client_id !== key.oauth_client_id)) return;
  await endConnection(key.id);
}

/** A connection as its person sees it under Connected assistants. */
export type MyConnection = { id: number; name: string; workspaceId: string; workspaceName: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; expiresOn: string };

/** The assistants the person connected that still work, in every Workspace they still belong to (never the demo).
 * Only their own: an Owner sees the Workspace's connections on its Access Keys page instead. */
export async function listMyConnections(actor: Actor): Promise<MyConnection[]> {
  if (actor.key) throw new Forbidden();
  const today = new Date().toISOString().slice(0, 10);
  const { data: memberships } = await db().from("memberships").select("workspace_id, workspaces(name)").eq("user_id", actor.personId).neq("workspace_id", DEMO_WORKSPACE_ID);
  const names = new Map((memberships ?? []).map((m) => [m.workspace_id as string, (m.workspaces as unknown as { name: string } | null)?.name ?? ""]));
  if (!names.size) return [];
  const { data } = await db().from("access_keys").select("id, name, workspace_id, scopes, created_at, last_used_at, expires_on")
    .eq("created_by", actor.personId).eq("kind", "assistant").is("revoked_at", null).gte("expires_on", today).in("workspace_id", [...names.keys()]).order("id", { ascending: false });
  return (data ?? []).map((k) => ({ id: k.id, name: k.name, workspaceId: k.workspace_id, workspaceName: names.get(k.workspace_id) ?? "", scopes: k.scopes, createdAt: k.created_at, lastUsedAt: k.last_used_at, expiresOn: k.expires_on }));
}

/** Disconnects one of the person's own assistants, in whichever of their Workspaces it is: revoked as its key, its
 * tokens forgotten, audited there. Anything else (another person's, a program's key, unknown) is refused alike. */
export async function disconnectMine(actor: Actor, keyId: number): Promise<void> {
  if (actor.key) throw new Forbidden();
  const { data: key } = await db().from("access_keys").select("workspace_id").eq("id", Number(keyId)).eq("created_by", actor.personId).eq("kind", "assistant").maybeSingle();
  if (!key) throw new Forbidden();
  const { data: m } = await db().from("memberships").select("role").eq("workspace_id", key.workspace_id).eq("user_id", actor.personId).maybeSingle();
  if (!m) throw new Forbidden();
  await revokeAccessKey({ personId: actor.personId, workspaceId: key.workspace_id, role: m.role as Actor["role"] }, Number(keyId));
}

/** The Actor an assistant's access token acts as, or null when it is unknown, expired, or its connection no longer
 * works by the rules of every Access Key (revoked, ended, the person left, the demo, a trial that ended). */
export async function actorForAssistantToken(token: string): Promise<KeyActor | null> {
  if (!/^zat_[A-Za-z0-9_-]{43}$/.test(String(token ?? ""))) return null;
  const { data: row } = await db().from("assistant_tokens").select("access_key_id, expires_at").eq("token_hash", hash(token)).eq("kind", "access").maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
  const key = await connectionKey(row.access_key_id);
  const actor = key ? await actorOfKey(key) : null;
  if (!actor || "feed" in actor) return null;
  // Whatever the key row holds, an assistant never acts with the scopes only a program's key may hold (#427, #434).
  return { ...actor, key: { ...actor.key, scopes: actor.key.scopes.filter((s) => !KEY_ONLY_SCOPES.includes(s as Scope)) } };
}
