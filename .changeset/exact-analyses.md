---
"@ziffr/web": patch
---

The forecast and correlations are now worked out exactly, so a forecast no longer differs from the exact one in its last decimals (247.03835 was 247.03834999999998, shown as 247.0383 at four decimals). Charts in a PowerPoint export round values the way the app does: 1.005 at two decimals is 1.01, no longer 1, and −0.125 is −0.13. The CSV export writes very small values with their decimals.
