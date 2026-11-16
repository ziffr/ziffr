---
"@ziffr/web": minor
---

Self-hosters: Ziffr now runs with Docker in two commands, `curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/compose.yml -o compose.yml` and `docker compose up -d`, or with the installer `docker/install.sh`. The stack makes its own keys, applies migrations and calls the jobs itself, and gets HTTPS from Let's Encrypt when `ZIFFR_DOMAIN` is set; on a domain the demo is off unless `ZIFFR_DEMO=1` (docker/README.md). Each release publishes the image as `ghcr.io/ziffr/ziffr`. Installations with their own Supabase project can set `SUPABASE_ANON_KEY` instead of `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which still work.
