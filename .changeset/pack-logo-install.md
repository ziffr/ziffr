---
"@ziffr/web": minor
---

Installing a Pack that brings a logo keeps it with the install, checked again on the server, and a Theme of the Pack that says `"logo": "pack"` is installed with it. The installed Theme never becomes the team default on its own.

Self-hosters: the public address of a Theme's logo is now keyed with the Installation's secret, so changing `ZIFFR_SECRETS_KEY` changes every logo address (pictures in emails already sent may stop loading).
