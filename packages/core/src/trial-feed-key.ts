// The Feed Key a trial's Owner makes for n8n (spec 0021 ticket 193, kept by spec 0052 ticket 12; GLOSSARY: Feed, Feed Key,
// Test Metric, Trial Workspace): linked from Try it and from the ways in and out. The Owner of a running trial makes a Feed
// and a key that works until the trial ends and sends the Test Metric's values; the secret is shown once and never kept.
import { openOne } from "./sealed-columns";
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { trialEndsAt } from "./trials";
import { addFeedToMetric, createFeed, createFeedKey, revokeFeedKey } from "./feeds";

/** A Feed Key as the page may show it: enough to recognise it on the Feeds page. */
export type GuideFeedKey = { prefix: string; expiresOn: string };

// Only the Owner of a running trial makes it: an ended trial asks nobody.
async function assertTrialOwner(actor: Actor): Promise<void> {
  if (actor.role !== "owner") throw new Forbidden("Only the trial's Owner makes this key.");
  const ends = await trialEndsAt(actor.workspaceId);
  if (!ends || ends.getTime() <= Date.now()) throw new Forbidden("This is for a running trial.");
}

/** The Test Metric and the working key of the guide's Feed, as the Owner of a running trial may see them; null for anyone
 * else or when the trial has no Test Metric. Never the secret: the prefix and last day only. */
export async function trialFeedKey(actor: Actor): Promise<{ metric: { name: string; slug: string }; key: GuideFeedKey | null } | null> {
  if (actor.key) return null;
  try { await assertTrialOwner(actor); } catch { return null; }
  const { data: ws } = await db().from("workspaces").select("trial_test_metric_id").eq("id", actor.workspaceId).single();
  if (!ws?.trial_test_metric_id) return null;
  const { data: mRow } = await db().from("metrics").select("id, name, slug").eq("id", ws.trial_test_metric_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  const m = await openOne("metrics", actor.workspaceId, mRow);
  if (!m) return null;
  return { metric: { name: m.name as string, slug: m.slug as string }, key: shownKey((await guideFeed(actor))?.key) };
}

/** The name the Feed it makes has, so the Feeds page says where it came from. Unchanged since the Trial Guide made it, so
 * a Feed made then is still found. */
export const GUIDE_FEED_NAME = "n8n (from the Trial guide)";

// The guide's Feed: the live Feed the guide made in this workspace (its name, made by the Owner), with its newest
// working key. Never another Feed, so Replace the key cannot revoke a key the Owner made on the Feeds page.
async function guideFeed(actor: Actor): Promise<{ id: string; key: (GuideFeedKey & { id: number }) | null } | null> {
  const { data: feed } = await db().from("feeds").select("person_id").eq("workspace_id", actor.workspaceId).eq("name", GUIDE_FEED_NAME)
    .eq("created_by", actor.personId).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
  if (!feed) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data: key } = await db().from("access_keys").select("id, prefix, expires_on").eq("workspace_id", actor.workspaceId).eq("feed_id", feed.person_id)
    .is("revoked_at", null).gte("expires_on", today).order("id", { ascending: false }).limit(1).maybeSingle();
  return { id: feed.person_id as string, key: key ? { id: key.id as number, prefix: key.prefix as string, expiresOn: key.expires_on as string } : null };
}

// Only the prefix and last day go to the browser, never the key's row id.
const shownKey = (k: GuideFeedKey | null | undefined): GuideFeedKey | null => (k ? { prefix: k.prefix, expiresOn: k.expiresOn } : null);

/** What making a key for n8n gave: the secret, shown this once, or the key that already works. */
export type GuideFeedKeyResult = { made: true; secret: string; key: GuideFeedKey } | { made: false; key: GuideFeedKey };

/** Makes the Feed a program such as n8n sends the Test Metric's values with, and a Feed Key for it, for the trial's
 * Owner. Uses the guide's Feed when there is one, so pressing again makes no second Feed. When a key already works it
 * is kept and said so, unless `replace` is set: then it is revoked and a new one made, since a secret is shown only
 * once. The key ends with the trial; the trial's limits on Feeds and keys apply as anywhere else. */
export async function makeGuideFeedKey(actor: Actor, replace = false): Promise<GuideFeedKeyResult> {
  if (actor.key) throw new Forbidden();
  await assertTrialOwner(actor);
  const { data: ws } = await db().from("workspaces").select("trial_test_metric_id, trial_ends_at").eq("id", actor.workspaceId).single();
  if (!ws?.trial_test_metric_id) throw new Error("This trial has no Test Metric to send values to.");
  const metricId = ws.trial_test_metric_id as number;
  let feed = await guideFeed(actor);
  if (feed?.key && !replace) return { made: false, key: shownKey(feed.key)! };
  // Checked before anything is made, so the last day leaves no Feed without a key behind.
  const lastDay = new Date(ws.trial_ends_at as string).toISOString().slice(0, 10);
  if (lastDay <= new Date().toISOString().slice(0, 10)) throw new Error("This trial ends today, so a new key would not work.");
  if (!feed) {
    const { id } = await createFeed(actor, GUIDE_FEED_NAME);
    feed = { id, key: null };
  }
  // Checked each time: the Owner may have taken the Feed off the Metric since.
  const { data: token } = await db().from("tokens").select("id").eq("metric_id", metricId).eq("submitter_id", feed.id).is("stands_in_for", null).maybeSingle();
  if (!token) await addFeedToMetric(actor, metricId, feed.id);
  if (feed.key) await revokeFeedKey(actor, feed.key.id);
  const { secret } = await createFeedKey(actor, feed.id, { name: "n8n key", expiresOn: lastDay });
  // What this call made, not read back: a second press at the same moment must not show the other one's key.
  const prefix = secret.split("_")[1];
  return { made: true, secret, key: { prefix, expiresOn: lastDay } };
}
