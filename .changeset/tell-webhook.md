---
"@ziffr/web": minor
---

A Workflow's **Tell** step can now name a Webhook. Owners and Admins can add one in the Workflow editor, and the Webhook gets an `alert.fired` message (Metric, period, value, target, condition and a link) once per crossing, only for a Metric shared with Everyone. Your own Alerts never go to a Webhook.
