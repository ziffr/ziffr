// GET /api/v1/groups (spec 0002): the workspace's Groups, id and name only. Scope metrics:read.
import { listGroups } from "@ziffr/core/api";
import { json, keyRoute, pageQuery, query, toCursor } from "@/lib/api";
import { GroupList } from "../schemas";

/** Lists the workspace's Groups. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { limit, cursor } = pageQuery.parse(query(req));
  const page = await listGroups(actor, { after: cursor, limit });
  return json(GroupList.parse({ items: page.items, next: toCursor(page.next) }));
});
