---
"@ziffr/web": minor
---

An Owner or Admin can have their Workspace's own usage as Metrics: a new Access Key scope, "Read usage figures" (programs only, never an assistant), opens `GET /api/v1/usage` with counts of views, values by Source and what goes unused; the Usage Feed's new `--workspace` mode sends them into the Workspace, and the new Workspace usage Pack brings the Metrics and a dashboard. Counts only, never who looked or a name, and only what the key's creator sees; values, views and Submitters stay out while fewer than three people are in the Workspace.
