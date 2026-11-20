---
"@ziffr/web": patch
---

Webhooks now hear about Actions that close because their Metric was deleted, their assignee was removed, or their trial Workspace closed, so tasks in other tools close too. The daily send limit holds even when sends run at the same moment, and the database itself now refuses any change of an Action's state that does not come through the one function that tells the Webhooks.
