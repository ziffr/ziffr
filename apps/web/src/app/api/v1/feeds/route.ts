// GET /api/v1/feeds (ticket #217; GLOSSARY: Feed): the workspace's live Feeds by id and name, so a key with
// metrics:edit can name one as a Submitter. Only what the Metric page offers anyone who may change a Metric. Not to be
// confused with /feed, which a Feed Key uses to send its values.
import { listFeedsWithKey } from "@ziffr/core/api-metrics";
import { json, keyRoute } from "@/lib/api";
import { FeedList } from "../schemas";

/** Lists the live Feeds. */
export const GET = keyRoute("metrics:edit", async (actor) => json(FeedList.parse({ items: await listFeedsWithKey(actor) })));
