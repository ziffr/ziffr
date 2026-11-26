---
"@ziffr/web": patch
---

CSV files you download from Ziffr now open in Excel with umlauts and other letters shown rightly: they start with a UTF-8 byte-order mark. A program of your own that reads such a file should skip that mark.
