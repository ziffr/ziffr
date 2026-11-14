---
"@ziffr/web": patch
---

Charts, the Metrics list and the API no longer leave out the newest values once a workspace has many of them, and Breakdowns no longer go missing on Metrics with a long history. Self-hosters: keep Max Rows in your Supabase project's API settings at 1000 or more.
