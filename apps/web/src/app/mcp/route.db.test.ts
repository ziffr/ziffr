// The remote MCP Server at /mcp (spec 0023, ticket #139): an MCP client over Streamable HTTP, its requests handed
// to the route handler, against the local database. It offers exactly the local server's tools, and a credential
// reaches what the same Access Key reaches through the API, no more.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAccessKey, revokeAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { removeMember } from "@ziffr/core/handover";
import { accessLogOf, workspace } from "@ziffr/core/test/db-fixtures";
import { createServer } from "@ziffr/mcp";
import { Ziffr } from "@ziffr/sdk";
import { readdirSync } from "node:fs";
import { dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inProcessFetch, matchRoute, NOT_IN_PROCESS, ROUTES } from "@/lib/api-in-process";
import { remoteMcpEnabled } from "@/lib/remote-mcp";
import { POST, GET } from "./route";

const MCP = "http://localhost:3000/mcp";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const before = process.env.ZIFFR_REMOTE_MCP;
beforeAll(() => { process.env.ZIFFR_REMOTE_MCP = "1"; });
afterAll(() => { process.env.ZIFFR_REMOTE_MCP = before; });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;
const json = (r: unknown) => JSON.parse(text(r));

/** An MCP client whose HTTP requests go to the route handler, sending the credential as a real client does. */
async function remote(secret: string) {
  const transport = new StreamableHTTPClientTransport(new URL(MCP), {
    fetch: (url, init) => POST(new Request(url, init)),
    requestInit: { headers: { authorization: `Bearer ${secret}` } },
  });
  const client = new Client({ name: "test", version: "1" });
  await client.connect(transport);
  cleanups.push(() => client.close());
  return client;
}

async function setup(scopes: Scope[] = ["metrics:read", "values:submit"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member"); const sara = await w.person("owner");
  const orders = await w.metric(ben, { name: "Orders" }); await w.token(orders.id, ben);
  const hidden = await w.metric(sara, { name: "Payroll" });
  const key = await createAccessKey(w.actor(ben, "member"), { name: "Assistant", scopes, expiresOn: inDays(30) });
  return { w, ben, sara, orders, hidden, key };
}

const post = (body: unknown, headers: Record<string, string> = {}) => POST(new Request(MCP, {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
}));
const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } };

describe("/mcp", () => {
  it("offers exactly the tools and resources of the local server", async () => {
    const { key } = await setup();
    const client = await remote(key.secret);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer(new Ziffr({ url: "http://localhost:3000", accessKey: key.secret, fetch: inProcessFetch })).connect(a);
    const local = new Client({ name: "local", version: "1" });
    await local.connect(b);
    cleanups.push(() => local.close());
    // Names, descriptions, input schemas and annotations: a tool is written once.
    expect((await client.listTools()).tools).toEqual((await local.listTools()).tools);
    expect((await client.listResourceTemplates()).resourceTemplates).toEqual((await local.listResourceTemplates()).resourceTemplates);
    expect(client.getServerVersion()).toEqual(local.getServerVersion());
    // The Starters too, filled in and refused the same way.
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(["what_can_i_do", "weekly_review", "record_values", "build_dashboard", "explain_metric"]);
    expect((await client.listPrompts()).prompts).toEqual((await local.listPrompts()).prompts);
    const args = { name: "record_values", arguments: { text: "3 coffees today" } };
    expect(await client.getPrompt(args)).toEqual(await local.getPrompt(args));
    await expect(client.getPrompt({ name: "explain_metric", arguments: { metric: "x".repeat(121) } })).rejects.toThrow(/Invalid arguments/);
  });

  it("reads and submits through the API, logged in the key's Access Log", async () => {
    const { key, orders, hidden } = await setup();
    const client = await remote(key.secret);
    const metrics = json(await client.callTool({ name: "list_metrics", arguments: {} })).metrics;
    expect(metrics.map((m: { slug: string }) => m.slug)).toEqual([orders.slug]);
    expect(JSON.stringify(metrics)).not.toContain(hidden.slug);
    expect(json(await client.callTool({ name: "submit_value", arguments: { slug: orders.slug, value: 7, period: "2026-02-01" } }))).toMatchObject({ status: "recorded", value: 7 });
    // A Metric the key's creator may not see is the API's 404, as for the local server.
    const refused = await client.callTool({ name: "get_metric", arguments: { slug: hidden.slug } });
    expect(refused.isError).toBe(true);
    expect(text(refused)).toContain("not_found");
    const log = await accessLogOf(key.id);
    expect(log.map((l) => `${l.method} ${l.status}`)).toEqual(expect.arrayContaining(["GET 200", "POST 201", "GET 404"]));
  });

  it("limits tools by the key's scopes exactly as the API does", async () => {
    const { key, orders } = await setup(["metrics:read"]);
    const client = await remote(key.secret);
    expect((await client.callTool({ name: "list_metrics", arguments: {} })).isError).toBeFalsy();
    for (const [name, args] of [
      ["submit_value", { slug: orders.slug, value: 1 }],
      ["create_metric", { name: "X" }],
      ["list_dashboards", {}],
      ["create_dashboard", { name: "X" }],
    ] as const) {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError, name).toBe(true);
      expect(text(r), name).toContain("forbidden");
    }
  });

  it("answers 401 with a challenge without a valid credential, and reaches nothing for an ended one", async () => {
    const none = await post(initialize);
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toMatch(/^Bearer /);
    expect((await post(initialize, { authorization: "Bearer zk_000000000000_" + "a".repeat(43) })).status).toBe(401);
    // A token in the query string is never read.
    const { w, ben, sara, key } = await setup();
    expect((await POST(new Request(`${MCP}?access_token=${key.secret}`, { method: "POST", body: JSON.stringify(initialize), headers: { "content-type": "application/json", accept: "application/json, text/event-stream" } }))).status).toBe(401);
    expect((await post(initialize, { authorization: `Bearer ${key.secret}` })).status).toBe(200);
    // Revoked by an Owner.
    await revokeAccessKey(w.actor(sara, "owner"), key.id);
    expect((await post(initialize, { authorization: `Bearer ${key.secret}` })).status).toBe(401);
    // Its creator left the workspace.
    const again = await createAccessKey(w.actor(ben, "member"), { name: "Again", scopes: ["metrics:read"], expiresOn: inDays(30) });
    await removeMember(w.actor(sara, "owner"), ben, sara);
    expect((await post(initialize, { authorization: `Bearer ${again.secret}` })).status).toBe(401);
  });

  it("refuses another site's Origin, GET, large bodies, and is off unless set", async () => {
    const { key } = await setup();
    const auth = { authorization: `Bearer ${key.secret}` };
    expect((await post(initialize, { ...auth, origin: "https://evil.example" })).status).toBe(403);
    expect((await post(initialize, { ...auth, origin: "http://localhost:3000" })).status).toBe(200);
    const get = await GET(new Request(MCP, { headers: auth }));
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    // A declared length over the limit, and a chunked body without one that passes it.
    const declared = await POST(new Request(MCP, { method: "POST", body: "x".repeat(300 * 1024), headers: { ...auth, "content-type": "application/json", "content-length": String(300 * 1024) } }));
    expect(declared.status).toBe(413);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ > 1000) return c.close(); c.enqueue(new Uint8Array(1024).fill(32)); } });
    const big = await POST(new Request(MCP, { method: "POST", body: stream, duplex: "half", headers: { ...auth, "content-type": "application/json" } } as RequestInit));
    expect(big.status).toBe(413);
    expect(sent).toBeLessThan(300);
    process.env.ZIFFR_REMOTE_MCP = "0";
    try {
      expect((await post(initialize, auth)).status).toBe(404);
    } finally {
      process.env.ZIFFR_REMOTE_MCP = "1";
    }
  });

  it("is on by default only where Ziffr is reached over https, and never in a demo-only Ziffr", () => {
    expect(remoteMcpEnabled({ ZIFFR_SITE_URL: "https://ziffr.example.com" })).toBe(true);
    expect(remoteMcpEnabled({ ZIFFR_SITE_URL: "http://localhost:3000" })).toBe(false);
    expect(remoteMcpEnabled({})).toBe(false);
    expect(remoteMcpEnabled({ ZIFFR_SITE_URL: "http://localhost:3000", ZIFFR_REMOTE_MCP: "1" })).toBe(true);
    expect(remoteMcpEnabled({ ZIFFR_SITE_URL: "https://ziffr.example.com", ZIFFR_REMOTE_MCP: "0" })).toBe(false);
    expect(remoteMcpEnabled({ ZIFFR_SITE_URL: "https://demo.example.com", ZIFFR_REMOTE_MCP: "1", ZIFFR_DEMO_ONLY: "1" })).toBe(false);
  });

  it("hands every API route for people's keys to its handler, and no other", () => {
    const root = fileURLToPath(new URL("../api/v1", import.meta.url));
    const folders = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("route.ts")).map((f) => dirname(f).split(sep).join("/")).sort();
    expect([...ROUTES.map(([p]) => p), ...NOT_IN_PROCESS].sort()).toEqual(folders);
    expect(matchRoute("dashboards/from-template")?.params).toEqual({});
    expect(matchRoute("dashboards/12/widgets/3")?.params).toEqual({ id: "12", widgetId: "3" });
    expect(matchRoute("metrics/%E0%A4%A")).toBeNull();
    expect(matchRoute("feed/observations")).toBeNull();
    expect(matchRoute("metrics//observations")).toBeNull();
  });

  it("never caches an answer and sends no CORS headers", async () => {
    const { key } = await setup();
    const res = await post(initialize, { authorization: `Bearer ${key.secret}` });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("mcp-session-id")).toBeNull();
  });
});
