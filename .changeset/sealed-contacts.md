---
"@ziffr/web": patch
---

Contacts' names, email addresses, Slack handles and phone numbers are now stored encrypted with their Workspace's key on Installations with `ZIFFR_SECRETS_KEY`; an address or handle stays unique within the Workspace. Contacts added before stay readable and are encrypted later.
