// An n8n workflow that sends one value to a Feed (GLOSSARY: Feed, Feed Key; docs/guides/feeds.md): a Manual Trigger,
// a Set node with the value and an HTTP Request to /api/v1/feed/observations, with a sticky note saying what it does,
// and a daily Schedule Trigger that is off until someone turns it on. In n8n's own export format, so it can be pasted
// onto a canvas or imported from a file. Pure, so the Trial guide builds it in the browser from what it just showed
// and nothing is stored; docs/guides/n8n-feed-workflow.json is the same workflow with placeholders.

/** What the workflow needs: this Ziffr's address, the Metric's slug and the Feed Key to send with. */
export type N8nFeedWorkflowInput = { siteUrl: string; metricSlug: string; feedKey: string };

/** The placeholders of the generic copy in docs/guides. */
export const N8N_PLACEHOLDERS: N8nFeedWorkflowInput = {
  siteUrl: "https://ziffr.example.com", metricSlug: "your-metric-slug", feedKey: "zk_your_feed_key",
};

/** The file name the Trial guide offers the workflow under. */
export const N8N_WORKFLOW_FILE = "ziffr-feed-workflow.json";

/** The workflow, as n8n exports it. The key sits in the header so the import works at once; the note says that for
 * real use it belongs in an n8n credential (Header Auth). */
export function n8nFeedWorkflow({ siteUrl, metricSlug, feedKey }: N8nFeedWorkflowInput) {
  const site = siteUrl.replace(/\/+$/, "");
  // The slug goes into the body as JSON, so any character it might hold stays inside its string.
  const metric = JSON.stringify(metricSlug);
  const note = [
    "## Send a number to Ziffr",
    `Press **Execute workflow**: **Value** picks a number from 1 to 5 and **Send to Ziffr** records it for \`${metricSlug}\` as today's value.`,
    "",
    "The Feed Key in the Authorization header comes from Ziffr (Trial guide or Settings, then Feeds). For real use, put it in an n8n credential (Header Auth, name `Authorization`, value `Bearer <key>`) instead of the header field.",
    "",
    "**Every day at 9** sends a value daily once you turn it on.",
  ].join("\n");
  return {
    name: "Send a number to Ziffr",
    nodes: [
      { id: "3f0c5a4e-0b1d-4c55-9a1e-6c2f6f0a1001", name: "Execute workflow", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} },
      {
        id: "3f0c5a4e-0b1d-4c55-9a1e-6c2f6f0a1002", name: "Every day at 9", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 200], disabled: true,
        parameters: { rule: { interval: [{ triggerAtHour: 9 }] } },
      },
      {
        id: "3f0c5a4e-0b1d-4c55-9a1e-6c2f6f0a1003", name: "Value", type: "n8n-nodes-base.set", typeVersion: 3.4, position: [240, 100],
        parameters: {
          mode: "manual",
          assignments: { assignments: [{ id: "3f0c5a4e-0b1d-4c55-9a1e-6c2f6f0a1006", name: "value", value: "={{ Math.floor(Math.random() * 5) + 1 }}", type: "number" }] },
          options: {},
        },
      },
      {
        id: "3f0c5a4e-0b1d-4c55-9a1e-6c2f6f0a1004", name: "Send to Ziffr", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [480, 100],
        parameters: {
          method: "POST",
          url: `${site}/api/v1/feed/observations`,
          sendHeaders: true,
          headerParameters: { parameters: [
            { name: "Authorization", value: `Bearer ${feedKey}` },
            // One run records once, also when n8n retries the request.
            { name: "Idempotency-Key", value: "={{ $execution.id }}" },
          ] },
          sendBody: true,
          specifyBody: "json",
          jsonBody: `={"items":[{"metric":${metric},"value": {{ $json.value }} }]}`,
          options: {},
        },
      },
      {
        id: "3f0c5a4e-0b1d-4c55-9a1e-6c2f6f0a1005", name: "What this does", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [-40, -300],
        parameters: { content: note, height: 260, width: 560 },
      },
    ],
    connections: {
      "Execute workflow": { main: [[{ node: "Value", type: "main", index: 0 }]] },
      "Every day at 9": { main: [[{ node: "Value", type: "main", index: 0 }]] },
      Value: { main: [[{ node: "Send to Ziffr", type: "main", index: 0 }]] },
    },
    settings: { executionOrder: "v1" },
  };
}
