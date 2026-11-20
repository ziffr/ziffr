---
"@ziffr/web": minor
---

Sign-in links now go out through Ziffr's own mail settings, also a mail server saved on the Installation settings page, and replies by email are set up there too: the page makes the signing secret for your provider, shows the MX record the domain needs, and tests a real reply. Self-hosters: Docker sets up sign-in links through Ziffr by itself; with your own Supabase project, add the Send Email hook and `ZIFFR_AUTH_HOOK_SECRET` as the self-hosting guide says.
