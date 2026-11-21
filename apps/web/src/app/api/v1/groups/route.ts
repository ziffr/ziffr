// /api/v1/groups. GET (spec 0002): the workspace's Groups, id and name only, scope metrics:read. POST (ticket #434): makes
// a Group, scope groups:write, only a program's own Access Key.
import { listGroups } from "@ziffr/core/api";
import { createGroupWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, keyRoute, query, sensitiveRoute, toCursor } from "@/lib/api";
import { ChangedGroup, GroupList, GroupName, pageQuery } from "../schemas";

/** Lists the workspace's Groups. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { limit, cursor } = pageQuery.parse(query(req));
  const page = await listGroups(actor, { after: cursor, limit });
  return json(GroupList.parse({ items: page.items, next: toCursor(page.next) }));
});

/** Makes a Group; 201 with it. Owners and Admins only, as in the app. */
export const POST = sensitiveRoute("groups:write", async (actor, req) => {
  const { name } = GroupName.parse(await jsonBody(req));
  return json(ChangedGroup.parse(await createGroupWithKey(actor, name)), 201);
});
