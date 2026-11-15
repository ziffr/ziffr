# @ziffr/mcp

A local [MCP](https://modelcontextprotocol.io) server that lets an AI assistant, such as Claude Desktop or Claude Code, read your [Ziffr](https://github.com/ziffr/ziffr) Metrics, submit values and build dashboards and stories. It acts with an Access Key, so the assistant sees exactly what the key's creator sees and nothing more. MIT licensed.

## Setting it up

1. In Ziffr, open the Team page and create an Access Key. Give it "Read metrics", "Submit values" only if the assistant should record values, "Create metrics" only if it should start new Metrics, and "Read dashboards and stories" and "Build dashboards and stories" only if it should build them. Copy the key: it is shown once.
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

Restart the assistant, then ask it, for example, "What was revenue in March?", "Record 42 orders for this month", "Start tracking weekly signups", or "Make a dashboard for revenue from the one-metric template."

## What the assistant gets

| Tool | What it does |
| --- | --- |
| `list_metrics` | Every Metric the key may read: slug, name, period, unit, format, target |
| `get_metric` | One Metric's description and its values for a range of periods (at most the 500 newest) |
| `submit_value` | Records a value for the current or a named period, through the Metric's rules (Approvals, Locks) |
| `create_metric` | Creates a Metric owned by the key's creator, when you ask for one (needs "Create metrics") |
| `list_people` | The workspace's people and Contacts by id and name, to say who submitted a value |
| `list_dashboards`, `get_dashboard` | The dashboards and stories the key's creator sees, with their widgets and the Metrics they draw (needs "Read dashboards and stories") |
| `list_templates` | Built-in views, the team's Widget Templates and the Dashboard Templates, with their Slots |
| `create_dashboard_from_template` | A whole dashboard from a Dashboard Template in one call, one Metric per Slot (needs "Build dashboards and stories") |
| `create_dashboard`, `add_widget`, `update_widget`, `remove_widget` | An empty dashboard or story, and its widgets, placed in the first free spot |
| `update_story`, `add_finding`, `update_finding` | A story's title and introduction, and its Findings with their words, as a draft for you to finish |

Each Metric is also a read-only resource, `ziffr://metrics/{slug}`, that you can attach to a conversation so the assistant has its values in context.

## Safety

- The server runs on your computer and talks only to your Ziffr, over its API. It stores nothing.
- A read-only key (without "Submit values" or "Create metrics") cannot record or create anything, whatever the assistant tries.
- Every call shows in the key's Access Log on the Team page. Revoke the key there to cut the assistant off at once.
- Metric names and descriptions come from your workspace. Anyone who can name a Metric can put text in front of the assistant, so give it a read-only key unless it should submit values.
- A key with "Build dashboards and stories" changes only dashboards and stories you may change yourself. It can never share, delete a dashboard, make a View Link or pick a theme, and it makes at most 50 new dashboards and 500 changes a day. Every change is in the dashboard's history under the key's name, so you can restore what came before.
