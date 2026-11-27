---
"@ziffr/web": patch
---

A Metric whose targets are set period by period (its Target Series) no longer reads "No target" in the Metrics list, the quick look and the Metric's page: they state the target for the latest value's period, and the on-target label and colour follow it. Where only other periods have a target, they say "Set for other periods".
