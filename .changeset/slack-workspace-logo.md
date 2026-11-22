---
"@ziffr/web": minor
---

Messages Ziffr sends to a Workspace's Slack now carry the Workspace's own name and logo instead of the Ziffr app's, once the Slack connection has the new `chat:write.customize` permission; Connectors offers **Reconnect Slack** for older connections, and nothing breaks without it. Self-hosters: the Slack app manifest gains that scope, and Ziffr's logo and the pictures for the Telegram bot and the Slack app are available to download from the Installation settings page and in `docs/brand`.
