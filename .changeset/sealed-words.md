---
"@ziffr/web": minor
---

Dashboard introductions, Finding words, Snapshot words and Metric descriptions are now stored encrypted with the Workspace's key, and a View Link or Snapshot no longer carries a Metric's description (also for links made earlier; no view showed it). A Snapshot of a free layout no longer keeps the words of the widget the layout started from; only the layout's editor used them, so nothing a Snapshot shows changes. Self-hosters: old rows are encrypted by the re-encryption job.
