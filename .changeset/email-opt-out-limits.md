---
"@ziffr/web": minor
---

Every request for a number and every reminder by email has a one-click link to stop them (also in the mail client's unsubscribe button); the Metric owners are told, and the person can turn them on again on the Connectors page. A workspace sends at most 500 emails a day, one inbox gets at most 20 an hour and one person causes at most 300 a day, from all workspaces together; the rest wait. The Outbox no longer shows the sender of a request other people's form links. The Connectors page says when email is real. Self-hosters: run the new migration, and see `docs/guides/email.md` for setting up sending and replies.
