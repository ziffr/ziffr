// POST /api/v1/shares/requests/{id} (ticket #434, GLOSSARY: Share): the owner grants Viewer access to an open request or
// declines it; the requester is told. Scope shares:write, only a program's own Access Key.
import { decideAccessWithKey } from "@ziffr/core/api-sharing";
import { json, jsonBody, sensitiveRoute } from "@/lib/api";
import { AccessDecided, DecideAccess, pathId } from "../../../schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Grants or declines. */
export const POST = sensitiveRoute("shares:write", async (actor, req, ctx: Ctx) => {
  const id = pathId.parse((await ctx.params).id);
  const { grant } = DecideAccess.parse(await jsonBody(req));
  return json(AccessDecided.parse(await decideAccessWithKey(actor, id, grant)));
});
