---
"@ziffr/web": patch
---

Self-hosters: trials are never deleted or closed when the Installation Settings cannot be read for a moment. The cleanup waits for its next run instead of guessing that trials are not to be kept.
