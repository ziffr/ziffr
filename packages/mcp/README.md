# @ziffr/mcp

A local [MCP](https://modelcontextprotocol.io) server that lets an AI assistant, such as Claude Desktop or Claude Code, read your [Ziffr](https://github.com/ziffr/ziffr) Metrics and submit values. It acts with an Access Key, so the assistant sees exactly what the key's creator sees and nothing more. MIT licensed.

## Setting it up

1. In Ziffr, open the Team page and create an Access Key. Give it "Read metrics", and "Submit values" only if the assistant should record values. Copy the key: it is shown once.
2. Add the server to your assistant with two settings: `ZIFFR_URL`, where your Ziffr runs, and `ZIFFR_ACCESS_KEY`, the key.

**Claude Code:**

```sh
claude mcp add ziffr --env ZIFFR_URL=https://ziffr.example.com --env ZIFFR_ACCESS_KEY=zk_... -- npx -y @ziffr/mcp
```

**Claude Desktop:** open Settings, Developer, Edit Config, and add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ziffr": {
      "command": "npx",
      "args": ["-y", "@ziffr/mcp"],
      "env": { "ZIFFR_URL": "https://ziffr.example.com", "ZIFFR_ACCESS_KEY": "zk_..." }
    }
  }
}
```

Restart the assistant, then ask it, for example, "What was revenue in March?" or "Record 42 orders for this month."

## What the assistant gets

| Tool | What it does |
| --- | --- |
| `list_metrics` | Every Metric the key may read: slug, name, period, unit, format, target |
| `get_metric` | One Metric's description and its values for a range of periods (at most the 500 newest) |
| `submit_value` | Records a value for the current or a named period, through the Metric's rules (Approvals, Locks) |
| `list_people` | The workspace's people and Contacts by id and name, to say who submitted a value |

Each Metric is also a read-only resource, `ziffr://metrics/{slug}`, that you can attach to a conversation so the assistant has its values in context.

## Safety

- The server runs on your computer and talks only to your Ziffr, over its API. It stores nothing.
- A read-only key (without "Submit values") cannot record anything, whatever the assistant tries.
- Every call shows in the key's Access Log on the Team page. Revoke the key there to cut the assistant off at once.
- Metric names and descriptions come from your workspace. Anyone who can name a Metric can put text in front of the assistant, so give it a read-only key unless it should submit values.
