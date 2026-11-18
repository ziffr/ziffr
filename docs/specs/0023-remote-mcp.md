# 0023 Remote MCP Server: Claude.ai and other web assistants connect to Ziffr

**Status:** done. **Tracking issue:** #137 (label `tracking`); tickets #138 to #142 carry `spec:0023`. Starts after spec 0022.

## Problem Statement

Ziffr's MCP Server (`@ziffr/mcp`, specs 0002 and 0014) runs on the person's own computer and talks to Ziffr with an Access Key they paste in. That works for Claude Desktop, Claude Code and similar programs. It does not work for assistants that run in the browser or in the cloud: Claude.ai, Claude on a phone, and other web clients. They connect to an MCP server by its address, through the internet, and sign in with OAuth. They cannot start a local program, and a person should not paste a long-lived secret into them. So today the most used assistants cannot reach Ziffr at all.

## Solution

Every Ziffr Installation serves its MCP Server at an address of its own, `https://<ziffr>/mcp`, over MCP's Streamable HTTP transport. A person adds that address as a connector in Claude.ai (or any client that speaks remote MCP), signs in to Ziffr in the window that opens, picks the Workspace and what the assistant may do, and confirms. From then on the assistant has the same tools and resources as the local server, limited exactly like an Access Key with those scopes. The person sees the connection under **Connected assistants** in their settings and can end it at any time; Owners see and can end every connection in their Workspace.

## User Stories

1. As someone using Claude.ai, I want to add Ziffr as a connector by its address and sign in, so that I can ask about my numbers without installing anything.
2. As them, I want to choose the Workspace and whether the assistant may only read, also send values, or also build dashboards, so that it can do no more than I allow.
3. As them, I want to see which assistants are connected, when each was last used, and end one, so that I stay in control.
4. As an Owner, I want to see and end every assistant connected to my Workspace, and see what each did in the Access Log, so that nothing reaches our numbers unseen.
5. As a person who leaves a Workspace, I want every connection I made to stop at once, as my Access Keys do.
6. As a self-hoster, I want the remote MCP Server to work on my Installation with no extra service and no outside account, and to be able to turn it off.
7. As someone on Claude Desktop, I want to keep using `@ziffr/mcp` with an Access Key, or use the remote address instead.
8. As a developer, I want the local and the remote server to offer exactly the same tools, so that a tool is written once.

## Implementation Decisions

- **One set of tools.** `@ziffr/mcp` exports the function that builds the server from a `Ziffr` SDK client (it does today). The remote endpoint builds the same server per request with an SDK client that holds the connection's token, so every tool still goes through the API and the core's checks. The SDK client's requests are handed to the API's own route handlers in the same process (no second trip through the network, no internal address to configure), so each still passes the key check, the limit and the Access Log. Nothing in the remote path reads the database directly. A test lists both servers' tools and fails when they differ.
- **Transport.** `POST /mcp` with Streamable HTTP, stateless (no session kept between requests), JSON responses. `GET /mcp` answers `405`: a stateless server has no stream to offer, which the transport allows. The endpoint refuses an `Origin` header that is not Ziffr's own with `403` (browsers send one; Claude.ai's servers and the inspector's proxy do not) and answers `401` with `WWW-Authenticate: Bearer resource_metadata="…"` when there is no valid token. It takes an assistant's access token or an Access Key, so Claude Desktop and other clients that send a fixed header can use the address with a key too.
- **OAuth 2.1, with Ziffr as its own authorization server.** This follows the MCP authorization spec:
  - protected resource metadata (RFC 9728) at `/.well-known/oauth-protected-resource`, and authorization server metadata (RFC 8414) at `/.well-known/oauth-authorization-server`;
  - dynamic client registration (RFC 7591) at `/oauth/register`, with limits per network address and for the Installation as a whole, and registrations that are never used expire after a day. Client ID Metadata Documents are left out for now (ADR 0011): Claude.ai and the inspector fall back to registration;
  - the authorization code flow with PKCE (S256 only) at `/oauth/authorize` and `/oauth/token`; refresh tokens rotate on every use, and a reused one ends the connection;
  - revocation at `/oauth/revoke`;
  - redirect addresses must be https (or `http://localhost` or `http://127.0.0.1` for programs on the person's computer) and match exactly; for those two loopback addresses the port may differ, as RFC 8252 asks and Claude Code needs;
  - the `resource` (RFC 8707), when sent, must be this Installation's `/mcp`; access tokens work only there, never on `/api/v1` directly;
  - only hashes of codes and tokens are stored; a code works once, for ten minutes.

  Supabase Auth's own OAuth server was checked in ticket 1 and is not used (ADR 0011): its tokens are the person's whole session, it has no custom scopes, no revocation endpoint and no audience. Ziffr's own endpoints are built on the core.
- **The consent screen** is a Ziffr page. An error in the request is shown there and never redirected to the assistant on its own, since anyone can register a redirect address (RFC 9700, 4.11.2). It needs the person signed in, and shows the client's name as it registered and its redirect address. It lets the person pick one Workspace and the scopes (the Access Key scopes `metrics:read`, `values:submit`, `metrics:write`, `dashboards:read`, `dashboards:write`, never more than their role allows, as for Access Keys) and the end date (90 days by default). The client's name is untrusted text: it is shown as given, marked as "says it is".
- **A connection is an Access Key.** What a confirmed connection holds is stored as an Access Key of kind `assistant`: bound to the person and one Workspace, with its scopes and end date, hashed tokens only, the same Access Log. So every rule that limits Access Keys holds for connections without a second implementation: ending with the person's membership, Owners revoking, the API limits. Access tokens live one hour; the refresh token carries the connection.
- **Settings.** **Connected assistants** in the person's settings lists their connections (client name, Workspace, scopes, made, last used, ends) with **Disconnect**. The Workspace's Access Keys page shows connections next to keys for Owners and Admins. Connecting and disconnecting are audited.
- **A setting for self-hosters.** `ZIFFR_REMOTE_MCP` (on by default where `ZIFFR_SITE_URL` is https, off otherwise) turns the endpoint and the OAuth routes on. The shared demo offers no connections. A Trial Workspace may connect one assistant, which ends with the trial (spec 0021).
- **Docs.** The Connectors page and the user guide show the address to paste into Claude.ai, with the steps. `docs/guides/mcp.md` covers both ways. The threat model gains the OAuth endpoints and the consent screen as entry points. A new glossary term is not needed: a connection is an Access Key of the kind `assistant`, and the glossary entry says so.

## Testing Decisions

- The OAuth flow end to end against the database: registration, authorize with consent, the code exchanged once with the right PKCE verifier, refusing a wrong verifier, an expired code, a reused code, a redirect address that does not match, a refresh token used twice (the connection ends), revocation.
- The MCP endpoint: no token gives 401 with the metadata link; a token of a connection that ended, of a person who left, or of another Workspace reaches nothing; scopes limit tools exactly as for Access Keys (shared test table with the local server).
- Same tools both ways: the tool list of the local and the remote server is equal.
- A conformance run with the MCP inspector against a running Installation, and a real connection from Claude.ai through the dev tunnel, before the spec is done.
- A security review of the whole spec against the threat model before it is done.

How these were met (ticket #142): the OAuth flow, the endpoint and the shared tool list are database tests (`assistant-connections.db.test.ts`, `apps/web/src/app/mcp/route.db.test.ts`, `apps/web/src/app/oauth/oauth.db.test.ts`). The MCP inspector's CLI ran against a running app with an Access Key and with an access token from a real consent in the browser. The security review is in the pull requests of #141 and #142 and in the threat model. **The real connection from Claude.ai needs the owner's Claude account and the dev tunnel, so it is left to the owner**, with the steps in `docs/guides/mcp.md` (Connecting Claude.ai); if it shows a problem, it is fixed in a ticket of its own.

## Tickets

1. #138 Check whether Supabase Auth's OAuth server fits; the ADR either way.
2. #139 The remote endpoint at `/mcp`, the shared server, the setting.
3. #140 OAuth: metadata, registration, authorize, token, refresh, revoke; connections as Access Keys of kind `assistant`.
4. #141 The consent screen and **Connected assistants** in settings; Owners' view; audit.
5. #142 Docs, threat model, the demo and trials, a security review, and trying it with Claude.ai.

## Out of Scope

- Ziffr signing in to other services through MCP (Ziffr as an MCP client).
- Listing Ziffr in a directory of connectors.
- Tools beyond what the local server has today.

## Further Notes

- The local server stays: some people and companies prefer a key they control, and it works without a public address.
