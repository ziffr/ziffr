---
"@ziffr/web": patch
"@ziffr/mcp": patch
---

Numbers and period names in the assistant's inline views now read exactly as in the app: the Workspace's Number Style, "Q3 26" for a quarter and the Fiscal Year's start. The API's workspace answer carries the Number Style too. Developers: one small MIT package, `@ziffr/figures`, writes numbers and periods for the app, the MCP views and the emails.
