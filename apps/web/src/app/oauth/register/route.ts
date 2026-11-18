// POST /oauth/register (spec 0023, RFC 7591): an assistant registers itself before a person connects it. Open to
// anyone, so limited per network address and for the Installation, and what it sends is only a name and its
// redirect addresses, shown as untrusted text on the consent screen. Registering grants nothing by itself.
import { networkAddress } from "@ziffr/core/sign-in-limits";
import { registerClient } from "@ziffr/core/assistant-connections";
import { jsonForm, oauthJson, oauthRoute } from "@/lib/oauth";

/** Registers a public client: 201 with its client_id. */
export const POST = oauthRoute(async (req) => {
  const client = await registerClient(await jsonForm(req), networkAddress(req.headers));
  return oauthJson({
    client_id: client.id, client_id_issued_at: client.issuedAt, client_name: client.name, redirect_uris: client.redirectUris,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
  }, 201);
});
