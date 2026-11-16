---
"@ziffr/web": minor
---

Self-hosters: `ZIFFR_DEMO_ONLY=1` turns an Installation into a public demo: the login page offers only the demo, nobody can sign in or make an account, and with Docker Compose the demo starts fresh every night. Behind a reverse proxy of your own, set `ZIFFR_SITE_URL` and `ZIFFR_PROXY_HOPS` (docker/README.md). Developers: a new job, `POST /api/jobs/demo-reset`, resets the demo.
