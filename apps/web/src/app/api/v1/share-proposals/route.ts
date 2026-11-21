// /api/v1/share-proposals (ticket #538, GLOSSARY: Share Proposal). POST: prepares a share of a dashboard the key's creator
// owns, for them to confirm in the app (scopes shares:propose and dashboards:read). There is deliberately no route to confirm,
// decline or list: deciding is the person's, with their own sign-in, and nothing a key sends can do it.
import { Forbidden, Refused, scopeRefusal } from "@ziffr/core/actor";
import { proposeShareWithKey } from "@ziffr/core/api-share-proposals";
import { apiError, errorBody, json, jsonBody, keyRoute } from "@/lib/api";
import { withUrl } from "@/lib/api-build";
import { ApiShareProposal, CreateShareProposal } from "../schemas";

/** Prepares a share. 201 with it and the page where the person confirms; 422 with the words when it cannot be made; 403 for a role
 * that may not share; 404 for what the creator may not share (the same whether it exists or not). */
export const POST = keyRoute("shares:propose", async (actor, req) => {
  if (!actor.key.scopes.includes("dashboards:read")) return apiError("forbidden", scopeRefusal("dashboards:read"));
  const input = CreateShareProposal.parse(await jsonBody(req));
  try {
    const made = await proposeShareWithKey(actor, input);
    return json(ApiShareProposal.parse({ ...made, preview: withUrl(req, made.preview) }), 201);
  } catch (e) {
    if (e instanceof Refused) { const { status, body } = errorBody("unprocessable", e.message); return json(body, status); }
    if (e instanceof Forbidden && e.message.startsWith("Your role")) return apiError("forbidden", e.message);
    throw e;
  }
});
