---
"@ziffr/web": patch
---

A value a hair below its target, such as 1 · 10^-20 under a target of 0.00017, is no longer shown as on target: whether a value is on target is now decided on the exact difference, not on the rounded Attainment. A correlation no longer counts a period twice when a Metric was given two values for it; it uses the latest one, as charts do. A Workflow check never calls an unchanged value unusual. Developers: every calculation module is now mutation-tested with Stryker on pull requests that change it, every night and before each release, and must keep a score of at least 95 %.
