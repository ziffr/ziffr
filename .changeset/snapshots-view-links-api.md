---
"@ziffr/web": minor
---

Programs can now read and take Snapshots: the API, the SDK and the MCP Server list a dashboard's Snapshots, read one with the values it kept and take a new one for a period that is over (as a draft you show in Ziffr). Programs can also make, list and revoke View Links to your dashboards through the API, with a new Access Key scope, Manage View Links. It is never ticked by default, only a program's key can hold it, an assistant cannot be given it and the MCP Server has no tool for it; a new link's address is shown once, in the answer that makes it.
