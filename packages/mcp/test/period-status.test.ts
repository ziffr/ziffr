// The tool period_status (ticket #410; GLOSSARY: Period Timeline): it finds the Workflow by name or id, calls
// GET /workflows/{id}/period-status and answers the count and the events in order, workspace words as data.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Ziffr, type PeriodStatus } from "@ziffr/sdk";
import { createServer } from "../src/server.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const STATUS: PeriodStatus = {
  workflow: { id: 3, name: "Weekly numbers" }, period: { start: "2026-11-16", name: "Week 47, 2026" }, in: 5, of: 6, published: 0, locked: 0, checklist: { done: 1, of: 2 }, finished: false,
  events: [
    { at: "2026-11-16T08:00:00.000Z", day: "2026-11-16", time: "08:00", kind: "asked", text: "Asked 6 people by Email", count: 6, in: null, items: ["Mia: Revenue", "1 value"], url: null },
    { at: "2026-11-16T14:10:00.000Z", day: "2026-11-16", time: "14:10", kind: "in", text: "5 values came in (5 of 6 in)", count: 5, in: 5, items: [], url: "https://ziffr.test/actions/9" },
  ],
};

async function connect() {
  const asked: URL[] = [];
  const answer = (url: URL) => Response.json(url.pathname === "/api/v1/workflows" ? { items: [{ id: 3, name: "Weekly numbers" }, { id: 4, name: "Month close" }], next: null } : STATUS);
  const ziffr = new Ziffr({ url: "http://ziffr.test", accessKey: "zk_test", fetch: async (u) => { asked.push(new URL(String(u))); return answer(new URL(String(u))); }, maxRetries: 0 });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(ziffr).connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  cleanups.push(() => client.close());
  return { client, asked };
}

describe("period_status", () => {
  it("answers how the period is going, by the Workflow's name", async () => {
    const { client, asked } = await connect();
    const res = await client.callTool({ name: "period_status", arguments: { workflow: "weekly NUMBERS", period: "2026-11-16" } });
    expect(res.isError).toBeFalsy();
    expect(asked.map((u) => `${u.pathname}${u.search}`)).toEqual(["/api/v1/workflows?limit=100", "/api/v1/workflows/3/period-status?period=2026-11-16"]);
    const text = (res.content as { text: string }[])[0].text;
    expect(text).toContain("\"Weekly numbers\", Week 47, 2026: 5 of 6 in, 0 published, 0 locked, 1 of 2 checklist tasks done.");
    expect(text).toContain("- 2026-11-16 08:00: Asked 6 people by Email (Mia: Revenue; 1 value)");
    expect(text).toContain("- 2026-11-16 14:10: 5 values came in (5 of 6 in) https://ziffr.test/actions/9");
  });
  it("lists the Workflows when none or an unknown one is named", async () => {
    const { client } = await connect();
    const none = (await client.callTool({ name: "period_status", arguments: {} })).content as { text: string }[];
    expect(none[0].text).toMatch(/^Which Workflow\?[\s\S]*"Month close" \(id 4\)/);
    const unknown = (await client.callTool({ name: "period_status", arguments: { workflow: "Nope" } })).content as { text: string }[];
    expect(unknown[0].text).toMatch(/^No Workflow "Nope"\./);
  });
});
