---
"@ziffr/web": patch
---

Values that arrive at the same moment for one period now follow the Submission Rule exactly: under "Reject a second value" only the first is kept, under "Overwrite with the newer value" one replaces the other instead of both being stored, and under "Add up all values" every Breakdown row of both counts. Before, two such values could both be kept, or lose Breakdown rows.
