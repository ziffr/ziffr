---
"@ziffr/web": minor
---

You can now start a new Workspace from a Workspace Export file on a Ziffr you run yourself (New workspace, From a Workspace Export). Ziffr checks the whole file first, imports it as a job with a progress page, seals everything again under the new Workspace's own key, and deletes it again if anything fails. The people in the file wait on the Members page as invitations that nobody has sent until you press Invite everyone. Self-hosters: a new migration; ZIFFR_IMPORT_MAX_FILE_MB and ZIFFR_IMPORT_MAX_TEXT_MB set the size limits.
