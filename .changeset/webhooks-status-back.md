---
"@ziffr/web": minor
---

A task closed in another system can now report back to Ziffr through a Webhook: the Webhook's recipe says which external task an Action is, marks it done, replies, answers a Question or reopens it, signed with the Webhook's secret and attributed to it. The Action shows "Also in" that system, and what comes back appears in the Thread as "via" the Webhook. What a Webhook reports is not sent back to it; the other Webhooks hear it. Developers: `POST /api/webhooks/{id}/in`, 60 requests a minute per Webhook.
