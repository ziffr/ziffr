# Ziffr is its own OAuth server for assistants

Web assistants such as Claude.ai reach a remote MCP Server by its address and sign in with OAuth 2.1 (spec 0023). Something has to be the authorization server: register the assistant, show the consent screen, issue and refresh tokens, and revoke them. Ziffr already uses Supabase Auth for signing in, and Supabase Auth has had an OAuth 2.1 server since late 2025, in the pinned GoTrue too (`v2.196.0` in `docker/compose.yml` has `internal/api/oauthserver`, off unless `GOTRUE_OAUTH_SERVER_ENABLED`). We checked it against what an assistant's connection must be in Ziffr and decided against it: **Ziffr serves the OAuth endpoints itself, on the core, and a connection is an Access Key of the kind `assistant`.**

## What Supabase Auth's OAuth server offers, and where it falls short

Checked against Supabase's documentation (OAuth 2.1 Server, OAuth flows, MCP authentication) and GoTrue `v2.196.0`'s source, in November 2026:

| Needed | Supabase Auth | Ziffr's own |
|---|---|---|
| Dynamic client registration (RFC 7591) | yes, opt-in, rate limited per Installation | yes, limited per network address |
| PKCE, S256 only | S256 and `plain` | S256 only |
| Refresh tokens rotate, reuse ends the connection | rotation, reuse detection not documented | yes |
| Revocation (RFC 7009) | no; a person revokes a client's grant through their own session, the REST revoke endpoint is experimental | yes, `/oauth/revoke` |
| Scopes Ziffr defines (`metrics:read`, `values:submit`, …) | no: only `openid`, `email`, `profile`, `phone`; custom scopes are planned | yes, the Access Key scopes |
| One Workspace per connection | no: the token is the person's, for every Workspace | yes |
| Token bound to the MCP Server (RFC 8707) | no: audience is always `authenticated` | yes, only `/mcp` takes it |
| Protected resource metadata (RFC 9728) | served by the resource, so by Ziffr either way | yes |
| Same on hosted Supabase and Docker | hosted: switch in the dashboard; Docker: environment, and the `/auth/v1/oauth` routes made public through the proxy | the same code everywhere |
| Status | public beta | ours to keep |

The deciding row is what the token is. Supabase's access token is the person's ordinary session JWT with a `client_id` claim: whoever holds it can do what the person can in the browser, in every Workspace they belong to, with every role they have. An Access Key, by contrast, is one Workspace, a few scopes, an end date, an Access Log, a limit per key, and stops when its creator leaves; Owners see and revoke it. Giving an assistant a session would mean rebuilding all of that around the JWT, a second implementation of rules that already hold for keys, with the session's wider power underneath if a check were missed.

## Considered Options

- **Supabase Auth's OAuth server, with Ziffr's consent page.** Rejected for the reasons in the table: tokens are full sessions, no custom scopes, no RFC 7009 revocation, no audience, beta. It would also need `GOTRUE_OAUTH_SERVER_*` settings and a public route to GoTrue on every Docker Installation, and a switch in the dashboard on hosted Supabase, which a self-hoster can forget.
- **Supabase Auth's OAuth server, exchanging its token for an Access Key.** The assistant would hold a Supabase token and Ziffr would look up a key for it on every call. Rejected: two token systems to keep in step, revocation in two places, and the session token would still exist in the assistant's hands.
- **An OAuth library (such as `oidc-provider`) inside the app.** Rejected for now: it brings its own storage model, sessions and many flows Ziffr does not need, and the part that matters, tying the grant to an Access Key, would still be ours. The endpoints are small: register, authorize, token, revoke, two metadata documents.
- **Ziffr's own endpoints on the core** (chosen). The authorization code flow with PKCE S256, rotating refresh tokens and dynamic registration, nothing else: no implicit flow, no client credentials, no passwords, no ID tokens. Every grant becomes an Access Key of the kind `assistant`, so revocation, the end of a membership, scopes, the Access Log, the API limits and the trial limits hold without a line of new permission code.

## Consequences

- We own security-relevant code: code and token handling, redirect matching, registration limits. It is covered by database tests for every refusal in the spec and by the threat model's entry points.
- A connection shows up wherever Access Keys do, and Owners end it like a key. Assistant tokens are kept apart from key secrets: a key's secret never works as an OAuth token, and an access token works only at `/mcp`, not on `/api/v1` directly.
- Client ID Metadata Documents (the MCP authorization spec's preferred registration since revision 2025-11-25) are left out for now: they make the server fetch an address the client names, which needs SSRF protection. Claude.ai and the MCP inspector fall back to dynamic registration. Adding them later changes nothing else.
- Sign-in stays with Supabase Auth: the consent page needs a signed-in person, exactly as every other page does (ADR 0003).
- If Supabase Auth gains custom scopes, audience binding and revocation, this can be looked at again; connections, being Access Keys, would not change for the people who made them.
