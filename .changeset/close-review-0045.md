---
"@ziffr/web": patch
---

Someone removed from the Workspace is taken off the Workflow's checklist items and Send Snapshot step, so their item no longer holds a finished period back, and a Workflow's message still waiting out Quiet Hours is not sent once its Workflow is deleted. A Workflow Template with a Send Snapshot step must have a locking Publish step.
