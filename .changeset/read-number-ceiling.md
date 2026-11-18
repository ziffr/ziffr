---
"@ziffr/web": patch
---

A typed value just above the largest one Ziffr takes, such as 1,000,000,000,000,000.01, is now refused like any larger one instead of being read as 10^15.
