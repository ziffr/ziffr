---
"@ziffr/web": minor
---

On hosted Ziffr a trial that is not subscribed to closes and is deleted after its grace days: there is no Free Size. (An Installation that is not hosted Ziffr and chose `ZIFFR_TRIAL_THEN=keep` for the trials it already has keeps them.) Its Owner is reminded three days before, a day before and as it ends, each time with the two ways on (subscribe, or take the Workspace Export and run Ziffr yourself) and the day of the deletion. Cancelling a Size now closes the Workspace the same way, with an email to its Owner (Ziffr Cloud calls the new `POST /api/cloud/v1/workspaces/{id}/cancel`, and `.../reopen` to undo it during the grace days); people whose only Workspace it is are told the day it goes. A View Link made in a trial gets the end date you picked back when you subscribe.
