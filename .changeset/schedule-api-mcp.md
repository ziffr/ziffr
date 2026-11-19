---
"@ziffr/web": minor
---

Ask your assistant "What do I have to do in Ziffr this week?": the MCP Server's new tool `my_schedule` and the Starter **What do I have to do this week?** list the values you must submit by their Due Dates, the Approvals waiting for you and your Tasks and Questions, overdue first, each with its link. Developers: the same Schedule is `GET /api/v1/schedule` (scope `metrics:read`) and `schedule()` in `@ziffr/sdk`.
