// DELETE /api/v1/view-links/{id} (ticket #435; GLOSSARY: View Link): revokes one of the key's creator's View Links to a
// dashboard, at once and for good (scope view-links:write). Another person's, a deck's or a missing one is 404.
import { revokeViewLinkWithKey } from "@ziffr/core/api-view-links";
import { json, keyRoute } from "@/lib/api";
import { RevokedViewLink } from "../../schemas";
import { answered } from "../view-link-answers";
import { pathId, type IdCtx } from "../../path-id";

/** Revokes a View Link. */
export const DELETE = keyRoute("view-links:write", async (actor, _req, ctx: IdCtx) => {
  const id = await pathId(ctx);
  return answered(async () => {
    await revokeViewLinkWithKey(actor, id);
    return json(RevokedViewLink.parse({ revoked: id }));
  });
});
