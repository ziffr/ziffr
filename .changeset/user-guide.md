---
"@ziffr/web": minor
---

A user guide explains Ziffr in plain words: what it is and how it differs from business intelligence tools and data warehouses, its ideas, how it is built and connected, templates, everything you work with, getting started, and every word Ziffr uses, with links from each term to its meaning. Eight more chapters go through every screen and its options. Open it with the question mark in the top bar, or at /guide, also before signing in.

Self-hosters: the guide's chapters are Markdown files in `docs/user-guide`, read when a page is opened, so editing them changes no code. Set `ZIFFR_USER_GUIDE_URL` to send the link to a guide you keep elsewhere.

Developers: each screen chapter names the files of its screens. `pnpm test` fails when a page has no chapter, and a pull request that changes a screen must change its chapter (label `no-guide-change` when people see no difference).
