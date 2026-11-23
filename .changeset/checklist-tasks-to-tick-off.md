---
"@ziffr/web": minor
---

A Workflow's checklist item can now be one to tick off. Each period it gives its Assignee a Task about the Workflow and its period (no Metric), due a number of working days after the period ends and given to the item's Stand-in while the Assignee is Away. The Workflow's Remind and Escalate steps treat it as a missing value, once; the Assignee ticks it off with **Mark done**, with an optional note, by replying "done", through the API (`POST /api/v1/actions/{id}/done`) or the MCP Server (`mark_task_done`, which now take a `note`). It is in My schedule and your calendar, counts in the period's progress ("5 of 6 in", and `checklist: { done, of }` in the API), and is read only by the people on it, by Members unless the item keeps it to a Group, and by a Guest only when it is theirs. No Webhook hears of it.
