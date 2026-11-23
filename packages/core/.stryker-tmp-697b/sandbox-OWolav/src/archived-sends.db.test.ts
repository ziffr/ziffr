// @ts-nocheck
// Nothing goes out for an Archived Metric, checked when it is sent (ticket #332; GLOSSARY: Archived Metric): a
// Prompt, a task reminder or an Escalation queued before the Metric was archived is marked failed by every Connector's
// send instead of going out, also one put back in the queue after a stopped send. A person's own question still goes.
import { afterEach, describe, expect, it } from "vitest";
import { ARCHIVED_BEFORE_SENT } from "./archived-metrics";
import { db } from "./db";
import { deliver, deliverPrompt } from "./deliveries";
import { sendDelivery } from "./mail";
import { sendSlackDelivery } from "./slack-send";
import { sendTelegramDelivery } from "./telegram-send";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const state = async (id: number) => (await db().from("deliveries").select("mail_state, last_error").eq("id", id).single()).data;

/** A Metric with a Submitter, and its queued deliveries made while it was in use; then it is archived directly, so
 * only the send-time check stands between them and the recipient. */
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ann = await w.person("member", { email: "ann@field.test" });
  const m = await w.metric(sara, { name: "Visits" });
  await w.token(m.id, ann);
  await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara, queue: true });
  const action = async (kind: "task" | "question", purpose: string | null) =>
    (await db().from("actions").insert({ metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: ann, kind, purpose, question: "Visits?", workspace_id: w.id }).select("id").single()).data!.id as number;
  await deliver({ kind: "reminder", actionId: await action("task", null), senderId: sara, recipientId: ann, queue: true });
  await deliver({ kind: "question", actionId: await action("question", "escalation"), senderId: sara, recipientId: ann, queue: true });
  await deliver({ kind: "question", actionId: await action("question", null), senderId: sara, recipientId: ann, queue: true });
  await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", m.id);
  const { data } = await db().from("deliveries").select("id, kind, action_id").eq("workspace_id", w.id).order("id");
  return { w, rows: data ?? [] };
}

describe("sending for an Archived Metric", () => {
  it("holds Prompts, task reminders and Escalations by email; a person's own question still goes", async () => {
    const { rows } = await setup();
    expect(rows.map((r) => r.kind)).toEqual(["prompt", "reminder", "question", "question"]);
    // Every one queued, as a stopped send's retry would leave it.
    await db().from("deliveries").update({ mail_state: "queued", connector: "email" }).in("id", rows.map((r) => r.id));
    for (const r of rows) await sendDelivery(r.id);
    const [prompt, reminder, escalation, question] = await Promise.all(rows.map((r) => state(r.id)));
    for (const held of [prompt, reminder, escalation]) expect(held).toEqual({ mail_state: "failed", last_error: ARCHIVED_BEFORE_SENT });
    expect(question?.last_error).not.toBe(ARCHIVED_BEFORE_SENT);
  });

  it("holds a Prompt on Slack and Telegram too, also one whose Prompt row is gone", async () => {
    const { rows } = await setup();
    const prompt = rows[0];
    await db().from("deliveries").update({ mail_state: "queued", connector: "slack", prompt_id: null }).eq("id", prompt.id);
    expect(await sendSlackDelivery(prompt.id)).toBe("failed");
    expect(await state(prompt.id)).toEqual({ mail_state: "failed", last_error: ARCHIVED_BEFORE_SENT });
    await db().from("deliveries").update({ mail_state: "queued", connector: "telegram" }).eq("id", prompt.id);
    expect(await sendTelegramDelivery(prompt.id)).toBe("failed");
    expect(await state(prompt.id)).toEqual({ mail_state: "failed", last_error: ARCHIVED_BEFORE_SENT });
  });
});
