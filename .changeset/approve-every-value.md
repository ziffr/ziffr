---
"@ziffr/web": minor
---

A Workflow's Approve step can now hold back every value, not only Unusual Values: choose **Every value** instead of **Unusual values only**. Each value then waits for the Approvers in order before it counts, from every channel, the API and Feeds included. A Feed's Imports of history still count at once; its value for the period being closed waits. If the submitter is the only Approver, the Workflow's owner approves instead. Existing Workflows keep approving Unusual Values only.
