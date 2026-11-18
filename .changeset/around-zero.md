---
"@ziffr/web": patch
---

Attainment is right for targets of 0 and below: a value better than a negative target is above 100 %, never "-Infinity%", and a target of 0 shows the difference to it instead. A value that rises or falls from 0 is now an Unusual Value. Attainment for "lower is better" now counts the distance to the target too, so a value of 5 against a target of at most 10 is 150 %, no longer 200 %.
