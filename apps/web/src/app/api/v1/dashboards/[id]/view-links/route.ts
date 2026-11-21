// /api/v1/dashboards/{id}/view-links (ticket #435; GLOSSARY: View Link). Both need the scope view-links:write, which a
// key must be given on purpose and an assistant never is: a View Link publishes data to people outside the workspace.
// GET: the dashboard's View Links without their tokens. POST: makes one, live, frozen or of a shown Snapshot; the
// answer carries its token and address once, and is never stored for replay (no Idempotency-Key), so the secret is in
// no other place. At most 20 a day per creator.
import { createViewLinkWithKey, listViewLinksWithKey } from "@ziffr/core/api-view-links";
import { json, jsonBody, keyRoute } from "@/lib/api";
import { ApiViewLink, CreateViewLink, MadeViewLink, ViewLinkList } from "../../../schemas";
import { answered } from "../../../view-links/view-link-answers";
import { pathId, type IdCtx } from "../../../path-id";

/** Lists a dashboard's View Links. */
export const GET = keyRoute("view-links:write", async (actor, _req, ctx: IdCtx) => {
  const id = await pathId(ctx);
  return answered(async () => json(ViewLinkList.parse({ items: (await listViewLinksWithKey(actor, id)).map((l) => ApiViewLink.parse(l)) })));
});

/** Makes a View Link. 201 with it and its secret, shown this once. */
export const POST = keyRoute("view-links:write", async (actor, req, ctx: IdCtx) => {
  const id = await pathId(ctx);
  const input = CreateViewLink.parse(await jsonBody(req));
  return answered(async () => {
    const { path, ...made } = await createViewLinkWithKey(actor, id, input);
    const res = json(MadeViewLink.parse({ ...made, url: new URL(path, req.url).toString() }), 201);
    // The answer holds a secret: no cache, no intermediary keeps it.
    res.headers.set("cache-control", "no-store");
    return res;
  });
});
