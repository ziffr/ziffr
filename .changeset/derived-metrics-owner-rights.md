---
"@ziffr/web": patch
---

A Metric calculated from other Metrics (made in the new-Metric flow or through MCP) now shows no values, no comparisons and no spans while its owner no longer owns or edits one of the Metrics it is calculated from, and its page says why. It shows its values again once they may share it. Calculated Metrics made before, from a Pack or in the demo, are not affected.
