---
"@ziffr/web": patch
---

Changes and percentage changes in Comparisons, Attainment and the difference to a target are now worked out exactly, as quarters and years already are: 0.3 against 0.1 is a change of 0.2 and +200 %, no longer 0.19999999999999998 and 199.99999999999997 %. A Workflow check no longer calls a value unusual when it changed by exactly the allowed percentage (1.1 after 1 with 10 % allowed).
