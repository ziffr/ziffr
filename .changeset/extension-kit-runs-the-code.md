---
"@ziffr/web": patch
---

Developers: `npx @ziffr/extension-kit check` now also runs an Extension's Method, in a process of its own with a time and memory limit: it must give the same answer twice, stay within its budget on 120 points of the worst inputs, refuse a flat, empty, short or non-numeric series in words, match its reference on hand-worked and generated inputs, run every branch of its code, and survive a mutation check. `--static` keeps the old, quick check.
