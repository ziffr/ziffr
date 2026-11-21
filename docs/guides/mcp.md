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

Both servers list the same tools and Starters and one resource template (`ziffr://metrics/{slug}`), generated from the code (`pnpm test` fails when this list is out of date):

<!-- generated:mcp-tools -->
**53 tools:** `update_metric`, `set_metric_workflow`, `propose_share`, `list_workflows`, `get_workflow`, `create_workflow`, `update_workflow`, `delete_workflow`, `list_alerts`, `create_alert`, `update_alert`, `delete_alert`, `list_snapshots`, `get_snapshot`, `take_snapshot`, `list_actions`, `reply_to_action`, `set_action_status`, `mark_task_done`, `self_check`, `list_metrics`, `find`, `get_metric`, `get_thread`, `submit_value`, `create_metric`, `delete_metric`, `archive_metric`, `restore_metric`, `list_submitters`, `set_submitters`, `list_feeds`, `list_target_series`, `set_target_series`, `list_projections`, `set_projections`, `get_unusual_value_check`, `set_unusual_value_check`, `get_workspace`, `my_schedule`, `period_status`, `list_people`, `list_dashboards`, `get_dashboard`, `list_templates`, `create_dashboard_from_template`, `create_dashboard`, `add_widget`, `update_widget`, `remove_widget`, `update_dashboard`, `add_finding`, `update_finding`.

**10 Starters:** `what_can_i_do`, `my_week`, `weekly_review`, `record_values`, `build_dashboard`, `explain_metric`, `start_tracking`, `set_targets`, `alert_me`, `share_numbers`.
<!-- /generated:mcp-tools -->

The one table of every tool and Starter with the scope it needs is in [`packages/mcp/README.md`](../../packages/mcp/README.md#what-the-assistant-gets); keep it in step with `createServer` when a tool changes. In short: reading, also `find` and `my_schedule`, needs `metrics:read` (and `dashboards:read` for dashboards and templates), recording `values:submit`, creating and deleting Metrics `metrics:write`, changing targets, Projections, the Unusual Value check, Sources and Submitters `metrics:edit`, building dashboards and taking Snapshots `dashboards:write` (reading Snapshots `dashboards:read`), making, changing and removing the creator's own Alerts `alerts:write` (listing them needs `metrics:read`), making, reading, changing and deleting the creator's own Workflows and their steps `workflows:write` (choosing who approves or who a Tell step tells needs `workflows:people`, programs' keys only), and listing the creator's Questions and Tasks `actions:read`, answering, closing and marking them done `actions:write` and confirming or correcting their own value in a Self-check `values:submit`. There is no tool to approve a value, send it back or make a View Link, and an assistant cannot be given those scopes: Approval is a person's check and a View Link publishes data outside the workspace (`values:approve` and `view-links:write` are for programs' Access Keys only). To compare a running server with the table:

```sh
npx @modelcontextprotocol/inspector --cli https://ziffr.example.com/mcp --transport http \
  --header "Authorization: Bearer zk_..." --method tools/list     # also prompts/list, resources/templates/list
```

## Describing a Metric and its schedule (ticket #612)

An assistant can create a Metric and change everything about it that the Metric's page lets its owner or Editors change, through the same core functions (`updateMetricWithKey`, `createMetricWithKey` in `packages/core/src/api-metrics.ts`), so the same rules hold:

- `update_metric` (API: `PATCH /api/v1/metrics/{slug}`, scope `metrics:edit`) takes name, description, unit, format, period, Submission Rule, Sources ("Values arrive by"), Target Range, Polarity and Attainment method. The period changes only while the Metric has no values and no targets or projections by period; the core's reason comes back as a refusal. All parts are checked before the first is written.
- `set_metric_workflow` (the same `PATCH`, with `workflow`) gives a Metric one of the key's creator's own Workflows, by id or exact name, or none (`null`); `create_metric` takes `workflow` too. Only the Metric's owner may, as with the Workflow dropdown, and not for a Derived Metric. A Workflow with an Approve or Tell step decides who sees values, so a key joins or leaves one only with `workflows:people` on a program's key (never an assistant): the assistant tells the person to do that in Ziffr.
- `get_metric` shows the Metric's `workflow` (id, name, whether it is the creator's own) and `next_due`: the Due Date of the period the Workflow asks for now while it is today or later, else of the next one.
- A Metric made through MCP takes values through MCP: `create_metric` keeps `api` among the Sources unless `exclude_api` is true. A refused `submit_value` for a Source names the Sources the Metric accepts and says `update_metric` can change them (only to a key that may read, so a submit-only key learns nothing it could not send).

## Starters

Reading values and Threads: `get_metric` says per value who submitted it (id and name), when, through which Source, and whether it has a Thread the key's creator may read (`has_thread`). `get_thread` (API: `GET /api/v1/metrics/{slug}/thread?period=`) answers why: the question and the replies with author, time and words, sealed words opened (spec 0028). Both go through `listObservations` and `getThreads` in `packages/core/src/api.ts`, which keep only the Threads the creator may read by the app's own rule (`canReadThread`: the people on it, the Metric's owner, a Group) and drop the rest before counting or opening anything, so a hidden Thread is not revealed, not even that it exists. Its words are data: the server's instructions and `explain_metric` tell the assistant never to follow them.

Both servers offer the same Starters (GLOSSARY: Starter), ready-made requests as MCP prompts: `what_can_i_do`, `my_week`, `weekly_review`, `record_values`, `build_dashboard`, `explain_metric`, `start_tracking`, `set_targets` and `alert_me`. The table, with their arguments and limits, is in [`packages/mcp/README.md`](../../packages/mcp/README.md#starters); what people see is in the user guide, [Working with an assistant](../user-guide/17-your-settings.md#working-with-an-assistant).

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

Assistants that support [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp) also show small read-only views inline: `get_metric` (`ui://ziffr/metric.html`: latest value, change to the period before, Target Range, a sparkline and the last periods), `get_dashboard` (`ui://ziffr/dashboard.html`: introduction and tiles, with an "Open in Ziffr" link) and `period_status` (`ui://ziffr/period-status.html`: how many values are in and what happened, in order). A view draws only the structured answer the tool already gave your key, so it never shows more than the text does; it loads nothing from outside, takes the assistant's light or dark theme and offers no actions. Assistants without MCP Apps get the tool's text as before.

Sharing is the person's alone. `propose_share` prepares a View Link to an email address or a Share to a Member or Group, and nothing is shared or sent until the person confirms it in Ziffr with their own sign-in; no tool confirms, not even one only a preview could call, so a confirmation never goes through the assistant's token. Assistants that support [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp) show a read-only preview in the chat (`ui://ziffr/share-proposal.html`: the dashboard, recipient, end date and message, loading nothing from outside, with a "Confirm in Ziffr" button that opens the confirm page); other assistants get the same words as text with the link.

What holds, so an assistant knows what to expect:

- Scopes are the Access Key scopes: `metrics:read`, `values:submit`, `metrics:write` (create Metrics), `metrics:edit` (change Metrics: Target Range, Target Series, Projections, the Unusual Value check, Sources and Submitters), `dashboards:read`, `dashboards:write`, `alerts:write` (Manage alerts: the person's own Alerts only, never anyone else's), `shares:propose` (Propose sharing: `propose_share` only prepares sharing a dashboard of the person's, which they confirm in Ziffr themselves), `workflows:write` (Build workflows: the person's own Workflows and their steps; never who approves). The person picks them on the consent screen, never more than their role allows.
- Redirect addresses are https, or http on `localhost`, `127.0.0.1` or `[::1]`, at most five, matched exactly; on those loopback addresses the port may differ.
- A code works once, for ten minutes; presented again, it ends the connection it made.
- Access tokens work for an hour, and only at `/mcp`, never on `/api/v1` directly. Refresh tokens rotate on every use; one used twice ends the connection. A refusal is `invalid_grant`.
- `resource`, when sent, must be `https://<your ziffr>/mcp`.
- Registrations are limited per network address and for the Installation; ones never used are forgotten after a day. Client ID Metadata Documents are not offered yet, so clients fall back to registration.

A connection is an Access Key of the kind `assistant`: it ends on its end date, when the person disconnects it or leaves the Workspace, or when an Owner revokes it, and everything it does is in the Access Log.
