---
"@ziffr/web": minor
---

A Trial Workspace can now add Webhooks (2 at most, 200 sends a day, to public addresses only), so a trial shows every way out of Ziffr; the Trial Guide's last step lists them. Self-hosters: the hosts in `ZIFFR_WEBHOOK_PRIVATE_HOSTS` never apply to a trial, and `ZIFFR_TRIAL_WEBHOOKS=false` (or Installation settings, Trials, Webhooks in trials) switches Webhooks off for trials.
