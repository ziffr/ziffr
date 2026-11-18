---
"@ziffr/web": patch
---

Derived Metrics are now worked out exactly: a formula such as `{revenue} - {cost}` gives 0.2 for 0.3 and 0.1, no longer 0.19999999999999998. A Derived Metric's quarter or year now shows wherever each of its inputs holds at least half of it, also when no month has a value of both, and one whose input is itself a Derived Metric says so instead of showing nothing.
