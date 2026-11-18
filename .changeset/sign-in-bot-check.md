---
"@ziffr/web": minor
---

Self-hosters: with `ZIFFR_TURNSTILE_SITE_KEY` and `ZIFFR_TURNSTILE_SECRET` set, the sign-in form shows Cloudflare Turnstile and sends no link until the server has checked its answer with Cloudflare. For a public Ziffr, so bots cannot make it mail any address.
