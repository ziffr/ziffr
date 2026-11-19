---
"@ziffr/web": patch
---

Developers: `pnpm health` checks that nothing is unused (knip) and that code duplication stays under its ceiling (jscpd), and `pnpm lint` now holds every function to a complexity and length ceiling. CI runs both; CONTRIBUTING explains them. The Supabase CLI now comes with `pnpm install`.
