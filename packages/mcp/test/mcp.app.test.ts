// The MCP server against the running app (spec 0002, ticket #52): an MCP client lists its tools and resources and
// calls each, through @ziffr/sdk, with a real Access Key.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAccessKey } from "@ziffr/core/access-keys";
import { db } from "@ziffr/core/db";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { Ziffr } from "@ziffr/sdk";
import { createServer } from "../src/server.js";

const URL = process.env.ZIFFR_TEST_URL ?? "http://localhost:3000";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const json = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);

async function connect(scopes: ("metrics:read" | "values:submit")[] = ["metrics:read", "values:submit"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member"); const sara = await w.person("owner");
  const orders = await w.metric(ben, { name: "Orders", description: "Orders a month" }); await w.token(orders.id, ben);
  const hidden = await w.metric(sara, { name: "Payroll" });
  await db().from("observations").insert([{ metric_id: orders.id, period_start: "2026-01-01", value: 3, source: "api", workspace_id: w.id }]);
  const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Assistant", scopes, expiresOn: inDays(30) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(new Ziffr({ url: URL, accessKey: secret })).connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  cleanups.push(() => client.close());
  return { client, ben, orders, hidden };
}

describe("@ziffr/mcp against the app", () => {
  it("offers four tools and calls each through the API", async () => {
    const { client, ben, orders, hidden } = await connect();
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(["get_metric", "list_metrics", "list_people", "submit_value"]);
    const metrics = json(await client.callTool({ name: "list_metrics", arguments: {} })).metrics;
    expect(metrics.map((m: { slug: string }) => m.slug)).toEqual([orders.slug]);
    expect(JSON.stringify(metrics)).not.toContain(hidden.slug);
    const got = json(await client.callTool({ name: "get_metric", arguments: { slug: orders.slug, from: "2026-01-01" } }));
    expect(got).toMatchObject({ metric: { slug: orders.slug, name: "Orders" }, values: [{ period: "2026-01-01", value: 3 }] });
    expect(json(await client.callTool({ name: "submit_value", arguments: { slug: orders.slug, value: 42, period: "2026-02-01" } }))).toMatchObject({ status: "recorded", value: 42 });
    const people = json(await client.callTool({ name: "list_people", arguments: {} })).people;
    expect(people).toHaveLength(2);
    expect(people).toContainEqual({ id: ben, name: expect.any(String), contact: false });
  });
  it("lists each visible Metric as a resource and reads it", async () => {
    const { client, orders } = await connect();
    const { resources } = await client.listResources();
    expect(resources).toEqual([expect.objectContaining({ uri: `ziffr://metrics/${orders.slug}`, name: "Orders" })]);
    const read = await client.readResource({ uri: `ziffr://metrics/${orders.slug}` });
    expect(JSON.parse(String((read.contents[0] as { text: string }).text))).toMatchObject({ metric: { slug: orders.slug }, values: [{ value: 3 }] });
  });
  it("reports what the key may not do as a tool error, not a failure", async () => {
    const { client, orders, hidden } = await connect(["metrics:read"]);
    const refused = await client.callTool({ name: "submit_value", arguments: { slug: orders.slug, value: 1 } });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toMatch(/forbidden/);
    expect((await client.callTool({ name: "get_metric", arguments: { slug: hidden.slug } })).isError).toBe(true);
  });
});
