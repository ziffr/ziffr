# Ziffr's MCP Server

Ziffr's MCP Server lets an AI assistant read the Metrics a person may see, submit values and build dashboards, with exactly that person's rights and no more (GLOSSARY: MCP Server). There are two ways to reach it, with the same tools:

- **On your own computer:** `@ziffr/mcp`, started by the assistant (Claude Desktop, Claude Code), with an Access Key you make on the Team page. See [`packages/mcp/README.md`](../../packages/mcp/README.md). Works with any Ziffr, also one without a public address.
- **At your Ziffr's address:** `https://<your ziffr>/mcp`, for assistants that connect over the internet, such as Claude.ai. You sign in to Ziffr in the window that opens and choose what the assistant may do. Nothing to install, and no secret to paste (spec 0023).

## The remote server

`/mcp` speaks MCP's Streamable HTTP transport, stateless: each `POST` carries MCP messages and gets JSON back; `GET` and `DELETE` answer 405. Every request needs `Authorization: Bearer <credential>`:

- an assistant's access token from Ziffr's OAuth sign-in (below), or
- an Access Key, for clients that send a fixed header: `claude mcp add --transport http ziffr https://ziffr.example.com/mcp --header "Authorization: Bearer zk_..."`.

Each tool calls the API inside Ziffr, so a connection is limited, logged in the Access Log and checked exactly like an Access Key with the same scopes. A request from a browser page on another site (an `Origin` other than Ziffr's own) gets 403.

It is on where `ZIFFR_SITE_URL` is https and off otherwise; `ZIFFR_REMOTE_MCP=1` or `0` decides (see the [self-hosting guide](self-hosting.md)). While it is off, `/mcp` and the OAuth endpoints answer 404.

## Signing in assistants (OAuth 2.1)

Ziffr is its own authorization server (ADR 0011), following the [MCP authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization). An assistant finds everything from the 401 that `/mcp` answers without a token:

| Address | What it is |
| --- | --- |
| `/.well-known/oauth-protected-resource/mcp` (and without `/mcp`) | Protected resource metadata (RFC 9728): the resource `https://<your ziffr>/mcp` and its authorization server |
| `/.well-known/oauth-authorization-server` | Authorization server metadata (RFC 8414) |
| `POST /oauth/register` | Dynamic client registration (RFC 7591), JSON. Public clients only: the answer's `token_endpoint_auth_method` is always `none` |
| `/oauth/authorize` | The consent screen: the person signs in, picks the Workspace, what the assistant may do and until when |
| `POST /oauth/token` | The code with its PKCE verifier (S256 only), or a refresh token, form-encoded |
| `POST /oauth/revoke` | Ends the connection with either token (RFC 7009) |

What holds, so an assistant knows what to expect:

- Scopes are the Access Key scopes: `metrics:read`, `values:submit`, `metrics:write`, `dashboards:read`, `dashboards:write`. The person picks them on the consent screen, never more than their role allows.
- Redirect addresses are https, or http on `localhost`, `127.0.0.1` or `[::1]`, at most five, matched exactly; on those loopback addresses the port may differ.
- A code works once, for ten minutes; presented again, it ends the connection it made.
- Access tokens work for an hour, and only at `/mcp`, never on `/api/v1` directly. Refresh tokens rotate on every use; one used twice ends the connection. A refusal is `invalid_grant`.
- `resource`, when sent, must be `https://<your ziffr>/mcp`.
- Registrations are limited per network address and for the Installation; ones never used are forgotten after a day. Client ID Metadata Documents are not offered yet, so clients fall back to registration.

A connection is an Access Key of the kind `assistant`: it ends on its end date, when the person disconnects it or leaves the Workspace, or when an Owner revokes it, and everything it does is in the Access Log.
