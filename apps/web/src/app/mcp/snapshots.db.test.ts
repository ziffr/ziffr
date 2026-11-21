// Snapshots through the remote MCP Server (ticket #435; GLOSSARY: Snapshot, View Link, MCP Server): three tools, limited by the
// same scopes as the API, and no tool to make or revoke a View Link, even for a key that holds that scope.
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAccessKey } from "@ziffr/core/access-keys";
import { createDashboard, placeWidget } from "@ziffr/core/dashboards";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { POST } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const before = process.env.ZIFFR_REMOTE_MCP;
beforeAll(() => { process.env.ZIFFR_REMOTE_MCP = "1"; });
afterAll(() => { process.env.ZIFFR_REMOTE_MCP = before; });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const json = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);

it("lists, reads and takes Snapshots as the key's creator, and offers no View Link tool", async () => {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const rev = await w.metric(sara, { name: "Revenue" }); await w.value(rev.id, "2026-10-01", 100);
  const dash = await createDashboard(w.actor(sara), "Overview");
  await placeWidget(w.actor(sara), dash, { type: "spec", template: "story", metricIds: [rev.id], settings: { headline: "Up", panels: [] } });
  const { secret } = await createAccessKey(w.actor(sara), { name: "Assistant", scopes: ["dashboards:read", "dashboards:write", "view-links:write"], expiresOn: inDays(30) });
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"), { fetch: (url, init) => POST(new Request(url, init)), requestInit: { headers: { authorization: `Bearer ${secret}` } } });
  const client = new Client({ name: "test", version: "1" });
  await client.connect(transport); cleanups.push(() => client.close());
  const names = (await client.listTools()).tools.map((t) => t.name);
  expect(names).toEqual(expect.arrayContaining(["list_snapshots", "get_snapshot", "take_snapshot"]));
  expect(names.filter((n) => /view_link|link/.test(n))).toEqual([]);
  const taken = json(await client.callTool({ name: "take_snapshot", arguments: { dashboard_id: dash, kind: "month", start: "2026-10-01" } })).snapshot;
  expect(taken).toMatchObject({ dashboard: dash, label: "October 2026", shown: false });
  expect(json(await client.callTool({ name: "list_snapshots", arguments: { dashboard_id: dash } })).snapshots.map((s: { id: number }) => s.id)).toEqual([taken.id]);
  expect(json(await client.callTool({ name: "get_snapshot", arguments: { id: taken.id } })).snapshot.metrics[0].values).toEqual([{ period: "2026-10-01", value: 100 }]);
  // Taken already: the words come back as a refusal.
  expect((await client.callTool({ name: "take_snapshot", arguments: { dashboard_id: dash, kind: "month", start: "2026-10-01" } })).isError).toBe(true);
});
