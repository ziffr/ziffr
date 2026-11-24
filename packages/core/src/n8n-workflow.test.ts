// The n8n workflow for a Feed (docs/guides/feeds.md): the shape n8n imports, the values filled in, and the generic
// copy in docs/guides kept the same as what the Setup Guide of a trial builds.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { N8N_PLACEHOLDERS, n8nFeedWorkflow } from "./n8n-workflow";

// A stand-in for a key, built here so no key-like text is in the source.
const KEY = ["zk", "test", "x".repeat(8)].join("_");
const input = { siteUrl: "https://ziffr.example.test/", metricSlug: "cups-of-coffee", feedKey: KEY };
const wf = n8nFeedWorkflow(input);
const node = (name: string) => wf.nodes.find((n) => n.name === name)!;

describe("the n8n workflow for a Feed", () => {
  it("has a manual trigger, an optional daily one that is off, a value, a request and a note", () => {
    expect(wf.nodes.map((n) => n.type)).toEqual([
      "n8n-nodes-base.manualTrigger", "n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.set", "n8n-nodes-base.httpRequest", "n8n-nodes-base.stickyNote",
    ]);
    expect(node("Every day at 9").disabled).toBe(true);
    expect(new Set(wf.nodes.map((n) => n.id)).size).toBe(wf.nodes.length);
    expect(new Set(wf.nodes.map((n) => n.name)).size).toBe(wf.nodes.length);
  });

  it("connects both triggers to the value and the value to the request, by node name", () => {
    const names = new Set(wf.nodes.map((n) => n.name));
    for (const [from, out] of Object.entries(wf.connections)) {
      expect(names.has(from)).toBe(true);
      for (const link of out.main.flat()) expect(names.has(link.node)).toBe(true);
    }
    expect(wf.connections["Execute workflow"].main[0][0].node).toBe("Value");
    expect(wf.connections["Every day at 9"].main[0][0].node).toBe("Value");
    expect(wf.connections.Value.main[0][0].node).toBe("Send to Ziffr");
  });

  it("posts to this Ziffr's Feed endpoint with the key, an idempotency key per run and the Metric's slug", () => {
    const p = node("Send to Ziffr").parameters as Record<string, unknown> & { headerParameters: { parameters: { name: string; value: string }[] }; jsonBody: string };
    expect(p.method).toBe("POST");
    expect(p.url).toBe("https://ziffr.example.test/api/v1/feed/observations");
    expect(p.headerParameters.parameters).toEqual([
      { name: "Authorization", value: `Bearer ${KEY}` },
      { name: "Idempotency-Key", value: "={{ $execution.id }}" },
    ]);
    // With the expression filled in as n8n would, the body is the Feed API's JSON.
    const body = JSON.parse(p.jsonBody.slice(1).replace("{{ $json.value }}", "3"));
    expect(body).toEqual({ items: [{ metric: "cups-of-coffee", value: 3 }] });
  });

  it("keeps a strange slug inside its JSON string", () => {
    const odd = n8nFeedWorkflow({ ...input, metricSlug: 'a"b' });
    const p = odd.nodes.find((n) => n.name === "Send to Ziffr")!.parameters as { jsonBody: string };
    expect(JSON.parse(p.jsonBody.slice(1).replace("{{ $json.value }}", "1")).items[0].metric).toBe('a"b');
  });

  it("is the same as the generic copy in docs/guides, with its placeholders", () => {
    const file = JSON.parse(readFileSync(new URL("../../../docs/guides/n8n-feed-workflow.json", import.meta.url), "utf8"));
    expect(file).toEqual(JSON.parse(JSON.stringify(n8nFeedWorkflow(N8N_PLACEHOLDERS))));
  });
});
