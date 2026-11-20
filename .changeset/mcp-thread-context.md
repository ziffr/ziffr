---
"@ziffr/web": minor
---

An assistant connected through the MCP Server, and programs using the API, can now see who submitted a value, when and through which Source, and read the Thread on it (a new `get_thread` tool and `GET /api/v1/metrics/{slug}/thread`), so it can answer why a number is what it is. They see only the Threads the key's creator may read.
