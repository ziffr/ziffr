---
"@ziffr/web": patch
---

A reply whose "Correction:" line has no number is now an ordinary reply and changes no value; before, it could be read as a correction to 0. The number belongs after the colon or alone on a line under it, and digits from further lines are no longer joined to it.
