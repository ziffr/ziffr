---
"@ziffr/web": minor
---

A calculated Metric can now read another Metric's target: `target({commit}) - {commit}` is what is still missing, so a quota is set once as a target. It uses the period's Target Series value, else a Target Range with one bound, and shows nothing otherwise.
