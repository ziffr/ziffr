// The same number through the API over HTTP and the MCP Server's tools (spec 0022, Testing Decisions, "Same number
// everywhere"; GLOSSARY: Metric): the values a program sent come back exactly as sent, each period once with the
// value that counts. The other paths (widget, Snapshot, View Link, Comparison, exports) are checked against the
// reference in packages/core/src/same-number.db.test.ts on the same values.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { actorForKey, createAccessKey } from "@ziffr/core/access-keys";
import type { KeyActor } from "@ziffr/core/actor";
import { submitObservation } from "@ziffr/core/api-submissions";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { createServer } from "@ziffr/mcp";
import { Ziffr } from "@ziffr/sdk";
import { inProcessFetch } from "@/lib/api-in-process";

// The same year of values as the core's test: March is sent twice, and the later value counts.
const SENT: [period: string, value: string][] = [
  ["2025-01-01", "0.1"], ["2025-02-01", "0.2"], ["2025-03-01", "7"], ["2025-03-01", "0.3"],
  ["2025-04-01", "1.005"], ["2025-05-01", "2.675"], ["2025-06-01", "0.015"],
  ["2025-07-01", "1000000.01"], ["2025-08-01", "0.01"], ["2025-09-01", "-0.02"],
  ["2025-10-01", "33.333333"], ["2025-11-01", "33.333333"], ["2025-12-01", "33.333334"],
];
const LATEST = [...new Map(SENT)];

let w: Awaited<ReturnType<typeof workspace>>;
let slug: string;
let ziffr: Ziffr;

beforeAll(async () => {
  w = await workspace();
  const sara = await w.person("owner");
  const m = await w.metric(sara, { name: "Revenue", unit: "€", decimals: 2, aggregation: "sum", submission_rule: "overwrite" });
  slug = m.slug;
  await w.token(m.id, sara);
  const submit = await createAccessKey(w.actor(sara), { name: "Shop", scopes: ["values:submit"], expiresOn: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10) });
  const key = (await actorForKey(submit.secret)) as KeyActor;
  const quiet = { notifyCorrection: async () => {}, afterValue: async () => [] };
  for (const [period, value] of SENT) expect((await submitObservation(key, slug, { value: Number(value), period }, quiet)).ok).toBe(true);
  const read = await createAccessKey(w.actor(sara), { name: "Assistant", scopes: ["metrics:read"], expiresOn: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10) });
  ziffr = new Ziffr({ url: "http://localhost:3000", accessKey: read.secret, fetch: inProcessFetch });
});
afterAll(async () => { await w?.cleanup(); });

describe("the same number through the API and the MCP Server", () => {
  it("over HTTP, through the SDK", async () => {
    const got: [string, string][] = [];
    for await (const o of ziffr.observations.all(slug)) got.push([o.period, String(o.value)]);
    expect(got).toEqual(LATEST);
  });
  it("through the MCP Server's get_metric", async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer(ziffr).connect(a);
    const client = new Client({ name: "test", version: "1" });
    await client.connect(b);
    const answer = await client.callTool({ name: "get_metric", arguments: { slug } });
    await client.close();
    const got = JSON.parse((answer as { content: { text: string }[] }).content[0].text);
    expect(got.values.map((o: { period: string; value: number }) => [o.period, String(o.value)])).toEqual(LATEST);
  });
});
