// The example messages in docs/automations/fixtures (GLOSSARY: Webhook; spec 0034, ticket #403): produced by the core's own
// message builders, checked against the published schema, and the signing example and the verifier code in the Webhooks
// guide are run, so the guide, the fixtures and the code cannot drift apart. `UPDATE_REFERENCE=1` rewrites the fixtures.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { repoFile } from "./test/repo-file";
import { buildActionMessage, buildPingMessage, buildValueRecordedMessage, buildValueUnusualMessage, WEBHOOK_EVENTS_SCHEMA, type ActionFacts, type MessageEnvelope } from "./webhook-messages";
import { signWebhookBody } from "./webhook-send";

const EVT = (n: number) => `evt_${String(n).padStart(32, "0")}`;
const env = (n: number, over: Partial<MessageEnvelope> = {}): MessageEnvelope => ({ eventId: EVT(n), createdAt: "2026-11-20T09:15:02.000Z", workspaceId: "0d4f6a52-8f0e-4a39-9c1b-5f1d1c0f7a01", source: { type: "app" }, reason: null, replyText: null, externalIds: [], ...over });
const task: ActionFacts = {
  ref: "ZIF-12", kind: "task", status: "open", title: "Send the October report to the board", due: "2026-11-27", metric: { id: 3, name: "Monthly revenue" }, period: "2026-10-01",
  assignee: { id: "7b1c0a3e-52d1-4c7e-8d0f-2f4a9a6c1e10", name: "Ana Silva", email: "ana@example.test" }, askerName: "Sara Jones", link: "https://ziffr.example.test/actions/12", updatedAt: "2026-11-20T09:15:02.000Z",
};
const question: ActionFacts = { ...task, ref: "ZIF-13", kind: "question", title: "Why did revenue drop in October?", status: "open" };
const todo = [{ system: "microsoft-todo", external_id: "AAMkAGI2TGuLAAA=", url: "https://to-do.example.test/tasks/AAMkAGI2TGuLAAA=" }];
const value = { metric: { id: 3, name: "Monthly revenue" }, period: "2026-10-01", link: "https://ziffr.example.test/metrics/3" };

/** The fixtures: file name and the message the builders make. */
const FIXTURES: Record<string, unknown> = {
  "action-created.json": buildActionMessage("action.created", "full", task, env(1)),
  "action-created-redacted.json": buildActionMessage("action.created", "redacted", task, env(2)),
  "action-updated-reply.json": buildActionMessage("action.updated", "full", task, env(3, { replyText: "Draft is ready, sending it tomorrow.", source: { type: "slack" }, externalIds: todo })),
  "action-answered.json": buildActionMessage("action.answered", "full", { ...question, status: "answered" }, env(4, { replyText: "A customer paused their plan.", source: { type: "email" } })),
  "action-done.json": buildActionMessage("action.done", "full", { ...task, status: "answered" }, env(5, { reason: "done", source: { type: "webhook", webhookId: "2c9e5b1a-6d3f-4f7e-b8a1-0e5c9d7a3b42" }, externalIds: todo })),
  "value-recorded.json": buildValueRecordedMessage({ ...value, value: "48,200", target: "50,000", link: value.link }, env(6)),
  "value-unusual.json": buildValueUnusualMessage(value, env(7)),
  "ping.json": buildPingMessage("Microsoft To Do", { eventId: EVT(8), createdAt: "2026-11-20T09:15:02.000Z" }),
};
const MESSAGES = Object.entries(FIXTURES);

/** The signing example: the secret, the time, the body of the first fixture and what Ziffr sends with it. */
const SECRET = "whsec_EXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE000";
const TIMESTAMP = 1_763_630_102;
const BODY = JSON.stringify(FIXTURES["action-created.json"]);
const SIGNING = { secret: SECRET, timestamp: TIMESTAMP, body_fixture: "action-created.json", body: BODY, headers: { "X-Ziffr-Timestamp": String(TIMESTAMP), "X-Ziffr-Signature": signWebhookBody([SECRET], TIMESTAMP, BODY), "X-Ziffr-Event": "action.created", "X-Ziffr-Delivery": EVT(1) } };
const ALL: Record<string, unknown> = { ...FIXTURES, "signing-example.json": SIGNING };

const file = (name: string) => repoFile(`docs/automations/fixtures/${name}`);
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

describe("the Webhook fixtures", () => {
  if (process.env.UPDATE_REFERENCE) {
    mkdirSync(new URL("./", file("x")), { recursive: true });
    for (const [name, v] of Object.entries(ALL)) writeFileSync(file(name), json(v));
  }
  it.each(Object.keys(ALL))("%s is what the builders make now", (name) => {
    expect(readFileSync(file(name), "utf8")).toBe(json(ALL[name]));
  });
  it("every message is valid against the published schema, and every event has one", () => {
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(WEBHOOK_EVENTS_SCHEMA);
    for (const [name, m] of MESSAGES) expect(validate(m), `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
    const types = new Set(MESSAGES.map(([, m]) => (m as { type: string }).type));
    for (const t of ["action.created", "action.updated", "action.answered", "action.done", "value.recorded", "value.unusual", "ping"]) expect(types.has(t), t).toBe(true);
  });
});

const guide = readFileSync(repoFile("docs/guides/webhooks.md"), "utf8");
/** The code block of the guide that starts with `marker` (a first-line comment), without the marker line. */
const block = (lang: string, marker: string) => {
  const start = guide.indexOf(`\`\`\`${lang}\n${marker}\n`);
  if (start < 0) throw new Error(`The guide has no ${lang} block marked ${marker}`);
  const from = start + lang.length + marker.length + 5;
  return guide.slice(from, guide.indexOf("```", from));
};
const lower = Object.fromEntries(Object.entries(SIGNING.headers).map(([k, v]) => [k.toLowerCase(), v]));

describe("the verifier code in the Webhooks guide", () => {
  it("the Node verifier accepts the signing example, and refuses a changed body, an old time and a wrong secret", () => {
    const mod = { exports: {} as { verify: (secrets: string[], headers: Record<string, string>, body: string, nowSeconds?: number) => boolean } };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    new Function("require", "module", block("js", "// ziffr-test: verify"))((name: string) => require(name), mod);
    const { verify } = mod.exports;
    expect(verify([SECRET], lower, BODY, TIMESTAMP + 10)).toBe(true);
    expect(verify([SECRET], lower, `${BODY} `, TIMESTAMP + 10)).toBe(false);
    expect(verify([SECRET], lower, BODY, TIMESTAMP + 301)).toBe(false);
    expect(verify(["whsec_other"], lower, BODY, TIMESTAMP + 10)).toBe(false);
  });
  it("the Python verifier does the same", () => {
    let python = true;
    try { execFileSync("python3", ["-I", "-c", "pass"]); } catch { python = false; }
    if (!python) return;
    const driver = `
import json, sys
c = json.load(sys.stdin)
h = {k.lower(): v for k, v in c["headers"].items()}
ts = int(c["timestamp"])
out = [verify([c["secret"]], h, c["body"], ts + 10), verify([c["secret"]], h, c["body"] + " ", ts + 10), verify([c["secret"]], h, c["body"], ts + 301), verify(["whsec_other"], h, c["body"], ts + 10)]
print(json.dumps(out))
`;
    const out = execFileSync("python3", ["-I", "-c", `${block("python", "# ziffr-test: verify")}\n${driver}`], { input: JSON.stringify(SIGNING) }).toString();
    expect(JSON.parse(out)).toEqual([true, false, false, false]);
  });
});
