---
"@ziffr/web": patch
---

Pages and actions answer faster when signed in: Ziffr checks the session with Supabase once per click instead of three times. Developers: `pnpm prototype:fast` runs the production app locally, much faster to click through than `pnpm prototype`.
