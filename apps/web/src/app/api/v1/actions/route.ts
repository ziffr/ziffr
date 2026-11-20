// GET /api/v1/actions (ticket #427; GLOSSARY: Action, Question, Task): the Questions and Tasks waiting for the key's
// creator and those they asked, a page at a time (scope actions:read). The core decides what the creator may read; this
// only shapes the page.
import { listActionsWithKey } from "@ziffr/core/api-actions";
import { json, keyRoute, query, toCursor } from "@/lib/api";
import { ActionList, actionsQuery } from "../schemas";

/** The creator's Actions, newest first. */
export const GET = keyRoute("actions:read", async (actor, req) => {
  const { limit, cursor, role, status } = actionsQuery.parse(query(req));
  const page = await listActionsWithKey(actor, { after: cursor, limit, role, status });
  return json(ActionList.parse({ items: page.items, next: toCursor(page.next) }));
});
