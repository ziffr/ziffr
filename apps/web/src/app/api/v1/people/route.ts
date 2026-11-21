// /api/v1/people. GET (spec 0002): the workspace's people and Contacts, id and name only, never contact details, scope
// metrics:read. POST (ticket #434): adds a Contact, scope people:write, only a program's own Access Key.
import { listPeople } from "@ziffr/core/api";
import { addContactWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, keyRoute, query, sensitiveRoute, toCursor } from "@/lib/api";
import { ContactCreated, CreateContact, PersonList, textPageQuery } from "../schemas";

/** Lists the workspace's people. */
export const GET = keyRoute("metrics:read", async (actor, req) => {
  const { limit, cursor } = textPageQuery.parse(query(req));
  const page = await listPeople(actor, { after: cursor, limit });
  return json(PersonList.parse({ items: page.items, next: toCursor(page.next) }));
});

/** Adds a Contact; 201 with their id and name, never their contact details. */
export const POST = sensitiveRoute("people:write", async (actor, req) => {
  const input = CreateContact.parse(await jsonBody(req));
  return json(ContactCreated.parse(await addContactWithKey(actor, input)), 201);
});
