---
"@ziffr/web": patch
---

Self-hosters: email confirmations are now required (supabase/config.toml, enable_confirmations = true); set the same in production, so a confirmed address is one the person controls. Only the email link and Google count as proving an address for invitations, domain joining and existing people.
