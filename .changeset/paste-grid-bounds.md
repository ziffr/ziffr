---
"@ziffr/web": patch
---

Paste values refuses a paste that spans too many cells before it builds the grid, so a paste with one very wide row costs the server almost nothing.
