---
"@ziffr/web": minor
---

When a value needs Approval but nobody but its submitter could approve it, it no longer waits for ever. The Approve step has a new choice, **When nobody else can approve**: **let the submitter check it**, the default, also for existing Workflows, gives the submitter a task "Check your value: … Is that right?" with **Confirm** and **Correct**, recorded as confirmed by the submitter, never as approved; or **count it without approval**, which publishes it at once with a note. As soon as someone else can approve, they are asked as before. **Every value** now works in a Workspace of one person, such as a trial.
