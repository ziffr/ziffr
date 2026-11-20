---
"@ziffr/web": patch
---

Developers: an Action's state now changes in one place, whichever way it comes in (the app, the API, MCP, an email, Slack or Telegram reply, a Workflow step or a system close), so each change is one event even when two channels answer at once. Webhooks get signed, retried messages for them (with the Metric's words left out when Everyone cannot see it), and a Webhook that keeps failing is switched off with an email to the Owners.
