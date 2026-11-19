---
"@ziffr/web": minor
---

A Workflow's Approve step can now hold back every value, not only Unusual Values: choose **Every value** instead of **Unusual values only**. Each value then waits for the Approvers in order before it counts, from every channel, the API and Feeds included; a Feed's Imports of past periods still count at once. Existing Workflows keep approving Unusual Values only.
