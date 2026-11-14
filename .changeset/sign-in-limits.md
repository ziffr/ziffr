---
"@ziffr/web": patch
---

Self-hosters: Ziffr now limits sign-in links itself, whatever Supabase's settings say: an hour allows 5 per address from one network address, 30 per address and 20 per network address. Set `ZIFFR_PROXY_HOPS` (usually `1`) to the number of proxies in front of Ziffr so it can tell network addresses apart.
