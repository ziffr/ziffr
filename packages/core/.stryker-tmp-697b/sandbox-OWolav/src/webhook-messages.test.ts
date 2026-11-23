// @ts-nocheck
// Webhook messages, who may hear them, signing and the retry schedule (spec 0034, ticket #400): pure, no database.
import { readFileSync, writeFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { eventForChange } from "./action-state";
import { repoFile } from "./test/repo-file";
import { metricSeenByEveryone, webhookMayHear } from "./visibility";
import { buildActionMessage, buildPingMessage, buildValueRecordedMessage, buildAlertFiredMessage, buildValueUnusualMessage, REPLY_MAX, TITLE_MAX, WEBHOOK_EVENTS_SCHEMA, type ActionFacts, type MessageEnvelope } from "./webhook-messages";
import { retryWaitMs, signWebhookBody, verifyWebhookSignature } from "./webhook-send";

const WS = "ws-a";
const facts = (over: Partial<Parameters<typeof webhookMayHear>[2] & object> = {}) => ({ workspace_id: WS, metricSeenByEveryone: true, readGroupId: null as number | null, ...over });

describe("what a Webhook may hear (webhookMayHear)", () => {
  it.each([
    ["Metric Everyone sees, open Thread", "action.created", {}, "full"],
    ["Metric Everyone sees, Thread limited to a Group", "action.done", { readGroupId: 4 }, "redacted"],
    ["Metric private (or shared with a Guest only)", "action.updated", { metricSeenByEveryone: false }, "redacted"],
    ["Metric private, Group Thread", "action.answered", { metricSeenByEveryone: false, readGroupId: 4 }, "redacted"],
    ["a value on a Metric Everyone sees", "value.recorded", {}, "full"],
    ["a value on a private Metric: nothing, and nothing hints at it", "value.recorded", { metricSeenByEveryone: false }, "none"],
    ["an unusual value on a private Metric", "value.unusual", { metricSeenByEveryone: false }, "none"],
    ["an alert on a private Metric", "alert.fired", { metricSeenByEveryone: false }, "none"],
    ["a fact from another Workspace grants nothing", "action.created", { workspace_id: "ws-b" }, "none"],
  ])("%s -> %s", (_name, event, over, hears) => {
    expect(webhookMayHear(WS, event as string, facts(over as object))).toBe(hears);
  });
  it("hears nothing without facts, but a ping is always whole", () => {
    expect(webhookMayHear(WS, "action.created", null)).toBe("none");
    expect(webhookMayHear(WS, "ping", null)).toBe("full");
  });
  it("counts a Metric as Everyone's only through a share with the Everyone Group of its own Workspace", () => {
    const groups = [{ id: 1, name: "Everyone", members: [], everyone: true, workspace_id: WS }, { id: 2, name: "Board", members: ["a"], workspace_id: WS }, { id: 9, name: "Everyone", members: [], everyone: true, workspace_id: "ws-b" }];
    const share = (over: object) => ({ id: 1, object_type: "metric" as const, object_id: 5, user_id: "", role: "viewer" as const, workspace_id: WS, ...over });
    expect(metricSeenByEveryone(WS, 5, groups, [share({ group_id: 1 })])).toBe(true);
    expect(metricSeenByEveryone(WS, 5, groups, [share({ group_id: 2 })])).toBe(false);
    expect(metricSeenByEveryone(WS, 5, groups, [share({ user_id: "a", group_id: null })])).toBe(false);
    expect(metricSeenByEveryone(WS, 5, groups, [share({ group_id: 9, workspace_id: "ws-b" })])).toBe(false);
    expect(metricSeenByEveryone(WS, 5, groups, [share({ object_type: "dashboard", group_id: 1 })])).toBe(false);
  });
});

const env = (over: Partial<MessageEnvelope> = {}): MessageEnvelope => ({ eventId: `evt_${"a".repeat(32)}`, createdAt: "2026-11-20T09:15:02.000Z", workspaceId: WS, source: { type: "slack" }, reason: null, replyText: null, externalIds: [], ...over });
// A hostile Workspace: names with markup, a Metric named like an email address.
const action = (over: Partial<ActionFacts> = {}): ActionFacts => ({
  ref: "ZIF-12", kind: "task", status: "answered", title: "<script>alert(1)</script> Send the report", due: "2026-11-27", metric: { id: 3, name: "boss@secret.example" },
  period: "2026-10-01", assignee: { id: "ana", name: "Ana <b>", email: "ana@example.test" }, askerName: "Sara", link: "https://z.example/actions/12", updatedAt: "2026-11-20T09:15:00.000Z", ...over,
});

describe("the messages", () => {
  it("a full Action message has the words, a redacted one the structure only", () => {
    const full = buildActionMessage("action.done", "full", action(), env({ reason: "done", replyText: "ok" }));
    expect(full).toMatchObject({ id: env().eventId, type: "action.done", workspace: { id: WS }, data: { ref: "ZIF-12", title: expect.stringContaining("Send the report"), reason: "done", reply: { text: "ok" }, source: { type: "slack" }, external_ids: [] } });
    const redacted = buildActionMessage("action.done", "redacted", action(), env({ reason: "done", replyText: "private words" }));
    expect(Object.keys(redacted.data).sort()).toEqual(["assignee", "due", "external_ids", "kind", "link", "reason", "redacted", "ref", "source", "status", "updated_at"]);
    const text = JSON.stringify(redacted);
    for (const secret of ["Send the report", "boss@secret.example", "private words", "Sara", "script"]) expect(text).not.toContain(secret);
    expect(redacted.data.redacted).toBe(true);
  });
  it("marks a change that came in through a Webhook with that Webhook's id, and says nothing of any person", () => {
    const m = buildActionMessage("action.done", "full", action(), env({ source: { type: "webhook", webhookId: "w-1" } }));
    expect(m.data.source).toEqual({ type: "webhook", webhook_id: "w-1" });
    expect(JSON.stringify(m.data.source)).not.toMatch(/ana|sara/i);
  });
  it("cuts the title and the reply, and holds nothing else from the Workspace", () => {
    const m = buildActionMessage("action.updated", "full", action({ title: "x".repeat(TITLE_MAX * 3) }), env({ replyText: "y".repeat(REPLY_MAX * 3) }));
    expect((m.data.title as string).length).toBeLessThanOrEqual(TITLE_MAX);
    expect(((m.data.reply as { text: string }).text).length).toBeLessThanOrEqual(REPLY_MAX);
    expect(Object.keys(m.data).sort()).toEqual(["asker", "assignee", "due", "external_ids", "kind", "link", "metric", "period", "ref", "reply", "source", "status", "title", "updated_at"]);
  });
  it("alert.fired holds what an Alert's message says: the Metric, period, value, target, condition and a link", () => {
    const m = buildAlertFiredMessage({ metric: { id: 1, name: "Churn" }, period: "2026-10-01", value: "12", target: null, condition: { kind: "share_of_target", level: "80" }, link: "l" }, env());
    expect(Object.keys(m.data).sort()).toEqual(["condition", "link", "metric", "period", "target", "value"]);
    expect(m.type).toBe("alert.fired");
  });
  it("value.unusual carries no value, a ping nothing of the Workspace", () => {
    const u = buildValueUnusualMessage({ metric: { id: 1, name: "Churn" }, period: "2026-10-01", link: "l" }, env());
    expect(Object.keys(u.data).sort()).toEqual(["link", "metric", "period"]);
    const p = buildPingMessage("To Do", { eventId: env().eventId, createdAt: env().createdAt });
    expect(p).toEqual({ id: env().eventId, type: "ping", created_at: env().createdAt, data: { webhook: { name: "To Do" } } });
  });
});

describe("the published schema", () => {
  it("is the one the builders are checked against, generated and never written by hand", () => {
    const path = repoFile("docs/reference/webhook-events.schema.json");
    const generated = `${JSON.stringify(WEBHOOK_EVENTS_SCHEMA, null, 2)}\n`;
    if (process.env.UPDATE_REFERENCE) writeFileSync(path, generated);
    expect(readFileSync(path, "utf8")).toBe(generated);
  });
  it("accepts what the builders make, in full and redacted, and nothing with an extra field or a wrong kind", () => {
    const validate = new Ajv2020({ strict: false, allErrors: true }).compile(WEBHOOK_EVENTS_SCHEMA);
    const good = [
      ...(["action.created", "action.updated", "action.answered", "action.done"] as const).flatMap((t) => (["full", "redacted"] as const).map((h) => buildActionMessage(t, h, action(), env({ reason: t === "action.done" ? "closed" : null, replyText: "hi", source: { type: "webhook", webhookId: "w" }, externalIds: [{ system: "microsoft-todo", external_id: "AB", url: null }] })))),
      buildValueUnusualMessage({ metric: { id: 1, name: "Churn" }, period: "2026-10-01", link: "l" }, env()),
      buildValueRecordedMessage({ metric: { id: 1, name: "Churn" }, period: "2026-10-01", value: "12", target: null, link: "l" }, env()),
      buildAlertFiredMessage({ metric: { id: 1, name: "Churn" }, period: "2026-10-01", value: "12", target: "10", condition: { kind: "below", level: "15" }, link: "l" }, env()),
      buildPingMessage("x", { eventId: env().eventId, createdAt: env().createdAt }),
    ];
    for (const m of good) expect(validate(m), JSON.stringify(validate.errors)).toBe(true);
    const redacted = buildActionMessage("action.done", "redacted", action(), env());
    expect(validate({ ...redacted, data: { ...redacted.data, title: "leak" } })).toBe(false);
    expect(validate({ ...good[0], type: "action.exploded" })).toBe(false);
  });
});

describe("which event a change makes (eventForChange)", () => {
  it.each([
    ["task", "open", "answered", undefined, "action.done", "done"],
    ["task", "open", "closed", undefined, "action.done", "closed"],
    ["task", "answered", "closed", undefined, null, null],
    ["task", "open", "closed", "metric_archived", "action.done", "metric_archived"],
    ["task", "answered", "closed", "metric_archived", null, null],
    ["question", "open", "answered", undefined, "action.answered", null],
    ["question", "answered", "closed", undefined, "action.done", "answered"],
    ["question", "open", "closed", undefined, "action.done", "closed"],
    ["question", "answered", "closed", "metric_archived", "action.done", "metric_archived"],
    ["task", "closed", "open", undefined, "action.updated", null],
    ["question", "answered", "open", undefined, "action.updated", null],
  ] as const)("%s %s -> %s (%s)", (kind, from, to, reason, type, why) => {
    const e = eventForChange(kind, from, to, reason);
    expect(e ? [e.type, e.reason] : null).toEqual(type ? [type, why] : null);
  });
});

describe("signing", () => {
  const body = '{"id":"evt_1","type":"action.done"}';
  const secret = `whsec_${"s".repeat(43)}`;
  const old = `whsec_${"o".repeat(43)}`;
  it("is HMAC-SHA256 of the timestamp, a dot and the body: a fixed vector", () => {
    expect(signWebhookBody([secret], 1_700_000_000, body)).toBe("sha256=ceb4361a361dbd1016518fa46c06a5b074d1ae6c773604310847655bb430836d");
  });
  it("holds both signatures, the new one first, while the old secret overlaps; and a receiver with either accepts", () => {
    const both = signWebhookBody([secret, old], 1_700_000_000, body);
    expect(both.split(",")).toHaveLength(2);
    expect(both.split(",")[0]).toBe(signWebhookBody([secret], 1_700_000_000, body));
    expect(verifyWebhookSignature([secret], "1700000000", body, both, 1_700_000_100)).toBe(true);
    expect(verifyWebhookSignature([old], "1700000000", body, both, 1_700_000_100)).toBe(true);
    expect(verifyWebhookSignature([secret], "1700000000", body, signWebhookBody([secret], 1_700_000_000, body), 1_700_000_100)).toBe(true);
    // After the overlap only the new one signs: the old secret no longer matches.
    expect(verifyWebhookSignature([old], "1700000000", body, signWebhookBody([secret], 1_700_000_000, body), 1_700_000_100)).toBe(false);
  });
  it("refuses an old or future timestamp, a changed body, and a missing, malformed or short signature", () => {
    const sig = signWebhookBody([secret], 1_700_000_000, body);
    expect(verifyWebhookSignature([secret], "1700000000", body, sig, 1_700_000_301)).toBe(false);
    expect(verifyWebhookSignature([secret], "1700000000", body, sig, 1_699_999_600)).toBe(false);
    expect(verifyWebhookSignature([secret], "1700000000", `${body} `, sig, 1_700_000_100)).toBe(false);
    for (const bad of [null, "", "sha256=", "sha256=abc", sig.slice(0, -2), sig.toUpperCase(), `md5=${sig.slice(7)}`]) expect(verifyWebhookSignature([secret], "1700000000", body, bad, 1_700_000_100)).toBe(false);
    for (const ts of [null, "", "abc", "1.7e9", "-1"]) expect(verifyWebhookSignature([secret], ts, body, sig, 1_700_000_100)).toBe(false);
  });
});

describe("the retry schedule", () => {
  it("waits 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, then has failed", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => retryWaitMs(n))).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000, null]);
  });
  it("honours Retry-After (seconds or a date) when it asks for longer, up to an hour, and never for less than the schedule", () => {
    const now = Date.parse("2026-11-20T10:00:00Z");
    expect(retryWaitMs(1, "120", now)).toBe(120_000);
    expect(retryWaitMs(1, "5", now)).toBe(60_000);
    expect(retryWaitMs(1, "999999", now)).toBe(3_600_000);
    expect(retryWaitMs(1, "Fri, 20 Nov 2026 10:05:00 GMT", now)).toBe(300_000);
    expect(retryWaitMs(1, "nonsense", now)).toBe(60_000);
    expect(retryWaitMs(5, "3600", now)).toBe(43_200_000);
  });
});
