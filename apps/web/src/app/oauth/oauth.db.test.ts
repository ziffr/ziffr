// The OAuth endpoints over HTTP (spec 0023, ticket #140): an assistant discovers Ziffr from the 401 of /mcp,
// registers, is approved (the consent screen's core call), trades its code for tokens and uses /mcp with them, as
// Claude.ai does. The core's rules are proven in assistant-connections.db.test.ts; this is the HTTP layer.
import { createHash, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { approveConnection } from "@ziffr/core/assistant-connections";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { POST as register } from "./register/route";
import { POST as token } from "./token/route";
import { POST as revoke } from "./revoke/route";
import { GET as resourceMeta } from "../.well-known/oauth-protected-resource/mcp/route";
import { GET as rootResourceMeta } from "../.well-known/oauth-protected-resource/route";
import { GET as serverMeta } from "../.well-known/oauth-authorization-server/route";
import { POST as mcp } from "../mcp/route";
import { GET as metrics } from "../api/v1/metrics/route";

const SITE = "http://localhost:3000";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const before = process.env.ZIFFR_REMOTE_MCP;
beforeAll(() => { process.env.ZIFFR_REMOTE_MCP = "1"; });
afterAll(() => { process.env.ZIFFR_REMOTE_MCP = before; });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const postJson = (body: unknown, headers: Record<string, string> = {}) => register(new Request(`${SITE}/oauth/register`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } }));
const postForm = (handler: (r: Request) => Promise<Response>, path: string, body: string) => handler(new Request(`${SITE}${path}`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }));
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } };
const mcpPost = (auth?: string) => mcp(new Request(`${SITE}/mcp`, { method: "POST", body: JSON.stringify(initialize), headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(auth ? { authorization: `Bearer ${auth}` } : {}) } }));

describe("OAuth for assistants over HTTP", () => {
  it("goes from the 401 to a working connection, as Claude.ai does", async () => {
    // 1. /mcp without a token points to its metadata, which names Ziffr as the authorization server.
    const challenge = (await mcpPost()).headers.get("www-authenticate")!;
    expect(challenge).toBe(`Bearer resource_metadata="${SITE}/.well-known/oauth-protected-resource/mcp"`);
    const meta = await (await resourceMeta(new Request(`${SITE}/.well-known/oauth-protected-resource/mcp`))).json();
    expect(meta).toEqual(await (await rootResourceMeta(new Request(`${SITE}/.well-known/oauth-protected-resource`))).json());
    expect(meta).toMatchObject({ resource: `${SITE}/mcp`, authorization_servers: [SITE], bearer_methods_supported: ["header"] });
    const as = await (await serverMeta(new Request(`${SITE}/.well-known/oauth-authorization-server`))).json();
    expect(as).toMatchObject({ issuer: SITE, code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], grant_types_supported: ["authorization_code", "refresh_token"], registration_endpoint: `${SITE}/oauth/register` });
    expect(as).not.toHaveProperty("client_id_metadata_document_supported");

    // 2. Registration.
    const reg = await postJson({ client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" });
    expect(reg.status).toBe(201);
    expect(reg.headers.get("cache-control")).toBe("no-store");
    const client = await reg.json();
    expect(client).toMatchObject({ client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" });
    expect(client).not.toHaveProperty("client_secret");

    // 3. The person approves (the consent screen's call, ticket #141).
    const w = await workspace(); cleanups.push(w.cleanup);
    const ben = await w.person("member");
    const orders = await w.metric(ben, { name: "Orders" }); await w.token(orders.id, ben);
    const verifier = randomBytes(40).toString("base64url");
    const challengeS256 = createHash("sha256").update(verifier).digest("base64url");
    const { redirect } = await approveConnection(w.actor(ben, "member"), { response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challengeS256, code_challenge_method: "S256", resource: `${SITE}/mcp` }, { scopes: ["metrics:read"], endsOn: inDays(90) });
    const code = new URL(redirect).searchParams.get("code")!;

    // 4. Tokens for the code.
    const res = await postForm(token, "/oauth/token", form({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT, resource: `${SITE}/mcp` }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const t = await res.json();
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "metrics:read" });

    // 5. /mcp with the access token: the tools, limited to the connection's scopes.
    const transport = new StreamableHTTPClientTransport(new URL(`${SITE}/mcp`), { fetch: (url, init) => mcp(new Request(url, init)), requestInit: { headers: { authorization: `Bearer ${t.access_token}` } } });
    const assistant = new Client({ name: "claude", version: "1" });
    await assistant.connect(transport);
    cleanups.push(() => assistant.close());
    const listed = await assistant.callTool({ name: "list_metrics", arguments: {} });
    expect(JSON.parse((listed as { content: { text: string }[] }).content[0].text).metrics.map((m: { slug: string }) => m.slug)).toEqual([orders.slug]);
    expect((await assistant.callTool({ name: "submit_value", arguments: { slug: orders.slug, value: 1 } })).isError).toBe(true);

    // The token is for /mcp only: the API refuses it when a program sends it there itself.
    const direct = await metrics(new Request(`${SITE}/api/v1/metrics`, { headers: { authorization: `Bearer ${t.access_token}` } }), undefined);
    expect(direct.status).toBe(401);

    // 6. Refresh, then revoke: the connection ends.
    const r2 = await (await postForm(token, "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: client.client_id }))).json();
    expect(r2.access_token).toMatch(/^zat_/);
    expect((await postForm(revoke, "/oauth/revoke", form({ token: r2.refresh_token, client_id: client.client_id }))).status).toBe(200);
    expect((await mcpPost(r2.access_token)).status).toBe(401);
    // A refresh token no longer valid is invalid_grant, which tells a client to connect again.
    const again = await postForm(token, "/oauth/token", form({ grant_type: "refresh_token", refresh_token: r2.refresh_token, client_id: client.client_id }));
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("refuses odd requests in OAuth's words", async () => {
    expect((await register(new Request(`${SITE}/oauth/register`, { method: "POST", body: "{}", headers: { "content-type": "text/plain" } }))).status).toBe(400);
    expect(await (await postJson({ redirect_uris: ["http://example.com/cb"] })).json()).toMatchObject({ error: "invalid_redirect_uri" });
    expect(await (await register(new Request(`${SITE}/oauth/register`, { method: "POST", body: "{", headers: { "content-type": "application/json" } }))).json()).toMatchObject({ error: "invalid_client_metadata" });
    const json = await token(new Request(`${SITE}/oauth/token`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(await json.json()).toMatchObject({ error: "invalid_request" });
    // A parameter sent twice could pass one check and be read by another: refused.
    expect(await (await postForm(token, "/oauth/token", "grant_type=refresh_token&client_id=a&client_id=b")).json()).toMatchObject({ error: "invalid_request" });
    expect(await (await postForm(token, "/oauth/token", form({ grant_type: "client_credentials", client_id: "zc_x" }))).json()).toMatchObject({ error: "unsupported_grant_type" });
    expect((await postForm(revoke, "/oauth/revoke", form({ token: "zat_unknown" }))).status).toBe(200);
  });

  it("never buffers a large body: a declared length or a chunked stream over the limit is 413", async () => {
    for (const handler of [register, token] as const) {
      const declared = await handler(new Request(`${SITE}/oauth/x`, { method: "POST", body: "x".repeat(20_000), headers: { "content-type": handler === register ? "application/json" : "application/x-www-form-urlencoded", "content-length": "20000" } }));
      expect(declared.status).toBe(413);
      let sent = 0;
      const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ > 1000) return c.close(); c.enqueue(new Uint8Array(1024).fill(97)); } });
      const chunked = await handler(new Request(`${SITE}/oauth/x`, { method: "POST", body: stream, duplex: "half", headers: { "content-type": handler === register ? "application/json" : "application/x-www-form-urlencoded" } } as RequestInit));
      expect(chunked.status).toBe(413);
      expect(sent).toBeLessThan(30);
    }
  });

  it("is not there while the remote MCP Server is off", async () => {
    process.env.ZIFFR_REMOTE_MCP = "0";
    try {
      expect((await serverMeta(new Request(`${SITE}/.well-known/oauth-authorization-server`))).status).toBe(404);
      expect((await postJson({ redirect_uris: [REDIRECT] })).status).toBe(404);
      expect((await postForm(token, "/oauth/token", form({ grant_type: "refresh_token" }))).status).toBe(404);
    } finally {
      process.env.ZIFFR_REMOTE_MCP = "1";
    }
  });
});
