// The trial's Feed Key for n8n through the core, against the real database (spec 0021 ticket 193, spec 0052 ticket 12): one
// Feed with a key that ends with the trial, reused when pressed again, never taking over a Feed the Owner made, and the
// Owner's alone.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { createWorkspace } from "./page-data";
import { makeTrialExample } from "./trial-seed";
import { actorForSecret } from "./access-keys";
import { addFeedToMetric, createFeed, createFeedKey, submitFeedObservations } from "./feeds";
import { makeGuideFeedKey, trialFeedKey } from "./trial-feed-key";

const MAIL = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const made: { workspaces: string[]; people: string[] } = { workspaces: [], people: [] };
afterEach(async () => {
  for (const k of ["ZIFFR_TRIAL_DAYS", "ZIFFR_CLOUD_KEY", ...Object.keys(MAIL)]) delete process.env[k];
  for (const id of made.workspaces.splice(0)) {
    await db().from("breakdown_rows").delete().eq("workspace_id", id);
    await db().from("observations").delete().eq("workspace_id", id);
    await db().from("deliveries").delete().eq("workspace_id", id);
    await db().from("workspaces").delete().eq("id", id);
  }
  if (made.people.length) await db().from("profiles").delete().in("id", made.people.splice(0));
});

async function newTrial(): Promise<Actor> {
  process.env.ZIFFR_TRIAL_DAYS = "7";
  process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
  const owner = `t-${randomUUID()}`;
  made.people.push(owner);
  await db().from("profiles").insert({ id: owner, name: "Trial owner", role: "", color: "#000", email: `o-${owner.slice(2, 10)}@example.test` });
  const workspaceId = await createWorkspace(owner, "My trial");
  made.workspaces.push(workspaceId);
  // The key sends the example's Metric, which the Owner chooses to try (#1292).
  await makeTrialExample({ personId: owner, workspaceId, role: "owner" });
  return { personId: owner, workspaceId, role: "owner" };
}

describe("the trial's Feed Key for n8n", () => {
  it("makes one Feed for the Test Metric with a key that ends with the trial, and reuses it when pressed again", async () => {
    const owner = await newTrial();
    const first = await makeGuideFeedKey(owner);
    if (!first.made) throw new Error("expected a new key");
    const { data: ws } = await db().from("workspaces").select("trial_ends_at, trial_test_metric_id").eq("id", owner.workspaceId).single();
    expect(first.key.expiresOn).toBe(new Date(ws!.trial_ends_at).toISOString().slice(0, 10));
    expect(first.secret.startsWith(`zk_${first.key.prefix}_`)).toBe(true);
    // The key works for the Feed and records a value for the Test Metric, whose API Source is now on.
    const feed = await actorForSecret(first.secret);
    expect(feed && "feedId" in feed).toBe(true);
    const g = (await trialFeedKey(owner))!;
    expect(g.key).toEqual(first.key);
    const [result] = await submitFeedObservations(feed as never, [{ metric: g.metric.slug, value: 3 }]);
    expect(result).toMatchObject({ status: "recorded" });
    const { data: seen } = await db().from("observations").select("value").eq("workspace_id", owner.workspaceId);
    expect(seen).toHaveLength(1);

    // Pressed again: the same key is kept and said so, with no second Feed.
    expect(await makeGuideFeedKey(owner)).toEqual({ made: false, key: first.key });
    // Replacing it revokes the old key and makes a new one for the same Feed.
    const second = await makeGuideFeedKey(owner, true);
    if (!second.made) throw new Error("expected a new key");
    expect(second.key.prefix).not.toBe(first.key.prefix);
    expect(await actorForSecret(first.secret)).toBeNull();
    const { count } = await db().from("feeds").select("person_id", { count: "exact", head: true }).eq("workspace_id", owner.workspaceId);
    expect(count).toBe(1);
  });

  it("makes a Feed Key only for the trial's Owner", async () => {
    const owner = await newTrial();
    await expect(makeGuideFeedKey({ ...owner, role: "admin", personId: `t-${randomUUID()}` })).rejects.toBeInstanceOf(Forbidden);
    const { count } = await db().from("feeds").select("person_id", { count: "exact", head: true }).eq("workspace_id", owner.workspaceId);
    expect(count).toBe(0);
  });

  it("never takes over or revokes a Feed the Owner made themselves", async () => {
    const owner = await newTrial();
    const { data: ws } = await db().from("workspaces").select("trial_test_metric_id").eq("id", owner.workspaceId).single();
    const own = await createFeed(owner, "My script");
    await addFeedToMetric(owner, ws!.trial_test_metric_id as number, own.id);
    const lastDay = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const ownKey = await createFeedKey(owner, own.id, { name: "script", expiresOn: lastDay });
    expect((await trialFeedKey(owner))!.key).toBeNull();
    const made = await makeGuideFeedKey(owner, true);
    expect(made.made).toBe(true);
    // The Owner's own key still works, and the guide made a Feed of its own.
    expect(await actorForSecret(ownKey.secret)).not.toBeNull();
    const { count } = await db().from("feeds").select("person_id", { count: "exact", head: true }).eq("workspace_id", owner.workspaceId);
    expect(count).toBe(2);
  });

  it("shows the key only to the Owner of a running trial, and never the secret", async () => {
    const owner = await newTrial();
    expect(await trialFeedKey({ ...owner, role: "admin" })).toBeNull();
    expect(await trialFeedKey(owner)).toEqual({ metric: { name: "Cups of coffee", slug: expect.any(String) }, key: null });
    await makeGuideFeedKey(owner);
    expect(Object.keys((await trialFeedKey(owner))!.key!).sort()).toEqual(["expiresOn", "prefix"]);
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", owner.workspaceId);
    expect(await trialFeedKey(owner)).toBeNull();
  });
});
