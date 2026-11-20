// /api/v1/dashboards/{id}/snapshots (ticket #435; GLOSSARY: Snapshot). GET: the dashboard's Snapshots its key's creator may
// open (scope dashboards:read). POST: takes one of a period that is over, as the creator, who must own or edit the
// dashboard and see every Metric on it (scope dashboards:write); a draft until a person shows it.
import { listSnapshotsWithKey, takeSnapshotWithKey } from "@ziffr/core/api-snapshots";
import { json, jsonBody, keyRoute } from "@/lib/api";
import { build } from "@/lib/api-build";
import { ApiSnapshotSummary, SnapshotList, TakeSnapshot } from "../../../schemas";
import { snapshotWithUrl } from "../../../snapshots/snapshot-url";
import { pathId, type IdCtx } from "../../../path-id";

/** Lists a dashboard's visible Snapshots. */
export const GET = keyRoute("dashboards:read", async (actor, req, ctx: IdCtx) => {
  const id = await pathId(ctx);
  return json(SnapshotList.parse({ items: (await listSnapshotsWithKey(actor, id)).map((s) => snapshotWithUrl(req, s)) }));
});

/** Takes a Snapshot. 201 with it; 422 when the period is not over, is taken already or is out of range. */
export const POST = keyRoute("dashboards:write", async (actor, req, ctx: IdCtx) => {
  const id = await pathId(ctx);
  const input = TakeSnapshot.parse(await jsonBody(req));
  return build(actor, req, "change", "take_snapshot", input, async () => ({ status: 201, body: ApiSnapshotSummary.parse(snapshotWithUrl(req, await takeSnapshotWithKey(actor, id, input))) }));
});
