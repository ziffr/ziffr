---
"@ziffr/web": patch
---

Webhooks, after a security review: the task-list templates for Microsoft To Do, Google Tasks, Asana, Planner and Todoist now take only the Tasks of the person named in a new `assigneeEmail` setting (fill it in when you import them again), a Task linked to an external task can still be closed from there after two weeks, a Webhook that is switched off keeps nothing waiting, the asker's notice of a reply through a Webhook says "via", and an Action has at most 10 links over all its Webhooks.
