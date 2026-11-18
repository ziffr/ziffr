// POST /oauth/token (spec 0023, RFC 6749, 3.2): an assistant trades its one-time code and PKCE verifier, or its
// refresh token, for tokens. Public clients only; the core checks everything and refuses with invalid_grant.
import { tokenRequest } from "@ziffr/core/assistant-connections";
import { oauthJson, oauthRoute, urlForm } from "@/lib/oauth";

/** Answers a token request. */
export const POST = oauthRoute(async (req) => oauthJson(await tokenRequest(await urlForm(req))));
