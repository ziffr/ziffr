---
"@ziffr/web": minor
---

Self-hosters: every table now belongs to a Workspace and people get a Workspace Role through memberships; existing data moves into one workspace. Set `ZIFFR_SITE_URL` to where Ziffr is reached, and to offer sign-in providers list them in `ZIFFR_AUTH_PROVIDERS` (google, azure, github, linkedin_oidc) with their keys in `SUPABASE_AUTH_EXTERNAL_<PROVIDER>_CLIENT_ID` and `_SECRET`.
