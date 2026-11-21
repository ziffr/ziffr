// GET /api/v1/snapshots/{id} (ticket #435; GLOSSARY: Snapshot): one Snapshot with the values it kept, cut down to what the
// key's creator may see now (scope dashboards:read). A draft they may not open, one of a dashboard they do not see, of
// another workspace, or a missing one is 404.
import { getSnapshotWithKey } from "@ziffr/core/api-snapshots";
import { json, keyRoute } from "@/lib/api";
import { ApiSnapshot, idParam } from "../../schemas";
import { snapshotWithUrl } from "../snapshot-url";
import { pathId, type IdCtx } from "../../path-id";

/** Reads one Snapshot. */
export const GET = keyRoute("dashboards:read", async (actor, req, ctx: IdCtx) => {
  const id = await pathId(ctx);
  return json(ApiSnapshot.parse(snapshotWithUrl(req, await getSnapshotWithKey(actor, id))));
});
