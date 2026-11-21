---
"@ziffr/web": minor
---

Self-hosters: how long logs are kept, the days over a Workspace Limit, a trial's days after its end and the wait before an unused Workspace is deleted are now Installation Settings, each with a range and a plain explanation: the Audit Log 365 to 3,650 days (a warning below two years, and never fewer days than a Retention or an Approval still refers to), the log of calls by key, the Webhook send log, View Counts and the nightly Retention budget. On Ziffr Cloud the Workspace Limits, grace values, trial days and the unused-Workspace wait are fixed by Ziffr Cloud and shown as such. The page also warns while `ZIFFR_INBOUND_AUTHSERV_ID` is empty: replies by email are then accepted by address alone.
