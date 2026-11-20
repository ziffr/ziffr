# Ziffr's MCP Server

Ziffr's MCP Server lets an AI assistant read the Metrics a person may see, submit values and build dashboards, with exactly that person's rights and no more (GLOSSARY: MCP Server). There are two ways to reach it, with the same tools and Starters:

- **On your own computer:** `@ziffr/mcp`, started by the assistant (Claude Desktop, Claude Code), with an Access Key you make under **Workspace → Access Keys**. See [`packages/mcp/README.md`](../../packages/mcp/README.md). Works with any Ziffr, also one without a public address.
- **At your Ziffr's address:** `https://<your ziffr>/mcp`, for assistants that connect over the internet, such as Claude.ai. You sign in to Ziffr in the window that opens and choose what the assistant may do. Nothing to install, and no secret to paste (spec 0023).

## Connecting Claude.ai

1. Your Ziffr must be reached over https, with `ZIFFR_REMOTE_MCP` not set to `0`. The Connectors page then shows the address, such as `https://ziffr.example.com/mcp`.
2. In Claude.ai: **Settings → Connectors → Add custom connector**. Give it a name (`Ziffr`) and the address. Leave the advanced OAuth fields (client id and secret) empty: Claude registers itself.
3. Press **Connect**. A window with Ziffr opens. Sign in if asked, then on **Connect an assistant to Ziffr?** check that it returns you to `claude.ai`, pick the Workspace, what Claude may do and until when, and press **Connect**.
4. Claude shows Ziffr as connected. In a chat, turn the connector on and ask, for example, "What were orders last month in Ziffr?".
5. In Ziffr, **Settings → Connected assistants** lists it; **Disconnect** ends it. Removing the connector in Claude stops Claude from using it; disconnect it in Ziffr as well to end the connection there.

Claude's mobile apps use the connectors added on claude.ai. Claude Code can use the address too: `claude mcp add --transport http ziffr https://ziffr.example.com/mcp`, then `/mcp` in Claude Code to sign in; it returns to `http://localhost:<port>/callback`, which Ziffr accepts on any port.

### Trying it before your Ziffr is public

Claude.ai reaches your Ziffr from Anthropic's servers (`160.79.104.0/21`), so `localhost` does not work. Run the app with `ZIFFR_SITE_URL` set to a public https address that forwards to it, such as a tunnel, and `ZIFFR_REMOTE_MCP=1`, then follow the steps above with that address. To check the server without Claude, use the MCP inspector:

```sh
npx @modelcontextprotocol/inspector                       # opens a browser; pick Streamable HTTP and the /mcp address, then Connect
npx @modelcontextprotocol/inspector --cli https://ziffr.example.com/mcp --transport http \
  --header "Authorization: Bearer zk_..." --method tools/list   # with an Access Key, no sign-in
```

## Tools and scopes

Both servers list the same 30 tools, 8 Starters and one resource template (`ziffr://metrics/{slug}`). The one table of every tool and Starter with the scope it needs is in [`packages/mcp/README.md`](../../packages/mcp/README.md#what-the-assistant-gets); keep it in step with `createServer` when a tool changes. In short: reading, also `find` and `my_schedule`, needs `metrics:read` (and `dashboards:read` for dashboards and templates), recording `values:submit`, creating and deleting Metrics `metrics:write`, changing targets, Projections, the Unusual Value check, Sources and Submitters `metrics:edit`, building dashboards `dashboards:write`. To compare a running server with the table:

```sh
npx @modelcontextprotocol/inspector --cli https://ziffr.example.com/mcp --transport http \
  --header "Authorization: Bearer zk_..." --method tools/list     # also prompts/list, resources/templates/list
```

## Starters

Both servers offer the same Starters (GLOSSARY: Starter), ready-made requests as MCP prompts: `what_can_i_do`, `my_week`, `weekly_review`, `record_values`, `build_dashboard`, `explain_metric`, `start_tracking` and `set_targets`. The table, with their arguments and limits, is in [`packages/mcp/README.md`](../../packages/mcp/README.md#starters); what people see is in the user guide, [Working with an assistant](../user-guide/17-your-settings.md#working-with-an-assistant).

- They are registered in `createServer` (`packages/mcp/src/server.ts`), so `/mcp` gets them with the tools; `apps/web/src/app/mcp/route.db.test.ts` checks that both servers list and fill them in alike.
- A Starter calls nothing itself. `prompts/get` returns one user message; the assistant then uses the tools, with the credential's scopes, like for any request.
- Arguments come from the client, so treat them like workspace text: each is limited in length (refused with `InvalidParams` when longer), flattened to one line and quoted with `JSON.stringify` inside the text, followed by what to take from it. Quoting makes injected instructions harder to follow, not impossible: the credential's scopes are the limit, so a Starter that changes something always asks the user to confirm first. Keep it that way when you add one, and end its text with the shared safety lines.

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

- Scopes are the Access Key scopes: `metrics:read`, `values:submit`, `metrics:write` (create Metrics), `metrics:edit` (change Metrics: Target Range, Target Series, Projections, the Unusual Value check, Sources and Submitters), `dashboards:read`, `dashboards:write`. The person picks them on the consent screen, never more than their role allows.
- Redirect addresses are https, or http on `localhost`, `127.0.0.1` or `[::1]`, at most five, matched exactly; on those loopback addresses the port may differ.
- A code works once, for ten minutes; presented again, it ends the connection it made.
- Access tokens work for an hour, and only at `/mcp`, never on `/api/v1` directly. Refresh tokens rotate on every use; one used twice ends the connection. A refusal is `invalid_grant`.
- `resource`, when sent, must be `https://<your ziffr>/mcp`.
- Registrations are limited per network address and for the Installation; ones never used are forgotten after a day. Client ID Metadata Documents are not offered yet, so clients fall back to registration.

A connection is an Access Key of the kind `assistant`: it ends on its end date, when the person disconnects it or leaves the Workspace, or when an Owner revokes it, and everything it does is in the Access Log.
