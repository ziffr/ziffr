// /api/v1/feed/observations (spec 0012, GLOSSARY: Feed, Import). POST: up to 500 values in one call, each through the
// same core path as any value, with one result per item. Only for Feed Keys; at most 10,000 values a day per Feed,
// counted over all its keys, and a batch that would cross that is refused whole, so a run never half-succeeds silently.
// One batch runs at a time per Feed; the claim is one locked database step, so parallel requests cannot pass it.
import { once, type StoredAnswer } from "@ziffr/core/api-submissions";
import { claimFeedBatch, FEED_VALUES_PER_DAY, finishFeedBatch, submitFeedObservations } from "@ziffr/core/feeds";
import { errorBody, feedRoute, jsonBody } from "@/lib/api";
import { idempotencyKey, idempotentAnswer } from "@/lib/api-idempotency";
import { FeedBatch, FeedBatchAnswer } from "../../schemas";

/** A batch of 500 values with Breakdowns fits in this. */
const MAX_BATCH_BODY = 1024 * 1024;

/** Records a batch. 200 with a result per item; 409 for a reused Idempotency-Key with another body; 429 when the day's
 * limit would be crossed. */
export const POST = feedRoute(async (feed, req) => {
  const idem = idempotencyKey(req);
  const { items } = FeedBatch.parse(await jsonBody(req, MAX_BATCH_BODY));
  let retryAfter: number | null = null;
  let taken = 0;
  const answer = async (): Promise<StoredAnswer> => {
    const claim = await claimFeedBatch(feed, items.length);
    if (!claim.ok) {
      retryAfter = claim.retryAfter;
      const message = claim.reason === "busy"
        ? "Another batch of this Feed is still running; send the next when it is done."
        : `This Feed may record ${FEED_VALUES_PER_DAY} values in 24 hours, and this batch would cross that; try again in ${claim.retryAfter} seconds.`;
      return { ...errorBody("rate_limited", message), keep: false };
    }
    try {
      const results = await submitFeedObservations(feed, items);
      taken = results.filter((r) => r.status === "recorded" || r.status === "awaiting_approval").length;
      return { status: 200, body: FeedBatchAnswer.parse({ results }) };
    } finally {
      // Every claimed item counts towards the day, whatever became of it: a locked item still writes a proposed
      // Correction, and a batch that fails part way may have written some. Refunds would let a Feed write more.
      await finishFeedBatch(feed, claim.batchId, items.length);
    }
  };
  const result = idem === null ? await answer() : await once(feed, idem, { endpoint: "feed_batch", items }, answer);
  // Counted towards the day's limit only for values taken now, not when a stored answer is replayed.
  return idempotentAnswer(result, "batch", retryAfter, taken ? { "x-ziffr-submitted": String(taken) } : {});
});
