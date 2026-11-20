---
"@ziffr/web": minor
---

Owners and Admins can ask their assistant what a teammate has to do in Ziffr, for example to cover for them or to see who is behind. The answer lists only Metrics they may see themselves. Developers: `GET /api/v1/schedule?person_id=…` and `my_schedule` with `person_id`. Anyone else naming a teammate gets 403.
