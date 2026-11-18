// Assistants connected by OAuth (spec 0023, ticket #140), end to end against the database: registration, the
// consent, the code traded once with the right PKCE verifier, refresh tokens that rotate, revocation, and every
// refusal the spec names. A connection is an Access Key, so the rules of keys are proven to hold for it unchanged.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { actorForSecret, revokeAccessKey } from "./access-keys";
import {
  actorForAssistantToken, approveConnection, checkAuthorizationRequest, mcpResource, OAuthError, registerClient,
  REGISTRATIONS_PER_NETWORK, revokeToken, tokenRequest, type TokenAnswer,
} from "./assistant-connections";
import { removeMember } from "./handover";
import { admitCall } from "./access-log";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const somewhere = () => `198.51.${randomInt(0, 255)}.${randomInt(1, 254)}`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

/** A PKCE pair as a client makes one. */
function pkce() {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function refused(p: Promise<unknown>, error: string) {
  const e = await p.then(() => null, (x) => x);
  expect(e, `expected ${error}`).toBeInstanceOf(OAuthError);
  expect((e as OAuthError).error).toBe(error);
  return e as OAuthError & { redirect?: boolean };
}

async function setup(role: "owner" | "member" | "guest" = "member") {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const ben = role === "owner" ? sara : await w.person(role);
  const client = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT, "http://localhost:33418/callback"] }, somewhere());
  const { verifier, challenge } = pkce();
  const params = { response_type: "code", client_id: client.id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "s-1", scope: "metrics:read values:submit offline_access", resource: mcpResource() };
  return { w, sara, ben, client, verifier, params, actor: w.actor(ben, role) };
}

/** Approves on the consent screen and returns the code from the redirect. */
async function consent(s: Awaited<ReturnType<typeof setup>>, scopes = ["metrics:read"], params: Record<string, string> = s.params) {
  const { redirect, keyId } = await approveConnection(s.actor, params, { scopes, endsOn: inDays(90) });
  const url = new URL(redirect);
  return { code: url.searchParams.get("code")!, url, keyId };
}

const exchange = (s: Awaited<ReturnType<typeof setup>>, code: string, over: Record<string, string> = {}) =>
  tokenRequest({ grant_type: "authorization_code", code, code_verifier: s.verifier, client_id: s.client.id, redirect_uri: REDIRECT, resource: mcpResource(), ...over });
const refresh = (s: Awaited<ReturnType<typeof setup>>, t: TokenAnswer) => tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: s.client.id });

describe("registration", () => {
  it("registers a public client with its name as untrusted text and its addresses as given", async () => {
    const c = await registerClient({ client_name: "  Claude\u0000‮ evil\n ", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" }, somewhere());
    expect(c.id).toMatch(/^zc_[A-Za-z0-9_-]{22}$/);
    expect(c.name).toBe("Claude evil");
    expect(c.redirectUris).toEqual([REDIRECT]);
    expect((await registerClient({ redirect_uris: [REDIRECT] }, null)).name).toBe("An unnamed assistant");
  });
  it("refuses addresses that are not https or this computer, and odd metadata", async () => {
    for (const uris of [[], ["http://example.com/cb"], ["javascript:alert(1)"], ["https://a.example/cb#x"], ["https://user:pw@a.example/cb"], ["cursor://cb"], ["x".repeat(501)], Array(6).fill(REDIRECT), "https://a.example"]) {
      await refused(registerClient({ client_name: "X", redirect_uris: uris }, somewhere()), "invalid_redirect_uri");
    }
    await refused(registerClient({ redirect_uris: [REDIRECT], grant_types: ["client_credentials"] }, somewhere()), "invalid_client_metadata");
    await refused(registerClient({ redirect_uris: [REDIRECT], response_types: ["token"] }, somewhere()), "invalid_client_metadata");
    await refused(registerClient([REDIRECT], somewhere()), "invalid_client_metadata");
    expect((await registerClient({ redirect_uris: ["http://127.0.0.1:9/cb", "http://[::1]/cb"] }, somewhere())).redirectUris).toHaveLength(2);
  });
  it("limits registrations per network address", async () => {
    const here = somewhere();
    for (let i = 0; i < REGISTRATIONS_PER_NETWORK; i++) await registerClient({ redirect_uris: [REDIRECT] }, here);
    const e = await refused(registerClient({ redirect_uris: [REDIRECT] }, here), "slow_down");
    expect(e.status).toBe(429);
    await registerClient({ redirect_uris: [REDIRECT] }, somewhere());
  });
  it("forgets registrations never used, but never one a connection refers to", async () => {
    const s = await setup();
    const { code } = await consent(s);
    const tokens = await exchange(s, code);
    const unused = await registerClient({ redirect_uris: [REDIRECT] }, somewhere());
    // Both look a day old and unused: only the one no key refers to may go, and tidying must not fail registration.
    const old = new Date(Date.now() - 2 * 86400000).toISOString();
    await db().from("oauth_clients").update({ created_at: old, used_at: null }).in("id", [s.client.id, unused.id]);
    await registerClient({ redirect_uris: [REDIRECT] }, somewhere());
    const { data } = await db().from("oauth_clients").select("id").in("id", [s.client.id, unused.id]);
    expect(data?.map((c) => c.id)).toEqual([s.client.id]);
    expect(await actorForAssistantToken(tokens.access_token)).not.toBeNull();
  });
});

describe("the authorization request", () => {
  it("is checked before the consent screen, and a wrong client or address is never sent back to", async () => {
    const s = await setup();
    const req = await checkAuthorizationRequest(s.params);
    expect(req).toMatchObject({ client: { id: s.client.id, name: "Claude" }, redirectUri: REDIRECT, state: "s-1", scopes: ["metrics:read", "values:submit"] });
    expect((await refused(checkAuthorizationRequest({ ...s.params, client_id: "zc_" + "a".repeat(22) }), "invalid_client")).redirect).toBe(false);
    expect((await refused(checkAuthorizationRequest({ ...s.params, redirect_uri: "https://claude.ai/other" }), "invalid_request")).redirect).toBe(false);
    expect((await refused(checkAuthorizationRequest({ ...s.params, redirect_uri: `${REDIRECT}?x=1` }), "invalid_request")).redirect).toBe(false);
    // On the person's own computer the port may differ (RFC 8252), nothing else.
    expect((await checkAuthorizationRequest({ ...s.params, redirect_uri: "http://localhost:51234/callback" })).redirectUri).toBe("http://localhost:51234/callback");
    await refused(checkAuthorizationRequest({ ...s.params, redirect_uri: "http://localhost:51234/other" }), "invalid_request");
    await refused(checkAuthorizationRequest({ ...s.params, redirect_uri: "http://127.0.0.1:51234/callback" }), "invalid_request");
    expect((await refused(checkAuthorizationRequest({ ...s.params, code_challenge_method: "plain" }), "invalid_request")).redirect).toBe(true);
    await refused(checkAuthorizationRequest({ ...s.params, code_challenge_method: undefined }), "invalid_request");
    await refused(checkAuthorizationRequest({ ...s.params, code_challenge: "short" }), "invalid_request");
    await refused(checkAuthorizationRequest({ ...s.params, response_type: "token" }), "unsupported_response_type");
    await refused(checkAuthorizationRequest({ ...s.params, resource: "https://other.example/mcp" }), "invalid_target");
    await refused(checkAuthorizationRequest({ ...s.params, state: "x".repeat(501) }), "invalid_request");
  });
  it("gives no more than a key of the person's could have, and never in the demo", async () => {
    const guest = await setup("guest");
    await expect(approveConnection(guest.actor, guest.params, { scopes: ["metrics:read", "metrics:write"], endsOn: inDays(30) })).rejects.toThrow(/role cannot create/);
    await expect(approveConnection(guest.actor, guest.params, { scopes: ["everything"], endsOn: inDays(30) })).rejects.toThrow(/Pick what/);
    await expect(approveConnection(guest.actor, guest.params, { scopes: ["metrics:read"], endsOn: inDays(400) })).rejects.toThrow(/within a year/);
    await expect(approveConnection({ ...guest.actor, workspaceId: DEMO_WORKSPACE_ID }, guest.params, { scopes: ["metrics:read"], endsOn: inDays(30) })).rejects.toThrow(/demo/);
    await expect(approveConnection({ ...guest.actor, key: { id: "1", scopes: [] } } as never, guest.params, { scopes: ["metrics:read"], endsOn: inDays(30) })).rejects.toThrow();
  });
  it("makes an Access Key of the kind assistant, audited, whose own secret never works", async () => {
    const s = await setup();
    const { url, keyId } = await consent(s, ["metrics:read", "values:submit"]);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get("state")).toBe("s-1");
    expect(url.searchParams.get("iss")).toBe(mcpResource().replace(/\/mcp$/, ""));
    const { data: key } = await db().from("access_keys").select("kind, name, scopes, created_by, workspace_id, oauth_client_id").eq("id", keyId).single();
    expect(key).toEqual({ kind: "assistant", name: "Claude", scopes: ["metrics:read", "values:submit"], created_by: s.ben, workspace_id: s.w.id, oauth_client_id: s.client.id });
    const { data: events } = await db().from("audit_events").select("kind, object_id, details").eq("workspace_id", s.w.id);
    expect(events).toContainEqual({ kind: "assistant.connected", object_id: String(keyId), details: expect.objectContaining({ redirect_host: "claude.ai" }) });
    expect(JSON.stringify(events)).not.toContain(url.searchParams.get("code"));
    const { data: row } = await db().from("access_keys").select("prefix").eq("id", keyId).single();
    expect(await actorForSecret(`zk_${row!.prefix}_${"a".repeat(43)}`)).toBeNull();
  });
});

describe("the token endpoint", () => {
  it("trades the code once, with the right verifier, client and address, for tokens that act as the person", async () => {
    const s = await setup();
    const { code, keyId } = await consent(s, ["metrics:read", "values:submit"]);
    await refused(exchange(s, code, { code_verifier: pkce().verifier }), "invalid_grant");
    await refused(exchange(s, code, { client_id: (await registerClient({ redirect_uris: [REDIRECT] }, somewhere())).id }), "invalid_grant");
    await refused(exchange(s, code, { redirect_uri: "http://localhost:1/callback" }), "invalid_grant");
    await refused(exchange(s, code, { resource: "https://other.example/mcp" }), "invalid_target");
    await refused(exchange(s, "x".repeat(43)), "invalid_grant");
    await refused(exchange(s, code, { code_verifier: "short" }), "invalid_request");
    const t = await exchange(s, code);
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "metrics:read values:submit" });
    expect(t.access_token).toMatch(/^zat_[A-Za-z0-9_-]{43}$/);
    expect(t.refresh_token).toMatch(/^zrt_[A-Za-z0-9_-]{43}$/);
    expect(await actorForAssistantToken(t.access_token)).toEqual({ personId: s.ben, workspaceId: s.w.id, role: "member", key: { id: String(keyId), scopes: ["metrics:read", "values:submit"] } });
    // Only hashes are kept.
    const { data: stored } = await db().from("assistant_tokens").select("token_hash").eq("access_key_id", keyId);
    expect(JSON.stringify(stored)).not.toContain(t.access_token.slice(4));
    expect(await actorForAssistantToken(t.refresh_token)).toBeNull();
    expect(await actorForSecret(t.access_token)).toBeNull();
  });
  it("ends the connection when a code is used twice", async () => {
    const s = await setup();
    const { code } = await consent(s);
    const t = await exchange(s, code);
    await refused(exchange(s, code), "invalid_grant");
    expect(await actorForAssistantToken(t.access_token)).toBeNull();
    await refused(refresh(s, t), "invalid_grant");
  });
  it("refuses an expired code", async () => {
    const s = await setup();
    const { code } = await consent(s);
    await db().from("oauth_codes").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("code_hash", createHash("sha256").update(code).digest("hex"));
    await refused(exchange(s, code), "invalid_grant");
  });
  it("rotates refresh tokens, and a refresh token used twice ends the connection", async () => {
    const s = await setup();
    const first = await exchange(s, (await consent(s)).code);
    const second = await refresh(s, first);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(await actorForAssistantToken(second.access_token)).not.toBeNull();
    // Another client cannot use it, and that does not use it up.
    await refused(tokenRequest({ grant_type: "refresh_token", refresh_token: second.refresh_token, client_id: (await registerClient({ redirect_uris: [REDIRECT] }, somewhere())).id }), "invalid_grant");
    const third = await refresh(s, second);
    // The first one again: someone else has it. Everything of the connection stops.
    await refused(refresh(s, first), "invalid_grant");
    expect(await actorForAssistantToken(third.access_token)).toBeNull();
    await refused(refresh(s, third), "invalid_grant");
    await refused(tokenRequest({ grant_type: "password", client_id: s.client.id }), "unsupported_grant_type");
    await refused(tokenRequest({ grant_type: "refresh_token" }), "invalid_client");
  });
  it("lets an access token expire after an hour", async () => {
    const s = await setup();
    const t = await exchange(s, (await consent(s)).code);
    await db().from("assistant_tokens").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("token_hash", createHash("sha256").update(t.access_token).digest("hex"));
    expect(await actorForAssistantToken(t.access_token)).toBeNull();
    expect(await actorForAssistantToken((await refresh(s, t)).access_token)).not.toBeNull();
  });
});

describe("a connection is an Access Key", () => {
  it("ends with revocation, by either token, and ignores another client's request", async () => {
    const s = await setup();
    const t = await exchange(s, (await consent(s)).code);
    await revokeToken({ token: t.access_token, client_id: "zc_" + "b".repeat(22) });
    expect(await actorForAssistantToken(t.access_token)).not.toBeNull();
    await revokeToken({ token: "nonsense" });
    await revokeToken({ token: t.refresh_token, client_id: s.client.id });
    expect(await actorForAssistantToken(t.access_token)).toBeNull();
    await refused(refresh(s, t), "invalid_grant");
  });
  it("stops when an Owner revokes it or the person leaves, and refreshing does not bring it back", async () => {
    const s = await setup();
    const one = await exchange(s, (await consent(s)).code);
    const { data: key } = await db().from("access_keys").select("id").eq("workspace_id", s.w.id).eq("kind", "assistant").single();
    await revokeAccessKey(s.w.actor(s.sara, "owner"), key!.id);
    expect(await actorForAssistantToken(one.access_token)).toBeNull();
    await refused(refresh(s, one), "invalid_grant");

    const two = await exchange(s, (await consent(s)).code);
    await removeMember(s.w.actor(s.sara, "owner"), s.ben, s.sara);
    expect(await actorForAssistantToken(two.access_token)).toBeNull();
    await refused(refresh(s, two), "invalid_grant");
  });
  it("acts with the person's current role, within the key's own limit", async () => {
    const s = await setup();
    const t = await exchange(s, (await consent(s)).code);
    await s.w.setRole(s.ben, "guest");
    expect((await actorForAssistantToken(t.access_token))?.role).toBe("guest");
    const actor = (await actorForAssistantToken(t.access_token))!;
    expect((await admitCall(actor)).ok).toBe(true);
  });
  it("is at most one working assistant in a Trial Workspace, ending with the trial", async () => {
    const s = await setup("owner");
    const ends = new Date(Date.now() + 5 * 86400000);
    await db().from("workspaces").update({ trial_ends_at: ends.toISOString() }).eq("id", s.w.id);
    const { keyId } = await consent(s);
    const { data } = await db().from("access_keys").select("expires_on").eq("id", keyId).single();
    expect(data!.expires_on).toBe(ends.toISOString().slice(0, 10));
    await expect(consent(s)).rejects.toThrow(/one assistant/);
  });
});
