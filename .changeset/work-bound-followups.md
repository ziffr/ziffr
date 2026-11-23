---
"@ziffr/web": patch
---

A Dashboard with several correlation widgets no longer starts refusing them ("Too much analysis on this Dashboard to work out at once") just because it was redrawn: each widget now uses the Dashboard's allowance of exact work once. The refusal now says Dashboard instead of page, the note about Metrics that were not compared says why (working them out exactly would take too long), and a Heads-up scan that ran out of work now counts the pairs it skipped in both kinds of Heads-up, so skipping never makes a Heads-up appear that a full scan would not show.
