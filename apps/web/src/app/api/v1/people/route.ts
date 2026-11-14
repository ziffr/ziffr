// GET /api/v1/people (spec 0002): the workspace's people and Contacts, id and name only, never contact details.
// Scope metrics:read.
import { listPeople } from "@ziffr/core/api";
import { json, keyRoute, query, textPageQuery, toCursor } from "@/lib/api";
import { PersonList } from "../schemas";

/** Lists the workspace's people. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { limit, cursor } = textPageQuery.parse(query(req));
  const page = await listPeople(actor, { after: cursor, limit });
  return json(PersonList.parse({ items: page.items, next: toCursor(page.next) }));
});
